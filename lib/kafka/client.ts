import { Kafka, logLevel, Producer } from "kafkajs";

const isConfluent = !!process.env.KAFKA_USERNAME;

const replicationFactor = process.env.KAFKA_REPLICATION_FACTOR
  ? parseInt(process.env.KAFKA_REPLICATION_FACTOR, 10)
  : (process.env.NODE_ENV === "production" || isConfluent ? 3 : 1);

const kafka = new Kafka({
  clientId: "unified-inbox",
  brokers: [process.env.KAFKA_BROKER || "localhost:9092"],
  logLevel: logLevel.WARN,
  ...(isConfluent && {
    ssl: true,
    sasl: {
      mechanism: "plain",
      username: process.env.KAFKA_USERNAME || "",
      password: process.env.KAFKA_PASSWORD || "",
    },
  }),
});

interface GlobalKafka {
  producer?: Producer;
  producerPromise?: Promise<void>;
}

const globalForKafka = globalThis as unknown as GlobalKafka;

const producer = globalForKafka.producer ?? kafka.producer();

if (process.env.NODE_ENV !== "production") {
  globalForKafka.producer = producer;
}

const TOPICS = {
  RAW: "inbox.raw",
  CLASSIFIED: "inbox.classified",
  ACTIONS: "inbox.actions",
  DRAFTS: "inbox.drafts",
};

async function ensureTopics() {
  const admin = kafka.admin();
  await admin.connect();
  const existing = await admin.listTopics();
  const toCreate = Object.values(TOPICS)
    .filter((t) => !existing.includes(t))
    .map((topic) => ({ topic, numPartitions: 3, replicationFactor }));

  if (toCreate.length > 0) {
    await admin.createTopics({ topics: toCreate });
    console.log(
      "Kafka topics created:",
      toCreate.map((t) => t.topic).join(", ")
    );
  } else {
    console.log("Kafka topics already exist");
  }
  await admin.disconnect();
}

async function connectProducer() {
  if (!globalForKafka.producerPromise) {
    globalForKafka.producerPromise = producer.connect().catch((err) => {
      globalForKafka.producerPromise = undefined; // clear promise on error so retry works
      throw err;
    });
  }
  return globalForKafka.producerPromise;
}

async function publishMessage(topic: string, key: string, value: any) {
  await connectProducer();
  await producer.send({
    topic,
    messages: [{ key: String(key), value: JSON.stringify(value) }],
  });
}

export { kafka, producer, TOPICS, ensureTopics, publishMessage };

