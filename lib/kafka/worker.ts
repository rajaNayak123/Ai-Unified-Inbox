import "dotenv/config";
import Groq from "groq-sdk";
import { z } from "zod";
import { Kafka, logLevel } from "kafkajs";
import { createServer } from "http";
import { Server as IOServer } from "socket.io";
import { PrismaClient, Prisma } from "@prisma/client";
import { analyzeMessageAgent, replyDrafterAgent } from "../groq/agents";
import { pLimit } from "../utils/pLimit";

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

async function ensureTopics() {
  const replicationFactor = isConfluent ? 3 : 1;
  const admin = kafka.admin();
  await admin.connect();
  try {
    const existing = await admin.listTopics();
    const toCreate = Object.values(TOPICS)
      .filter((t) => !existing.includes(t))
      .map((topic) => ({ topic, numPartitions: 3, replicationFactor }));
    if (toCreate.length > 0) {
      await admin.createTopics({ topics: toCreate });
      console.log("[worker] Kafka topics created:", toCreate.map((t) => t.topic).join(", "));
    } else {
      console.log("[worker] Kafka topics already exist.");
    }
  } finally {
    await admin.disconnect();
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
      retryCount: 1,
    },
    include: { draft: true, actionItems: true },
  });

  emitToUser(userId, "message:new", JSON.parse(JSON.stringify(message)));

  try {
    // 2. Run AI message analysis and reply drafting concurrently in parallel (saves 40-50% latency)
    const [analysis, draftBody] = await Promise.all([
      analyzeMessageAgent(raw),
      replyDrafterAgent(raw),
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
      analyzeMessageAgent(raw),
      replyDrafterAgent(raw),
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
    // Resolve permanently stuck messages so the UI doesn't spin forever
    await db.message.updateMany({
      where: { label: "UNPROCESSED", retryCount: { gte: 3 } },
      data: {
        label: "FYI",
        summary: "Processing failed after maximum retries.",
      },
    });
    // Notify connected browsers so they update without a page reload
    for (const msg of permanentlyStuck) {
      emitToUser(msg.userId, "message:new", {
        ...msg,
        label: "FYI",
        summary: "Processing failed after maximum retries.",
      });
    }
    console.log(`[worker] Resolved ${permanentlyStuck.length} permanently stuck messages to FYI.`);
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
  await ensureTopics();    // Guarantee all topics exist before subscribing (required on Confluent Cloud)
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
