export type Message = {
  id: string;
  role: "user" | "ai";
  content: string;
  artifactId?: string;
};

export type ModelProvider = 'openai' | 'google' | 'anthropic';

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
  content: string;
  type: 'document';
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