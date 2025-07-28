import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import { ModelConfig, ModelProvider } from '../types/types';

interface SendMessageOptions {
  systemMessage?: string;
  documentContext?: string;
  conversationHistory?: Array<{role: 'user' | 'assistant', content: string}>;
}

class MessageService {
  private openai?: OpenAI;
  private gemini?: GoogleGenerativeAI;

  constructor() {
    // Initialize OpenAI if API key is available
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
    }

    // Initialize Gemini if API key is available
    if (process.env.GEMINI_API_KEY) {
      this.gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    }
  }

  async sendMessage(
    message: string,
    modelConfig: ModelConfig,
    sessionId?: string,
    options?: SendMessageOptions
  ) {
    switch (modelConfig.provider) {
      case 'openai':
        return this.sendOpenAIMessage(message, modelConfig, options);
      case 'google':
        return this.sendGeminiMessage(message, modelConfig, options);
      case 'anthropic':
        throw new Error('Anthropic support coming soon!');
      default:
        throw new Error(`Unsupported provider: ${modelConfig.provider}`);
    }
  }

  private async sendOpenAIMessage(
    message: string,
    modelConfig: ModelConfig,
    options?: SendMessageOptions
  ) {
    if (!this.openai) {
      throw new Error('OpenAI API key not configured');
    }

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];

    // Add system message if provided
    if (options?.systemMessage) {
      messages.push({
        role: 'system',
        content: options.systemMessage
      });
    }

    // Add conversation history
    if (options?.conversationHistory) {
      options.conversationHistory.forEach(msg => {
        messages.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content
        });
      });
    }

    // Add document context if available
    if (options?.documentContext) {
      messages.push({
        role: 'system',
        content: `Current documents in conversation:\n${options.documentContext}`
      });
    }

    // Add current message
    messages.push({
      role: 'user',
      content: message
    });

    const completion = await this.openai.chat.completions.create({
      model: modelConfig.model,
      messages: messages,
      temperature: 0.7,
      max_tokens: 2000,
    });

    return {
      output: completion.choices[0]?.message?.content || 'No response generated'
    };
  }

  private async sendGeminiMessage(
    message: string,
    modelConfig: ModelConfig,
    options?: SendMessageOptions
  ) {
    if (!this.gemini) {
      throw new Error('Gemini API key not configured');
    }

    const model = this.gemini.getGenerativeModel({ model: modelConfig.model });

    // Build the prompt with context
    let prompt = message;

    // Add document context if available
    if (options?.documentContext) {
      prompt = `Here is the current content of documents in this conversation:

${options.documentContext}

Based on this content, answer the user's question: ${message}`;
    }

    // Add conversation history for context
    if (options?.conversationHistory && options.conversationHistory.length > 0) {
      const historyText = options.conversationHistory
        .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
        .join('\n');
      
      prompt = `Previous conversation:
${historyText}

Current documents:
${options.documentContext || 'None'}

User's current question: ${message}`;
    }

    const result = await model.generateContent(prompt);
    const response = await result.response;
    
    return {
      output: response.text()
    };
  }
}

export const messageService = new MessageService();

// Legacy function for backward compatibility
export async function sendMessage(
  message: string,
  sessionId?: string,
  options?: SendMessageOptions
) {
  // Default to Gemini Flash for backward compatibility
  const defaultModel: ModelConfig = {
    id: 'gemini-flash',
    name: 'Gemini Flash',
    provider: 'google',
    model: 'gemini-1.5-flash',
  };

  return messageService.sendMessage(message, defaultModel, sessionId, options);
}