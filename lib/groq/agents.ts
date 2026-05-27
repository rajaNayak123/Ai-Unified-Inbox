import Groq from "groq-sdk";
import { z } from "zod";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Helper function to call groq
async function callGroq(
  model: string,
  systemPrompt: string,
  userContent: string,
  jsonMode = true
) {
  try {
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
        try {
          // Extract matching opening { and closing } to ignore outer conversational preambles/markdown wraps
          const start = text.indexOf("{");
          const end = text.lastIndexOf("}");
          if (start !== -1 && end !== -1 && end > start) {
            return JSON.parse(text.substring(start, end + 1));
          }
          const cleaned = text.replace(/```json|```/g, "").trim();
          return JSON.parse(cleaned);
        } catch (parseErr) {
          console.warn("[agents] JSON parsing failed in callGroq:", parseErr);
          return {};
        }
      }
    }
    return text;
  } catch (err) {
    console.error("[agents] callGroq error:", err);
    return jsonMode ? {} : "";
  }
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

// Unified Message Analyzer Agent (Combines Classifier, Action Detector, and Summarizer)
async function analyzeMessageAgent({ subject = "", body = "", source = "", from = "" }) {
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
      `From: ${from}\nSource: ${source}\nSubject: ${subject}\nBody: ${body.slice(0, 2000)}`
    );
  } catch (groqErr) {
    console.error("[agents] Groq analysis call failed:", groqErr);
  }

  // Parse validation with Zod and apply safe fallbacks
  const parsed = analysisSchema.safeParse(result);
  const data = parsed.success ? parsed.data : {
    classification: { label: "fyi" as const, reason: "AI fallback due to parse error" },
    summary: subject || "New message received",
    actions: [],
  };

  const label = data.classification.label.toUpperCase();
  const reason = data.classification.reason || "";
  const summary = data.summary;
  const actions = data.actions;

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
  let result: any = null;
  try {
    result = await callGroq(
      "llama-3.1-8b-instant",
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
      `From: ${from}\nSource: ${source}\nSubject: ${subject}\nOriginal:\n${body.slice(
        0,
        3000
      )}`
    );
  } catch (groqErr) {
    console.error("[agents] Groq draftReply call failed:", groqErr);
  }

  const parsed = draftSchema.safeParse(result);
  return parsed.success ? parsed.data.draft : "";
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
