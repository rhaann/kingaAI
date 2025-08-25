/**
 * toolsConfig.ts
 *
 * What this file defines:
 * - INTERNAL_TOOLS: in-app “function tools” (create/update_document) the LLM can call directly.
 * - MCP_SERVER_TOOL: a single “gateway” tool (kinga_agent) that represents your n8n MCP server.
 * - toolCatalogForLLM(): merges internal tools + gateway for model exposure.
 * - MCP_SERVER: endpoint + auth header for the n8n MCP gateway (from env).
 * - MCP_TOOL_IDS: stable mapping of friendly tool names → actual MCP ids:
 *     email_finder → "email_finder"
 *     kinga_search → "search"
 *     kinga_crm    → "crm"
 *
 * Notes:
 * - Keep MCP_TOOL_IDS as the single source of truth; runners import it to hit
 *   the correct n8n workflow.
 * - Don’t put secrets here (read from env via MCP_SERVER).
 */


export type AITool = {
  name: string;
  description: string;
  parameters: Record<string, any>;
};

export const INTERNAL_TOOLS: AITool[] = [
  {
    name: "create_document",
    description:
      "Create a new document. Always include a concise title and the full content.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        content: { type: "string" },
      },
      required: ["title", "content"],
    },
  },
  {
    name: "update_document",
    description:
      "Update the currently open document. Return the FULL new content (never a diff).",
    parameters: {
      type: "object",
      properties: {
        content: { type: "string" },
      },
      required: ["content"],
    },
  },
];

/**
 * One MCP “server tool” that can orchestrate your n8n workflows.
 * The LLM calls this when a task is bigger than simple doc edits.
 */
export const MCP_SERVER_TOOL: AITool = {
  name: "kinga_agent",
  description:
    "Business agent that can search the web, enrich contacts, and talk to the CRM via the MCP server. " +
    "Use this for business tasks beyond writing/rewriting documents.",
  parameters: {
    type: "object",
    properties: {
      user_request: {
        type: "string",
        description:
          "The user's full, original request. Example: 'Find the CEO of Acme and add them to the CRM.'",
      },
      // The API will add more context (doc/chat) for you; LLM just passes the user's ask.
    },
    required: ["user_request"],
  },
};

/** What we expose to the LLM as available tools */
export function toolCatalogForLLM(): AITool[] {
  return [...INTERNAL_TOOLS, MCP_SERVER_TOOL];
}

/** MCP server connection info (envs) */
export const MCP_SERVER = {
  endpoint: process.env.N8N_KINGA_MCP_ENDPOINT || // preferred
    process.env.N8N_MCP_ENDPOINT ||               // fallback
    "https://actualinsight.app.n8n.cloud/mcp/8f189c68-6f6a-4924-b06d-2d58542afe4e",
  authHeaderName: "kinga_key",
  authHeaderValue: process.env.N8N_AUTH_HEADER_VALUE || "",
};
export const MCP_TOOL_IDS = {
  email_finder: "email_finder",
  kinga_search: "search",
  kinga_crm: "crm",
} as const;


// === LLM-visible MCP tools (names the model will call) ===
export const EXTERNAL_MCP_TOOLS_FOR_LLM = [
  {
    name: "kinga_search",
    description:
      "Search the current web and extract facts with citations. Input: agent_query (a search-style query). Returns structured findings and source links.",
    parameters: {
      type: "object",
      properties: {
        agent_query: { type: "string", description: "Web search query/topic." },
      },
      required: ["agent_query"],
    },
  },
  {
    name: "email_finder",
    description:
      "Find a professional email from a LinkedIn /in/ profile URL. Requires a direct LinkedIn profile URL.",
    parameters: {
      type: "object",
      properties: {
        linkedin_url: { type: "string", description: "https://www.linkedin.com/in/..." },
      },
      required: ["linkedin_url"],
    },
  },
  {
    name: "kinga_crm",
    description:
      "Create/update/search contacts/companies in CRM with safe upsert semantics. Input a crm_handoff_package (stringified JSON).",
    parameters: {
      type: "object",
      properties: {
        crm_handoff_package: {
          type: "string",
          description: "Stringified JSON describing the CRM action and fields.",
        },
      },
      required: ["crm_handoff_package"],
    },
  },
];

// Build tool list for a given user's permissions (adds only allowed MCP tools)
export function llmToolsForPermissions(perms?: Record<string, boolean>) {
  const allow = (k: string) => !!perms?.[k];
  const mcpTools = EXTERNAL_MCP_TOOLS_FOR_LLM.filter((t) => {
    // map tool -> permission key
    if (t.name === "kinga_search") return allow("kinga_search");
    if (t.name === "email_finder") return allow("email_finder");
    if (t.name === "kinga_crm") return allow("kinga_crm");
    return false;
  });
  return [...INTERNAL_TOOLS, ...mcpTools];
}
