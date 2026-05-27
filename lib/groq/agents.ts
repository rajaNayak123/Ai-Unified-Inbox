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

// Unified Message Analyzer Agent (Combines Classifier, Action Detector, and Summarizer)
async function analyzeMessageAgent({ subject = "", body = "", source = "", from = "" }) {
  const result = await callGroq(
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
    `From: ${from}\nSource: ${source}\nSubject: ${subject}\nBody: ${body.slice(0, 2000)}`
  );

  const rawLabel = result?.classification?.label || "fyi";
  const label = rawLabel.toUpperCase();
  const reason = result?.classification?.reason || "";
  const summary = result?.summary || "No summary available.";
  const actions = Array.isArray(result?.actions) ? result.actions : [];

  return {
    classification: { label, reason },
    summary,
    actions,
  };
}

// Legacy wrappers for backward compatibility
async function classifierAgent({ subject = "", body = "", source = "" }) {
  const result = await analyzeMessageAgent({ subject, body, source });
  return result.classification;
}

async function actionDetectorAgent({ subject = "", body = "" }) {
  const result = await analyzeMessageAgent({ subject, body });
  return result.actions;
}

// Agent 3: Reply Drafter
async function replyDrafterAgent({
  subject = "",
  body = "",
  from = "",
  source = "",
}) {
  const result = await callGroq(
    "llama-3.1-8b-instant",
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

async function summarizerAgent({ subject = "", body = "", from = "" }) {
  const result = await analyzeMessageAgent({ subject, body, from });
  return result.summary;
}

export {
  analyzeMessageAgent,
  classifierAgent,
  actionDetectorAgent,
  replyDrafterAgent,
  summarizerAgent,
};
