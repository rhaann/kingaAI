import OpenAI from "openai";
import type { ModelConfig, LLMResult } from "@/types/types";
import { AVAILABLE_TOOLS, AITool } from "./toolsConfig";
import { SYSTEM_PROMPT } from "@/lib/prompt/systemPrompt";

// -----------------------------
// Types
// -----------------------------
interface SendMessageOptions {
  modelConfig: ModelConfig;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  documentContext?: string; // present when a document is open (artifact + versions snapshot)
}

// -----------------------------
// OpenAI client
// -----------------------------
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// -----------------------------
// Tool plumbing
// -----------------------------
const allAppTools = [...AVAILABLE_TOOLS];

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
// Lightweight intent detection
// -----------------------------
const CREATE_RE =
  /\b(write|create|draft|generate|compose|make|produce)\b.*\b(email|document|letter|note|proposal|plan|report)\b/i;

const UPDATE_RE =
  /\b(update|revise|edit|change|modify|append|add|tweak|replace|fix|adjust|remove)\b/i;

function isCreateIntent(msg: string, hasOpenDoc: boolean) {
  if (hasOpenDoc) return false; // with an open doc, editing is more likely than creating
  return CREATE_RE.test(msg);
}
function isUpdateIntent(msg: string, hasOpenDoc: boolean) {
  return hasOpenDoc && UPDATE_RE.test(msg);
}

// If the model outputs “Subject:” / “Content:” as raw text while a doc is open,
// treat that as a likely update.
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
// OpenAI path with guardrails
// -----------------------------
async function sendToOpenAI(
  message: string,
  modelConfig: ModelConfig,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>,
  documentContext?: string
): Promise<LLMResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not defined.");
  }

  const hasOpenDoc = !!documentContext;
  const wantsUpdate = isUpdateIntent(message, hasOpenDoc);
  const wantsCreate = isCreateIntent(message, hasOpenDoc);

  // Start with system prompt + prior conversation
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...conversationHistory,
  ];

  // ✅ Inject the artifact snapshot ONCE as a system message (context for the LLM)
  if (documentContext) {
    messages.push({
      role: "system",
      content:
        "DOCUMENT CONTEXT (snapshot of the open artifact and versions):\n" +
        documentContext +
        "\n\nRule: When updating the document, ALWAYS return the complete updated document (not a diff).",
    });
  }

  // User’s request
  messages.push({ role: "user", content: message });

  // Build request
  const req: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
    model: modelConfig.id,
    messages,
    temperature: 0.7,
    tools: allAppTools.map(convertToOpenAITool),
    parallel_tool_calls: false,
    tool_choice: "auto", // default
  };

  // Enforce the right tool when intent is obvious
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
  // If we expected an update (or the raw text looks like doc content),
  // but the model returned plain text, coerce it into an update.
  const raw = (responseMessage?.content || "").trim();
  if (hasOpenDoc && (wantsUpdate || LOOKS_LIKE_DOC_TEXT_RE.test(raw))) {
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
