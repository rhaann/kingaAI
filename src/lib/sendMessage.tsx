import OpenAI from "openai";
import type { ModelConfig, LLMResult } from "@/types/types";
import { AVAILABLE_TOOLS, AITool } from "./toolsConfig";

// -----------------------------
// Types
// -----------------------------
interface SendMessageOptions {
  modelConfig: ModelConfig;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  documentContext?: string; // present when a document is open
}

// -----------------------------
// OpenAI client
// -----------------------------
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// -----------------------------
// System Prompt
// -----------------------------
const systemPrompt = `You are Kinga, an elite business assistant. Your primary function is to help users accomplish tasks by using the tools provided.

**//-- Core Process Rules --//**
* **Document Creation Process:** When a user asks to 'write', 'create', 'draft', or 'generate' a document/email/report/etc., you MUST call \`create_document\`. Do NOT paste the document in chat.
* **Document Update Process:** When a document is open (a "Context" has been provided) and the user asks to 'change', 'add to', 'revise', 'edit', 'modify', or 'replace' it, you MUST call \`update_document\` with the full, revised content. Do NOT paste the updated text in chat.
* **General Queries:** For questions not involving creating/editing a document, respond with a helpful text answer.

**//-- Output Formatting Rules --//**
* When providing structured responses for tools, use the tool call only—no extra text before/after.
* Do not include "index", "message", "role", or "content" meta when returning structured JSON. Only the fields themselves.

**//-- Critical Final Instruction --//**
* Never mention tools by name. If you decide to use a tool, your ONLY output must be that tool call (no conversational text).`;

// -----------------------------
// Built-in tool specs (same as before)
// -----------------------------
const createDocumentTool: AITool = {
  name: "create_document",
  description:
    "Creates a new document artifact with a title and content. Use this when the user explicitly asks to write, create, generate, or draft a new document, email, report, etc.",
  executionType: "in_house",
  endpoint: "",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string", description: "A concise, descriptive title for the document." },
      content: { type: "string", description: "The full content of the document." },
    },
    required: ["title", "content"],
  },
};

const updateDocumentTool: AITool = {
  name: "update_document",
  description:
    "Updates the content of the currently active document artifact. Use this when the user asks to change, add to, or modify the provided document context.",
  executionType: "in_house",
  endpoint: "",
  parameters: {
    type: "object",
    properties: {
      content: {
        type: "string",
        description: "The new, complete, and fully revised content for the document.",
      },
    },
    required: ["content"],
  },
};

const allAppTools = [...[createDocumentTool, updateDocumentTool], ...AVAILABLE_TOOLS];

function convertToOpenAITool(tool: AITool): OpenAI.Chat.Completions.ChatCompletionTool {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters || { type: "object", properties: {} },
    },
  };
}

// -----------------------------
// Intent detection (lightweight & fast)
// -----------------------------
const CREATE_RE =
  /\b(write|create|draft|generate|compose|make|produce)\b.*\b(email|document|letter|note|proposal|plan|report)\b/i;

const UPDATE_RE =
  /\b(update|revise|edit|change|modify|append|add|tweak|replace|fix|adjust|remove)\b/i;

function isCreateIntent(msg: string, hasOpenDoc: boolean) {
  if (hasOpenDoc) return false; // if a doc is open, edits usually trump create
  return CREATE_RE.test(msg);
}

function isUpdateIntent(msg: string, hasOpenDoc: boolean) {
  return hasOpenDoc && UPDATE_RE.test(msg);
}

// Fallback: the model sometimes replies with "Subject:" or "Content:" text instead of the tool call.
// Treat these as strong update indicators if a doc is open.
const LOOKS_LIKE_DOC_TEXT_RE = /^(subject\s*:|content\s*:)/i;

// -----------------------------
// Public entry
// -----------------------------
export async function sendMessage(
  message: string,
  options: SendMessageOptions
): Promise<LLMResult> {
  const { modelConfig, conversationHistory = [], documentContext } = options;

  if (modelConfig.provider !== "OpenAI") {
    throw new Error(`Unsupported model provider: ${modelConfig.provider}`);
  }

  return sendToOpenAI(message, modelConfig, conversationHistory, documentContext);
}

// -----------------------------
// OpenAI path with enforcement
// -----------------------------
async function sendToOpenAI(
  message: string,
  modelConfig: ModelConfig,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>,
  documentContext?: string
): Promise<LLMResult> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not defined.");

  const hasOpenDoc = !!documentContext;
  const wantsUpdate = isUpdateIntent(message, hasOpenDoc);
  const wantsCreate = isCreateIntent(message, hasOpenDoc);

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...conversationHistory,
  ];

  if (hasOpenDoc) {
    messages.push({ role: "user", content: `Context:\n${documentContext}` });
  }
  messages.push({ role: "user", content: message });

  // Build request
  const req: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
    model: modelConfig.id,
    messages,
    temperature: 0.7,
    tools: allAppTools.map(convertToOpenAITool),
    parallel_tool_calls: false,
    // Default is "auto", but we override below when we can be certain.
    tool_choice: "auto",
  };

  // Enforce the right tool when the intent is obvious
  if (wantsUpdate) {
    req.tool_choice = { type: "function", function: { name: "update_document" } };
  } else if (wantsCreate) {
    req.tool_choice = { type: "function", function: { name: "create_document" } };
  }

  const completion = await openai.chat.completions.create(req);
  const responseMessage = completion.choices[0]?.message;

  // Tool call path
  const toolCalls = responseMessage?.tool_calls;
  if (toolCalls && toolCalls.length > 0) {
    const toolCall = toolCalls[0];
    const args = safeParseArgs(toolCall.function.arguments);
    return { type: "tool_call", toolName: toolCall.function.name, toolArgs: args };
  }

  // --------- SAFETY NET ----------
  // If we *expected* an update but got raw text (the model was stubborn),
  // coerce that text into an update_document call so the chat shows a new version.
  const raw = (responseMessage?.content || "").trim();
  if (hasOpenDoc && (wantsUpdate || LOOKS_LIKE_DOC_TEXT_RE.test(raw))) {
    // If the text looks like content/subject or we were enforcing update,
    // treat it as the updated document content.
    return {
      type: "tool_call",
      toolName: "update_document",
      toolArgs: { content: raw },
    };
  }
  // --------- /SAFETY NET ----------

  // Plain text reply
  return { type: "text", content: raw || null };
}

// -----------------------------
// Helpers
// -----------------------------
function safeParseArgs(jsonLike: string): any {
  try {
    return JSON.parse(jsonLike);
  } catch {
    // If the LLM produced slightly-invalid JSON, pass through as text so you can inspect.
    return { raw: jsonLike };
  }
}
