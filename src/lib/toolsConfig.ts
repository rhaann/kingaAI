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
      endpoint: 'https://actualinsight.app.n8n.cloud/mcp/8f189c68-6f6a-4924-b06d-2d58542afe4e',
      
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
        required: ["linkedin_url"],
      },
    },
    // -----------------------------
    // Built-in tool specs
    // -----------------------------
    {
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
    },
    
    {
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
    },

    
    

  ];