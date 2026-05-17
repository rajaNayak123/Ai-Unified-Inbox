import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Helper function to call groq
async function callGroq(
  model: string,
  systemPrompt: string,
  userContent: string,
  jsonMode = true
) {
  const res = await groq.chat.completions.create({
    model,
    max_tokens: 1024,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    ...(jsonMode && { response_format: { type: "json_object" } }),
  });
  const text = res.choices[0].message.content || (jsonMode ? "{}" : "");
  if (jsonMode) {
    try {
      return JSON.parse(text);
    } catch {
      const cleaned = text.replace(/```json|```/g, "").trim();
      return JSON.parse(cleaned);
    }
  }
  return text;
}

// Agent 1: Classifier
async function classifierAgent({ subject = "", body = "", source = "" }) {
  const result = await callGroq(
    "llama-3.3-70b-versatile",
    `You are an email/Slack message classifier. Classify the message into EXACTLY one label:
- "urgent": needs immediate attention or reply within 24h
- "todo": action required but not time-critical
- "fyi": informational only, no action needed

Respond with valid JSON only: { "label": "urgent" | "todo" | "fyi", "reason": "<10 words why>" }`,
    `Source: ${source}\nSubject: ${subject}\nBody: ${body.slice(0, 2000)}`
  );
  return {
    label: (result.label || "fyi").toUpperCase(),
    reason: result.reason || "",
  };
}

// Agent 2: Action Detector
async function actionDetectorAgent({ subject = "", body = "" }) {
  const result = await callGroq(
    "llama-3.3-70b-versatile",
    `You are a task extractor. Extract all action items, todos, deadlines, or explicit requests from the message.
If there are no action items, return an empty array.
Respond with valid JSON only: { "actions": [ { "task": "string", "deadline": "string or null" } ] }`,
    `Subject: ${subject}\nBody: ${body.slice(0, 2000)}`
  );
  return Array.isArray(result.actions) ? result.actions : [];
}

// Agent 3: Reply Drafter
async function replyDrafterAgent({
  subject = "",
  body = "",
  from = "",
  source = "",
}) {
  const result = await callGroq(
    "mixtral-8x7b-32768",
    `You are a professional assistant that writes concise, helpful reply drafts.
Rules:
- Under 80 words
- Match the tone of the original (formal if formal, casual if casual)
- Do NOT start with "I hope this message finds you well" or similar filler
- Do NOT include a subject line
- Be specific and actionable
Respond with valid JSON only: { "draft": "the reply text here" }`,
    `From: ${from}\nSource: ${source}\nSubject: ${subject}\nOriginal:\n${body.slice(
      0,
      3000
    )}`
  );
  return result.draft || "";
}

// Agent 4: Summarizer
async function summarizerAgent({ subject = "", body = "", from = "" }) {
  const result = await callGroq(
    "gemma2-9b-it",
    `Summarize the message in ONE sentence of maximum 15 words. Be specific — include who, what, and any deadline if present.
Respond with valid JSON only: { "summary": "one sentence here" }`,
    `From: ${from}\nSubject: ${subject}\nBody: ${body.slice(0, 1500)}`
  );
  return result.summary || "No summary available.";
}

export {
  classifierAgent,
  actionDetectorAgent,
  replyDrafterAgent,
  summarizerAgent,
};
