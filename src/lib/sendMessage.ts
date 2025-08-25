import OpenAI from "openai";
import type { ModelConfig, LLMResult } from "@/types/types";
import { SYSTEM_PROMPT } from "@/lib/prompt/systemPrompt";
import { toolCatalogForLLM,AITool  } from "@/config/toolsConfig";


// -----------------------------
// Types the service accepts
// -----------------------------
interface SendMessageOptions {
  modelConfig: ModelConfig;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  documentContext?: string; // present when a document is open
  /** The exact tool list this request is allowed to use (already filtered by permissions). */
  tools?: AITool[];
  disableNudges?: boolean; // NEW
}

// -----------------------------
// OpenAI client
// -----------------------------
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// -----------------------------
// Helpers
// -----------------------------
function convertToOpenAITool(tool: {
  name: string;
  description: string;
  parameters: any;
}): OpenAI.Chat.Completions.ChatCompletionTool {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters || { type: "object", properties: {} },
    },
  };
}

function getCurrentDateTime() {
  const now = new Date();
  const nowUtcIso = now.toISOString();
  const nowCt = new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "America/Chicago",
  }).format(now);
  const todayCt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
  }).format(now); // YYYY-MM-DD

  return `Current datetime is ${nowCt} (America/Chicago). UTC=${nowUtcIso}. ISO_DATE_CT=${todayCt}.`;
}

const CREATE_RE =
  /\b(write|create|draft|generate|compose|make|produce)\b.*\b(email|document|letter|note|proposal|plan|report)\b/i;
const UPDATE_RE =
  /\b(update|revise|edit|change|modify|append|add|tweak|replace|fix|adjust|remove)\b/i;
const LOOKS_LIKE_DOC_TEXT_RE = /^(subject\s*:|content\s*:)/i;

function isCreateIntent(msg: string, hasOpenDoc: boolean) {
  if (hasOpenDoc) return false;
  return CREATE_RE.test(msg);
}
function isUpdateIntent(msg: string, hasOpenDoc: boolean) {
  return hasOpenDoc && UPDATE_RE.test(msg);
}

// -----------------------------
// Public entry
// -----------------------------
export async function sendMessage(
  message: string,
  options: SendMessageOptions
): Promise<LLMResult> {
  const {
    modelConfig,
    conversationHistory = [],
    documentContext,
    tools: allowedTools = toolCatalogForLLM(), // default to full catalog if caller didn't pass
  } = options;

  if (modelConfig.provider !== "OpenAI") {
    throw new Error(`Unsupported model provider: ${modelConfig.provider}`);
  }

  return sendToOpenAI(
    message,
    modelConfig,
    conversationHistory,
    documentContext,
    allowedTools,
    options.disableNudges
  );
}

// -----------------------------
// OpenAI path with enforcement
// -----------------------------
async function sendToOpenAI(
  message: string,
  modelConfig: ModelConfig,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>,
  documentContext: string | undefined,
  allowedTools: AITool[],
  disableNudges: boolean | undefined
): Promise<LLMResult> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not defined.");

  const hasOpenDoc = !!documentContext;
  const wantsUpdate = isUpdateIntent(message, hasOpenDoc);
  const wantsCreate = isCreateIntent(message, hasOpenDoc);

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT + "\n\n" + getCurrentDateTime() },
    ...conversationHistory,
  ];

  if (documentContext) {
    messages.push({
      role: "system",
      content:
        "DOCUMENT CONTEXT (snapshot of the open artifact and versions):\n" +
        documentContext +
        "\n\nRule: When updating the document, ALWAYS return the complete updated document (not a diff).",
    });
  }

  messages.push({ role: "user", content: message });

  // Build request with the *caller-provided* tool list (already filtered by permissions)
  const tools = allowedTools.map(convertToOpenAITool);

  const req: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
    model: modelConfig.id,
    messages,
    temperature: 0,
    tools,
    parallel_tool_calls: false,
    tool_choice: "auto",
  };

  // Nudge when obvious
  if (!disableNudges) {
    const available = new Set(allowedTools.map(t => t.name));
    if (wantsUpdate && available.has("update_document")) {
      req.tool_choice = { type: "function", function: { name: "update_document" } };
    } else if (wantsCreate && available.has("create_document")) {
      req.tool_choice = { type: "function", function: { name: "create_document" } };
    }
  }

  const completion = await openai.chat.completions.create(req);
  const responseMessage = completion.choices[0]?.message;

  // Tool call path
  const toolCalls = responseMessage?.tool_calls;
  if (toolCalls && toolCalls.length > 0) {
    const toolCall = toolCalls[0];
    const args = safeParseArgs(toolCall.function.arguments);
    return { type: "tool_call", toolName: toolCall.function.name, toolArgs: args };
    // ^ route.ts will now dispatch this tool call (internal or MCP).
  }

  // Safety net for doc updates
  const raw = (responseMessage?.content || "").trim();
  if (hasOpenDoc && (wantsUpdate || LOOKS_LIKE_DOC_TEXT_RE.test(raw))) {
    return {
      type: "tool_call",
      toolName: "update_document",
      toolArgs: { content: raw },
    };
  }

  return { type: "text", content: raw || null };
}

function safeParseArgs(jsonLike: string): any {
  try {
    return JSON.parse(jsonLike);
  } catch {
    return { raw: jsonLike };
  }
}
