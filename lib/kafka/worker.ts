import "dotenv/config";
import Groq from "groq-sdk";
import { Kafka, logLevel } from "kafkajs";
import { createServer } from "http";
import { Server as IOServer } from "socket.io";
import { PrismaClient } from "../../src/generated/prisma/index.js";

const KAFKA_BROKER = process.env.KAFKA_BROKER || "localhost:9092";
const KAFKA_USERNAME = process.env.KAFKA_USERNAME || "";
const KAFKA_PASSWORD = process.env.KAFKA_PASSWORD || "";
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const WS_PORT = Number(process.env.WS_PORT || 3001);

const TOPICS = {
  RAW: "inbox.raw",
  CLASSIFIED: "inbox.classified",
  ACTIONS: "inbox.actions",
  DRAFTS: "inbox.drafts",
};

const db = new PrismaClient({ log: ["error"] });
const groq = new Groq({ apiKey: GROQ_API_KEY });

const isConfluent = !!KAFKA_USERNAME;
const kafka = new Kafka({
  clientId: "unified-inbox-worker",
  brokers: [KAFKA_BROKER],
  logLevel: logLevel.WARN,
  ...(isConfluent && {
    ssl: true,
    sasl: {
      mechanism: "plain",
      username: KAFKA_USERNAME,
      password: KAFKA_PASSWORD,
    },
  }),
});

const httpServer = createServer();
const io = new IOServer(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

io.on("connection", (socket) => {
  socket.on("subscribe", (userId: string) => {
    socket.join(`user:${userId}`);
    console.log(`[WS] ${socket.id} subscribed to user ${userId}`);
  });

  socket.on("disconnect", () => {
    console.log(`[WS] ${socket.id} disconnected`);
  });
});

function emitToUser(userId: string, event: string, data: unknown) {
  io.to(`user:${userId}`).emit(event, data);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGroq(
  model: string,
  system: string,
  userContent: string,
  jsonMode = true,
  retries = 5
): Promise<any> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await groq.chat.completions.create({
        model,
        max_tokens: 1024,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent },
        ],
        ...(jsonMode && { response_format: { type: "json_object" } }),
      });
      const text = res.choices[0].message.content || (jsonMode ? "{}" : "");
      if (!jsonMode) return text;
      try {
        return JSON.parse(text);
      } catch {
        return JSON.parse(text.replace(/```json|```/g, "").trim());
      }
    } catch (err: any) {
      const isRateLimit = err?.status === 429;
      if (isRateLimit && attempt < retries) {
        // Parse retry-after from headers if available, else back off exponentially
        const retryAfterSec = Number(err?.headers?.["retry-after"] || 0);
        const waitMs =
          retryAfterSec > 0 ? retryAfterSec * 1000 + 200 : attempt * 2000;
        console.warn(
          `[worker] Rate limited. Waiting ${waitMs}ms before retry ${attempt}/${retries}...`
        );
        await sleep(waitMs);
        continue;
      }
      throw err;
    }
  }
}

async function classifyMessage(msg: any) {
  const result = await callGroq(
    "llama-3.3-70b-versatile",
    `You are an email/Slack message classifier. Classify into EXACTLY one label:
- "urgent": needs immediate attention or reply within 24h
- "todo": action required but not time-critical
- "fyi": informational only, no action needed
Respond with valid JSON only: { "label": "urgent"|"todo"|"fyi", "reason": "<10 words why>" }`,
    `Source: ${msg.source}\nSubject: ${msg.subject || ""}\nBody: ${(
      msg.body || ""
    ).slice(0, 2000)}`
  );
  return {
    label: (result.label || "fyi").toUpperCase() as "URGENT" | "TODO" | "FYI",
    reason: result.reason || "",
  };
}

async function summarizeMessage(msg: any): Promise<string> {
  const result = await callGroq(
    "llama-3.1-8b-instant", // replaced decommissioned gemma2-9b-it
    `Summarize in ONE sentence of max 15 words. Include who, what, deadline if present.
Respond with valid JSON only: { "summary": "one sentence here" }`,
    `From: ${msg.from}\nSubject: ${msg.subject || ""}\nBody: ${(
      msg.body || ""
    ).slice(0, 1500)}`
  );
  return result.summary || "No summary available.";
}

async function extractActions(
  msg: any
): Promise<Array<{ task: string; deadline: string | null }>> {
  const result = await callGroq(
    "llama-3.3-70b-versatile",
    `Extract all action items, todos, deadlines, explicit requests.
If none, return empty array.
Respond with valid JSON only: { "actions": [ { "task": "string", "deadline": "string or null" } ] }`,
    `Subject: ${msg.subject || ""}\nBody: ${(msg.body || "").slice(0, 2000)}`
  );
  return Array.isArray(result.actions) ? result.actions : [];
}

async function draftReply(msg: any): Promise<string> {
  const result = await callGroq(
    "llama-3.1-8b-instant", // replaced decommissioned mixtral-8x7b-32768
    `Write a concise, helpful reply draft (under 80 words).
Match the tone of the original. No filler openers. Be specific and actionable.
Respond with valid JSON only: { "draft": "the reply text here" }`,
    `From: ${msg.from}\nSource: ${msg.source}\nSubject: ${
      msg.subject || ""
    }\nOriginal:\n${(msg.body || "").slice(0, 3000)}`
  );
  return result.draft || "";
}

// ─── Core pipeline (new messages from Kafka) ──────────────────────────────────
async function processRawMessage(raw: any) {
  const {
    userId,
    externalId,
    source,
    from,
    subject,
    body,
    threadId,
    receivedAt,
  } = raw;

  // Idempotency guard — skip if already in DB
  const existing = await db.message.findUnique({ where: { externalId } });
  if (existing) {
    console.log(`[worker] Already processed ${externalId}, skipping.`);
    return;
  }

  console.log(`[worker] Processing: ${subject || body?.slice(0, 60)}`);

  // 1. Save immediately as UNPROCESSED so the UI shows a spinner
  const message = await db.message.create({
    data: {
      externalId,
      source,
      userId,
      from,
      subject: subject || null,
      body: body || "",
      threadId: threadId || null,
      label: "UNPROCESSED",
      receivedAt: new Date(receivedAt),
    },
    include: { draft: true, actionItems: true },
  });

  emitToUser(userId, "message:new", JSON.parse(JSON.stringify(message)));

  // 2. Run AI agents concurrently
  const [classification, summary, actions] = await Promise.all([
    classifyMessage(raw),
    summarizeMessage(raw),
    extractActions(raw),
  ]);

  // 3. Draft a reply only for URGENT / TODO
  let draftBody = "";
  if (classification.label !== "FYI") {
    draftBody = await draftReply(raw);
  }

  // 4. Persist enriched data
  const updated = await db.message.update({
    where: { id: message.id },
    data: {
      label: classification.label,
      summary,
      isRead: false,
      ...(draftBody && {
        draft: {
          create: {
            userId,
            body: draftBody,
            status: "PENDING",
          },
        },
      }),
      ...(actions.length > 0 && {
        actionItems: {
          createMany: {
            data: actions.map((a) => ({
              userId,
              task: a.task,
              deadline: a.deadline || null,
            })),
          },
        },
      }),
    },
    include: { draft: true, actionItems: true },
  });

  // 5. Push fully-enriched message to the browser
  emitToUser(userId, "message:new", JSON.parse(JSON.stringify(updated)));
  console.log(
    `[worker] Done: [${classification.label}] ${subject || "(no subject)"}`
  );
}

// Reprocess stuck UNPROCESSED messages already in DB
async function processExistingMessage(msg: any) {
  console.log(
    `[worker] Reprocessing: ${msg.subject || msg.body?.slice(0, 60)}`
  );

  const raw = {
    userId: msg.userId,
    externalId: msg.externalId,
    source: msg.source,
    from: msg.from,
    subject: msg.subject,
    body: msg.body,
    threadId: msg.threadId,
    receivedAt: msg.receivedAt,
  };

  const [classification, summary, actions] = await Promise.all([
    classifyMessage(raw),
    summarizeMessage(raw),
    extractActions(raw),
  ]);

  let draftBody = "";
  if (classification.label !== "FYI") {
    draftBody = await draftReply(raw);
  }

  const updated = await db.message.update({
    where: { id: msg.id },
    data: {
      label: classification.label,
      summary,
      isRead: false,
      ...(draftBody && {
        draft: {
          create: {
            userId: msg.userId,
            body: draftBody,
            status: "PENDING",
          },
        },
      }),
      ...(actions.length > 0 && {
        actionItems: {
          createMany: {
            data: actions.map((a: any) => ({
              userId: msg.userId,
              task: a.task,
              deadline: a.deadline || null,
            })),
          },
        },
      }),
    },
    include: { draft: true, actionItems: true },
  });

  emitToUser(msg.userId, "message:new", JSON.parse(JSON.stringify(updated)));
  console.log(
    `[worker] Reprocessed: [${classification.label}] ${
      msg.subject || "(no subject)"
    }`
  );
}

async function reprocessStuck() {
  const stuck = await db.message.findMany({
    where: {
      label: "UNPROCESSED",
      retryCount: { lt: 3 },
    },
  });

  const permanentlyStuck = await db.message.findMany({
    where: {
      label: "UNPROCESSED",
      retryCount: { gte: 3 },
    },
  });

  if (permanentlyStuck.length > 0) {
    console.warn(
      `[worker] Found ${permanentlyStuck.length} permanently stuck messages (max retries reached):`,
      permanentlyStuck.map((m) => m.externalId).join(", ")
    );
  }

  if (stuck.length === 0) {
    console.log("[worker] No stuck messages to reprocess.");
    return;
  }

  console.log(
    `[worker] Reprocessing ${stuck.length} stuck UNPROCESSED messages...`
  );
  for (const msg of stuck) {
    try {
      // Increment retry count before processing to guard against crash loops
      await db.message.update({
        where: { id: msg.id },
        data: { retryCount: { increment: 1 } },
      });

      await processExistingMessage(msg);
      // Pause between messages to stay within Groq TPM limits
      await sleep(1500);
    } catch (err) {
      console.error(`[worker] Failed to reprocess ${msg.externalId}:`, err);
    }
  }
  console.log("[worker] Finished reprocessing stuck messages.");
}

// Kafka consumer
async function startConsumer() {
  const consumer = kafka.consumer({ groupId: "inbox-processor" });
  await consumer.connect();
  await consumer.subscribe({ topic: TOPICS.RAW, fromBeginning: true });

  // Reprocess any messages that got stuck as UNPROCESSED on previous runs
  await reprocessStuck();

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      try {
        const payload = JSON.parse(message.value.toString());
        await processRawMessage(payload);
      } catch (err) {
        console.error("[worker] Error processing message:", err);
      }
    },
  });

  console.log(`[worker] Kafka consumer listening on topic: ${TOPICS.RAW}`);
}

async function main() {
  httpServer.listen(WS_PORT, () => {
    console.log(`[worker] Socket.IO server on port ${WS_PORT}`);
  });

  await startConsumer();
  console.log("[worker] Ready.");
}

main().catch((err) => {
  console.error("[worker] Fatal error:", err);
  process.exit(1);
});
