export type Message = {
  id: string;
  role: "user" | "ai";
  content: string;
  artifactId?: string;
  artifactVersion?: number; 
};

export type ModelProvider = 'OpenAI' | 'Google' | 'Anthropic';

export type ModelConfig = {
  id: string;
  name: string;
  provider: ModelProvider;
  model: string; // The actual model identifier for the API
  description?: string;
  contextLength?: number;
  pricing?: {
    input: number; // per 1M tokens
    output: number; // per 1M tokens
  };
};

export type Chat = {
  id: string;
  title: string;
  messages: Message[];
  artifacts: Artifact[];
  modelConfig: ModelConfig; // Store which model was used for this chat
  createdAt: number;
  updatedAt: number;
};

export type Artifact = {
  id: string;
  title: string;
  type: 'document';
  versions: Array<{ content: string; createdAt: number }>; 
  createdAt: number;
  updatedAt: number;
};

// Google Drive types
export type GoogleDriveTokens = {
  access_token: string;
  refresh_token?: string;
  scope: string;
  token_type: string;
  expiry_date?: number;
};

export type DriveFile = {
  id: string;
  name: string;
  webViewLink: string;
  webContentLink?: string;
};

/**
 * Defines the possible return structures from the sendMessage service.
 * It can either be a simple text response or a request to use a tool.
 */
export type LLMResult = 
  | { type: 'text'; content: string | null }
  | { 
      type: 'tool_call'; 
      toolName: 'create_document'; 
      toolArgs: { title: string; content: string } 
    }
  | { 
    type: 'tool_call'; 
    toolName: 'update_document'; 
    toolArgs: { content: string } 
  }
  | 
  { 
    type: 'tool_call';
    toolName: string; 
    toolArgs: any 

  }; // For dynamic n8n tools