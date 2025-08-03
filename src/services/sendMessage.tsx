import { GoogleGenerativeAI, Part, FunctionDeclarationTool } from '@google/generative-ai';
import OpenAI from 'openai';
import { ModelConfig, LLMResult } from '@/types/types';

// --- Define the structure for our API call options ---
interface SendMessageOptions {
  modelConfig: ModelConfig;
  conversationHistory?: Array<{ role: 'user' | 'assistant', content: string }>;
  documentContext?: string;
}

// --- Initialize API Clients ---
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// --- THE "SECRET SAUCE": A Refined System Prompt for Cleaner Formatting ---
const systemPrompt = `You are Kinga, an elite AI assistant. Your persona is that of a proactive, competent, and collaborative partner. Your primary goal is to help the user achieve their tasks by using the correct tool for the job and producing clean, professional documents.

**//-- CORE DIRECTIVES --//**

1.  **Analyze Context First:** Before doing anything, check if the user has provided a 'documentContext'. This context represents a document the user is actively working on.

2.  **Choose the Correct Tool (CRITICAL):**
    *   **To Create:** If the user asks to **create, write, generate, or draft** a NEW document (and no documentContext is present), you MUST use the \`create_document\` tool.
    *   **To Update:** If a **documentContext IS present** and the user's request is an instruction to **modify, improve, or change the document in any way** (e.g., "make it better," "add a section," "change the tone to be more friendly"), you MUST use the \`update_document\` tool. **DO NOT output the revised text directly in the chat.** Your only output should be the tool call.
    *   **To Clarify:** If a request is ambiguous, ask clarifying questions before using a tool.

3.  **Standard Chat:** If no tool is appropriate for the user's request, respond as a helpful assistant in plain text.
4.  **Persona:** Maintain a professional, collaborative tone. Avoid apologies and stating you are an AI.

**//-- FORMATTING RULES (CRITICAL) --//**

5.  **Use Clean Markdown:** All text content should be in clean, readable Markdown.
    *   Use headings (\`#\`, \`##\`) and lists (\`*\` or \`-\`) for structure.
    *   **AVOID** excessive bolding. Do not bold every item in a list. Only bold the list's title (e.g., "**Action Items:**").
    *   Write in natural, professional prose.

6.  **Use User-Friendly Placeholders:** When you need the user to fill in information, you MUST use clean, descriptive placeholders enclosed in angle brackets.
    *   **CORRECT:** \`<Insert Manager's Name Here>\` or \`<Specify a deadline>\`
    *   **INCORRECT:** \`[Your Name]\`, \`\\[Clearly state the action]\`, or using any backslashes \`\\\\\`.
`;

// --- TOOL DEFINITIONS ---
const createDocumentTool = {
  type: 'function' as const,
  function: {
    name: 'create_document',
    description: 'Creates a new document artifact with a title and content. Use this when the user explicitly asks to write, create, generate, or draft a new document, email, report, etc.',
    parameters: {
      type: 'object' as const,
      properties: {
        title: { type: 'string' as const, description: 'A concise, descriptive title for the document.' },
        content: { type: 'string' as const, description: 'The full, well-formatted markdown content of the document.' },
      },
      required: ['title', 'content'],
    },
  },
};

const updateDocumentTool = {
  type: 'function' as const,
  function: {
    name: 'update_document',
    description: 'Updates the content of the currently active document artifact. Use this when the user asks to change, add to, or modify the provided document context.',
    parameters: {
      type: 'object' as const,
      properties: {
        content: { type: 'string' as const, description: 'The new, complete, and fully revised markdown content for the document.' },
      },
      required: ['content'],
    },
  },
};

const allTools = [createDocumentTool, updateDocumentTool];

// --- The Main sendMessage Function ---
export async function sendMessage(message: string, options: SendMessageOptions): Promise<LLMResult> {
  const { modelConfig, conversationHistory = [], documentContext } = options;

  if (modelConfig.provider === 'Google') {
    return sendToGemini(message, modelConfig, conversationHistory, documentContext);
  } else if (modelConfig.provider === 'OpenAI') {
    return sendToOpenAI(message, modelConfig, conversationHistory, documentContext);
  } else {
    throw new Error(`Unsupported model provider: ${modelConfig.provider}`);
  }
}

// --- Helper function for Gemini ---
async function sendToGemini(
  message: string,
  modelConfig: ModelConfig,
  conversationHistory: Array<{ role: 'user' | 'assistant', content: string }>,
  documentContext?: string
): Promise<LLMResult> {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not defined.");

  // --- THIS IS THE FIX ---
  // The Gemini SDK expects the tools in a specific nested format.
  // We map our generic tool definitions to what the SDK requires.
  const geminiTools = [{
    functionDeclarations: allTools.map(t => t.function)
  }];
  // --- END OF FIX ---

  const model = genAI.getGenerativeModel({
    model: modelConfig.id,
    systemInstruction: systemPrompt,
    tools: geminiTools, // Use the correctly formatted tools
  });

  const geminiHistory = conversationHistory.map(msg => ({
    role: msg.role === 'assistant' ? 'model' as const : 'user' as const,
    parts: [{ text: msg.content }],
  }));

  const userMessageParts: Part[] = [];
  if (documentContext) {
    userMessageParts.push({ text: `Here is the content of the document we are currently working on:\n\n---\n${documentContext}\n---\n\nNow, please follow my instructions:` });
  }
  userMessageParts.push({ text: message });

  const chat = model.startChat({ history: geminiHistory });
  const result = await chat.sendMessage(userMessageParts);
  const response = result.response;
  const call = response.functionCalls()?.[0];

  if (call) {
    const args = call.args as { title?: string; content?: string };
    if (call.name === 'create_document' && args.title && args.content) {
      return { type: 'tool_call', toolName: 'create_document', toolArgs: { title: args.title, content: args.content } };
    }
    if (call.name === 'update_document' && args.content) {
      return { type: 'tool_call', toolName: 'update_document', toolArgs: { content: args.content } };
    }
  }
  
  return { type: 'text', content: response.text() };
}

// --- Helper function for OpenAI ---
async function sendToOpenAI(
  message: string,
  modelConfig: ModelConfig,
  conversationHistory: Array<{ role: 'user' | 'assistant', content: string }>,
  documentContext?: string
): Promise<LLMResult> {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not defined.");

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...conversationHistory,
  ];
  if (documentContext) {
    messages.push({ role: "user", content: `Here is the content of the document we are currently working on:\n\n---\n${documentContext}\n---\n\nNow, please follow my instructions:` });
  }
  messages.push({ role: "user", content: message });

  const completion = await openai.chat.completions.create({
    model: modelConfig.id,
    messages: messages,
    temperature: 0.7,
    tools: allTools,
    tool_choice: "auto",
  });

  const responseMessage = completion.choices[0].message;
  const toolCalls = responseMessage.tool_calls;

  if (toolCalls) {
    const toolCall = toolCalls[0];
    const args = JSON.parse(toolCall.function.arguments);
    
    if (toolCall.function.name === 'create_document') {
      return { type: 'tool_call', toolName: 'create_document', toolArgs: { title: args.title, content: args.content } };
    }
    if (toolCall.function.name === 'update_document') {
      return { type: 'tool_call', toolName: 'update_document', toolArgs: { content: args.content } };
    }
  }
  
  return { type: 'text', content: responseMessage.content || "" };
}