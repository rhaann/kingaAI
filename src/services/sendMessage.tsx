import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import OpenAI from 'openai';
import { ModelConfig } from '@/types/types'; // Assuming ModelConfig is in your types

// --- Define the structure for our API call options ---
interface SendMessageOptions {
  modelConfig: ModelConfig;
  conversationHistory?: Array<{ role: 'user' | 'assistant', content: string }>;
  documentContext?: string;
}

// --- Initialize API Clients ---
// We initialize them once and reuse them.
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");


// --- THE "SECRET SAUCE": A Powerful System Prompt ---
const systemPrompt = `You are Kinga, a world-class AI assistant designed to be exceptionally helpful, thoughtful, and comprehensive.

Your primary goal is to assist users in achieving their tasks by providing clear, accurate, and detailed responses. When a user asks a question, follow these steps:
1.  **Think Step-by-Step:** Before you answer, break down the user's request into smaller parts. Analyze the core intent and any implicit context.
2.  **Be Thorough:** Provide comprehensive answers. Don't just give a short response; explain the 'why' behind your answer. If you provide code, explain what it does. If you suggest a plan, explain the steps.
3.  **Structure Your Responses:** Use formatting like bullet points, and bold text to make your answers easy to read and understand.
4.  **Consider the Context:** Pay close attention to any provided conversation history or document context. Refer to it when it's relevant to the user's current question.
5.  **Maintain a Helpful Persona:** Your tone should be professional, encouraging, and supportive. You are a partner in the user's work.

If a user's request is ambiguous, ask clarifying questions instead of making assumptions. Your ultimate goal is to be a truly valuable and indispensable assistant.`;


// --- The Main sendMessage Function ---
export async function sendMessage(message: string, options: SendMessageOptions) {
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
) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not defined.");
  }

  const model = genAI.getGenerativeModel({
    model: modelConfig.id,
    // We inject our system prompt here!
    systemInstruction: systemPrompt,
  });

  // Convert our generic history to Gemini's format ('assistant' -> 'model')
  const geminiHistory = conversationHistory.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }));

  // Add document context as the first part of the user's message
  const userMessageParts = [];
  if (documentContext) {
    userMessageParts.push({ text: `CONTEXT:\n---\n${documentContext}\n---\n\nQUESTION:` });
  }
  userMessageParts.push({ text: message });

  const chat = model.startChat({
    history: geminiHistory,
    // Safety settings can be adjusted to be less restrictive if needed
    safetySettings: [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    ],
  });

  const result = await chat.sendMessage(userMessageParts);
  const response = result.response;
  return { output: response.text() };
}


// --- Helper function for OpenAI ---
async function sendToOpenAI(
  message: string,
  modelConfig: ModelConfig,
  conversationHistory: Array<{ role: 'user' | 'assistant', content: string }>,
  documentContext?: string
) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not defined.");
  }

  // Construct the messages array in the format OpenAI expects
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    // 1. The System Prompt
    { role: "system", content: systemPrompt },
  ];

  // 2. The Conversation History
  messages.push(...conversationHistory);

  // 3. The Document Context (if it exists)
  if (documentContext) {
    messages.push({
      role: "user",
      content: `Here is some context from a document I am working on:\n\n---\n${documentContext}\n---`,
    });
  }

  // 4. The User's Final Message
  messages.push({ role: "user", content: message });

  const completion = await openai.chat.completions.create({
    model: modelConfig.id, // e.g., "gpt-4-turbo"
    messages: messages,
    temperature: 0.7, // A good balance of creative and factual
  });

  return { output: completion.choices[0].message.content };
}