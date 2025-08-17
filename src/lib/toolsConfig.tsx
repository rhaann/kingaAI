// src/lib/toolsConfig.ts

/**
 * Defines the structure for any tool that our AI can use.
 */
export interface AITool {
    name: string;
    description: string;
    executionType: 'n8n' | 'in_house';
    endpoint: string;
    // --- NEW, MORE DESCRIPTIVE AUTHENTICATION STRUCTURE ---
    authentication?: {
      type: 'header';
      headerName: string;
      secret: string | undefined; // The secret comes from process.env, so it can be undefined
    };
    parameters?: {
      type: 'object';
      properties: {
        [key: string]: {
          type: 'string' | 'number' | 'boolean';
          description: string;
        };
      };
      required?: string[];
    };
  }
  
  /**
   * This is our master list of all tools available to the AI.
   */
  export const AVAILABLE_TOOLS: AITool[] = [
    {
      name: 'kinga_agent',
      description: 'A powerful, general-purpose business agent that can perform complex tasks like searching for information, finding emails, and interacting with the company CRM. Use this for any business-related request that goes beyond simple document creation or editing.',
      executionType: 'n8n',
      endpoint: 'https://actualinsight.app.n8n.cloud/mcp/kinga-base-mcp',
      
      authentication: {
        type: 'header',
        headerName: 'kinga_key', 
        secret: process.env.N8N_AUTH_HEADER_VALUE,
      },
      parameters: {
        type: 'object',
        properties: {
          user_request: {
            type: 'string',
            description: 'The user\'s full, original, and unmodified request. For example: "Find the CEO of Acme Inc. and add them to our CRM."',
          },
        },
        required: ['user_request'],
      },
    },
    
    {
      name: 'analyze_running_data',
      description: 'Analyzes a user\'s running data for a specific day and provides a summary.',
      executionType: 'n8n',
      endpoint: 'https://actualinsight.app.n8n.cloud/webhook/test',
      // This tool is a simple webhook and does not require authentication.
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'The date for which to analyze the running data, in YYYY-MM-DD format. If the user says "today" or "yesterday", infer the correct date.',
          },
        },
        required: ['date'], 
      },
    },
  ];