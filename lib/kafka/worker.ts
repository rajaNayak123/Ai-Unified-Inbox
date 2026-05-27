import "dotenv/config";
import Groq from "groq-sdk";
import { z } from "zod";
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
        try {
          return JSON.parse(text.replace(/```json|```/g, "").trim());
        } catch (parseErr) {
          console.warn(`[worker] JSON parse attempt ${attempt}/${retries} failed:`, parseErr);
          if (attempt === retries) {
            return {};
          }
        }
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
      if (attempt === retries) {
        if (jsonMode) return {};
        throw err;
      }
    }
  }
  return jsonMode ? {} : "";
}

// Zod validation schemas for bulletproof API responses
const analysisSchema = z.object({
  classification: z.object({
    label: z.enum(["urgent", "todo", "fyi"]),
    reason: z.string().max(150).optional().default(""),
  }).default({ label: "fyi", reason: "" }),
  summary: z.string().default("No summary available."),
  actions: z.array(
    z.object({
      task: z.string(),
      deadline: z.string().nullable().default(null),
    })
  ).default([]),
});

const draftSchema = z.object({
  draft: z.string().default(""),
});

async function analyzeMessage(msg: any) {
  let result: any = null;
  try {
    result = await callGroq(
      "llama-3.3-70b-versatile",
      `You are an expert AI system specialized in high-accuracy message analysis for email and Slack communications.
Your job is to analyze the incoming message and execute three tasks with absolute precision:

1. CLASSIFICATION:
   Classify the message into EXACTLY one of these three categories:
   - "urgent": Action is required immediately or requires a reply within 24 hours (e.g., system outages, critical client issues, scheduling changes for today/tomorrow, explicit high-priority requests).
   - "todo": Action is required, but it is not time-critical (e.g., standard tasks, feature requests, reading reviews, low-priority follow-ups).
   - "fyi": Purely informational, informational updates, receipts, notifications, chat chatter, or newsletters. No action is required.
   Provide a highly concise reasoning of 10 words or fewer explaining the classification.

2. ONE-SENTENCE SUMMARY:
   Summarize the entire message in EXACTLY one sentence of maximum 15 words.
   - Do NOT use filler words like "This email is about..." or "The sender is...".
   - Be extremely specific: identify the sender/organization, the core topic/request, and any mentioned deadlines.
   - Example format: "[Sender] requested [deliverable] by [deadline]."

3. ACTION ITEM EXTRACTION:
   Extract all concrete tasks, action items, todos, explicit requests, or commitments.
   - Each action item must be actionable, concise, and start with an imperative verb (e.g., "Review the PR", "Schedule kickoff meeting").
   - Extract the associated deadline ONLY if it is explicitly stated or can be unambiguously inferred. Format it clearly (e.g., "Friday at 5pm", "2026-06-01") or set to null if there is no deadline.
   - If there are no action items in the message, return an empty array [].

CRITICAL: You must respond ONLY with a valid JSON object matching the exact schema below. Do not include any conversational filler, introductory remarks, markdown codeblock wraps (except JSON), or explanations.

Response Schema:
{
  "classification": {
    "label": "urgent" | "todo" | "fyi",
    "reason": "reason under 10 words"
  },
  "summary": "precise 1-sentence summary under 15 words",
  "actions": [
    {
      "task": "imperative action description",
      "deadline": "deadline string or null"
    }
  ]
}`,
      `From: ${msg.from || ""}\nSource: ${msg.source || ""}\nSubject: ${msg.subject || ""}\nBody: ${(msg.body || "").slice(0, 2000)}`
    );
  } catch (groqErr) {
    console.error("[worker] Groq analysis call failed:", groqErr);
  }

  // Parse validation with Zod and apply safe fallbacks
  const parsed = analysisSchema.safeParse(result);
  const data = parsed.success ? parsed.data : {
    classification: { label: "fyi" as const, reason: "AI fallback due to parse error" },
    summary: msg.subject || "New message received",
    actions: [],
  };

  const label = data.classification.label.toUpperCase() as "URGENT" | "TODO" | "FYI";
  const reason = data.classification.reason || "";
  const summary = data.summary;
  const actions = data.actions;

  return {
    classification: { label, reason },
    summary,
    actions,
  };
}

async function draftReply(msg: any): Promise<string> {
  let result: any = null;
  try {
    result = await callGroq(
      "llama-3.1-8b-instant", // replaced decommissioned mixtral-8x7b-32768
      `Write a concise, helpful reply draft (under 80 words).
Match the tone of the original. No filler openers. Be specific and actionable.
Respond with valid JSON only: { "draft": "the reply text here" }`,
      `From: ${msg.from}\nSource: ${msg.source}\nSubject: ${
        msg.subject || ""
      }\nOriginal:\n${(msg.body || "").slice(0, 3000)}`
    );
  } catch (groqErr) {
    console.error("[worker] Groq draftReply call failed:", groqErr);
  }

  const parsed = draftSchema.safeParse(result);
  return parsed.success ? parsed.data.draft : "";
}

async function draftReplyAndSave(messageId: string, userId: string, raw: any) {
  try {
    const draftBody = await draftReply(raw);
    if (draftBody) {
      const updated = await db.message.update({
        where: { id: messageId },
        data: {
          draft: {
            create: {
              userId,
              body: draftBody,
              status: "PENDING",
            },
          },
        },
        include: { draft: true, actionItems: true },
      });
      emitToUser(userId, "message:new", JSON.parse(JSON.stringify(updated)));
      console.log(`[worker] Background draft generated and emitted for message ${messageId}`);
    }
  } catch (err) {
    console.error(`[worker] Error in background draftReplyAndSave for ${messageId}:`, err);
  }
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

  // 2. Run AI agent
  const { classification, summary, actions } = await analyzeMessage(raw);

  // 3. Persist core enriched data (classification, summary, action items) immediately
  const updated = await db.message.update({
    where: { id: message.id },
    data: {
      label: classification.label,
      summary,
      isRead: false,
      ...(actions.length > 0 && {
        actionItems: {
          createMany: {
            data: actions.map((a: any) => ({
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

  // 4. Push core-enriched message to the browser immediately (non-blocking)
  emitToUser(userId, "message:new", JSON.parse(JSON.stringify(updated)));
  console.log(
    `[worker] Core analysis done: [${classification.label}] ${subject || "(no subject)"}`
  );

  // 5. Asynchronously draft a reply (non-blocking) in the background
  if (classification.label !== "FYI") {
    draftReplyAndSave(message.id, userId, raw).catch((err) =>
      console.error(`[worker] Background drafting failed for ${message.id}:`, err)
    );
  }
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

  const { classification, summary, actions } = await analyzeMessage(raw);

  const updated = await db.message.update({
    where: { id: msg.id },
    data: {
      label: classification.label,
      summary,
      isRead: false,
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
    `[worker] Reprocessed core analysis: [${classification.label}] ${
      msg.subject || "(no subject)"
    }`
  );

  if (classification.label !== "FYI") {
    draftReplyAndSave(msg.id, msg.userId, raw).catch((err) =>
      console.error(`[worker] Background reprocess draft failed for ${msg.id}:`, err)
    );
  }
}

function pLimit(concurrency: number) {
  const queue: Array<() => void> = [];
  let activeCount = 0;

  const next = () => {
    activeCount--;
    if (queue.length > 0) {
      queue.shift()!();
    }
  };

  return <T>(fn: () => Promise<T>): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const run = async () => {
        activeCount++;
        try {
          const result = await fn();
          resolve(result);
        } catch (err) {
          reject(err);
        } finally {
          next();
        }
      };

      if (activeCount < concurrency) {
        run();
      } else {
        queue.push(run);
      }
    });
  };
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

  const limit = pLimit(3);
  const tasks = stuck.map((msg) =>
    limit(async () => {
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
    })
  );

  await Promise.all(tasks);
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
