import "dotenv/config";
import Groq from "groq-sdk";
import { z } from "zod";
import { Kafka, logLevel } from "kafkajs";
import { createServer } from "http";
import { Server as IOServer } from "socket.io";
import { PrismaClient, Prisma } from "@prisma/client";

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
  DLQ: "inbox.dlq",
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

const producer = kafka.producer();

const httpServer = createServer();
const io = new IOServer(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

io.on("connection", (socket) => {
  socket.on("subscribe", (userId: string) => {
    socket.join(`user:${userId}`);
    console.log(`[WS] ${socket.id} subscribed to user ${userId}`);
  });

  socket.on("action:toggle", async ({ actionId, userId, done }: { actionId: string; userId: string; done: boolean }) => {
    try {
      const action = await db.actionItem.update({
        where: { id: actionId, userId },
        data: { done },
      });
      io.to(`user:${userId}`).emit("action:updated", action);
      console.log(`[WS] Action ${actionId} toggled to ${done} for user ${userId}`);
    } catch (err) {
      console.error(`[WS] Failed to toggle action ${actionId}:`, err);
    }
  });

  // Broadcast draft-sent state to all open tabs for the same user
  socket.on("draft:sent", ({ draftId, messageId, userId }: { draftId: string; messageId: string; userId: string }) => {
    io.to(`user:${userId}`).emit("draft:sent", { draftId, messageId });
    console.log(`[WS] Draft ${draftId} sent — notifying all tabs for user ${userId}`);
  });

  // Broadcast draft-discarded state to all open tabs for the same user
  socket.on("draft:discarded", ({ draftId, userId }: { draftId: string; userId: string }) => {
    io.to(`user:${userId}`).emit("draft:discarded", { draftId });
    console.log(`[WS] Draft ${draftId} discarded — notifying all tabs for user ${userId}`);
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

async function sendToDLQ(payload: any, error: any) {
  try {
    const dlqMessage = {
      originalPayload: payload,
      error: {
        message: error?.message || String(error),
        stack: error?.stack || null,
      },
      failedAt: new Date().toISOString(),
    };

    await producer.send({
      topic: TOPICS.DLQ,
      messages: [
        {
          key: payload.externalId || null,
          value: JSON.stringify(dlqMessage),
        },
      ],
    });
    console.log(`[worker] Redirected failed message ${payload.externalId || "unknown"} to DLQ topic: ${TOPICS.DLQ}`);
  } catch (dlqErr) {
    console.error("[worker] Failed to publish message to DLQ:", dlqErr);
  }
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
          // Extract matching opening { and closing } to ignore outer conversational preambles/markdown wraps
          const start = text.indexOf("{");
          const end = text.lastIndexOf("}");
          if (start !== -1 && end !== -1 && end > start) {
            return JSON.parse(text.substring(start, end + 1));
          }
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
      `You are an elite, highly professional executive assistant. Your task is to write a concise, precise, and helpful email/Slack reply draft on behalf of the user.

Adhere strictly to the following rules:
1. CONCISENESS & LENGTH: Keep the reply under 80 words. Every sentence must add direct value.
2. TONE & STYLE: Analyze the sender's tone (formal, casual, cooperative, or urgent) and mirror it perfectly, maintaining executive-level professionalism and courtesy.
3. NO FILLER OR PLATITUDES: Do NOT begin with conversational filler or generic openers (such as "I hope this finds you well", "Thank you for your message", or "Just following up"). Start immediately with the core response in the very first sentence.
4. SPECIFIC & ACTIONABLE: Directly address the sender's inquiries, acknowledge critical points, and outline clear, actionable next steps or decisions.
5. CONTEXTUAL PLACEHOLDERS: Use logical placeholders (e.g., "[Your Name]", "[Date/Time]", "[Link]") for any information that is context-dependent or unknown.

CRITICAL: Respond ONLY with a valid JSON object matching the exact schema below. Do not include any introductory remarks, explanations, or raw markdown formatting wraps (except JSON).

Response Schema:
{
  "draft": "The complete, polished reply body text"
}`,
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
      retryCount: 1,
    },
    include: { draft: true, actionItems: true },
  });

  emitToUser(userId, "message:new", JSON.parse(JSON.stringify(message)));

  try {
    // 2. Run AI message analysis and reply drafting concurrently in parallel (saves 40-50% latency)
    const [analysis, draftBody] = await Promise.all([
      analyzeMessage(raw),
      draftReply(raw),
    ]);

    const { classification, summary, actions } = analysis;

    // 3. Persist core enriched data and the draft atomically inside a single transaction
    const updated = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      // Update core message details
      await tx.message.update({
        where: { id: message.id },
        data: {
          label: classification.label,
          summary,
          isRead: false,
        },
      });

      // Create the draft if classification is not FYI and draft body exists
      if (classification.label !== "FYI" && draftBody) {
        await tx.draft.upsert({
          where: { messageId: message.id },
          update: {
            body: draftBody,
            status: "PENDING",
          },
          create: {
            messageId: message.id,
            userId,
            body: draftBody,
            status: "PENDING",
          },
        });
      }

      // Create action items if present
      if (actions.length > 0) {
        await tx.actionItem.createMany({
          data: actions.map((a: any) => ({
            messageId: message.id,
            userId,
            task: a.task,
            deadline: a.deadline || null,
          })),
        });
      }

      // Fetch and return the fully populated message
      return await tx.message.findUniqueOrThrow({
        where: { id: message.id },
        include: { draft: true, actionItems: true },
      });
    });

    // 4. Push the fully enriched message to the browser in a single update
    emitToUser(userId, "message:new", JSON.parse(JSON.stringify(updated)));
    console.log(
      `[worker] Fully processed: [${classification.label}] ${subject || "(no subject)"}`
    );
  } catch (processingErr) {
    console.error(`[worker] Processing error for message ${message.id}:`, processingErr);
    // Publish message payload and error metrics directly to DLQ topic
    await sendToDLQ(raw, processingErr);
    try {
      // Gracefully transition message to a fallback FYI state so UI doesn't spin forever
      const failedMessage = await db.message.update({
        where: { id: message.id },
        data: {
          label: "FYI",
          summary: "Error: AI analysis failed to process this message.",
        },
        include: { draft: true, actionItems: true },
      });
      emitToUser(userId, "message:new", JSON.parse(JSON.stringify(failedMessage)));
    } catch (dbErr) {
      console.error(`[worker] Failed to record failed message state for ${message.id}:`, dbErr);
    }
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

  try {
    // Run AI analysis and reply drafting concurrently in parallel (saves 40-50% latency)
    const [analysis, draftBody] = await Promise.all([
      analyzeMessage(raw),
      draftReply(raw),
    ]);

    const { classification, summary, actions } = analysis;

    const updated = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.message.update({
        where: { id: msg.id },
        data: {
          label: classification.label,
          summary,
          isRead: false,
        },
      });

      if (classification.label !== "FYI" && draftBody) {
        await tx.draft.upsert({
          where: { messageId: msg.id },
          update: {
            body: draftBody,
            status: "PENDING",
          },
          create: {
            messageId: msg.id,
            userId: msg.userId,
            body: draftBody,
            status: "PENDING",
          },
        });
      }

      if (actions.length > 0) {
        await tx.actionItem.createMany({
          data: actions.map((a: any) => ({
            messageId: msg.id,
            userId: msg.userId,
            task: a.task,
            deadline: a.deadline || null,
          })),
        });
      }

      return await tx.message.findUniqueOrThrow({
        where: { id: msg.id },
        include: { draft: true, actionItems: true },
      });
    });

    emitToUser(msg.userId, "message:new", JSON.parse(JSON.stringify(updated)));
    console.log(
      `[worker] Reprocessed fully: [${classification.label}] ${
        msg.subject || "(no subject)"
      }`
    );
  } catch (processingErr) {
    console.error(`[worker] Reprocessing error for message ${msg.id}:`, processingErr);
    await sendToDLQ(raw, processingErr);
    try {
      const failedMessage = await db.message.update({
        where: { id: msg.id },
        data: {
          label: "FYI",
          summary: "Error: Reprocessing failed.",
        },
        include: { draft: true, actionItems: true },
      });
      emitToUser(msg.userId, "message:new", JSON.parse(JSON.stringify(failedMessage)));
    } catch (dbErr) {
      console.error(`[worker] Failed to record reprocess failed state for ${msg.id}:`, dbErr);
    }
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
      permanentlyStuck.map((m: any) => m.externalId).join(", ")
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
  const tasks = stuck.map((msg: any) =>
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
  await producer.connect(); // Connect Kafka producer for Dead-Letter Queue (DLQ)
  await consumer.subscribe({ topic: TOPICS.RAW, fromBeginning: true });

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

  // Reprocess any messages that got stuck as UNPROCESSED on previous runs
  await reprocessStuck();
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
