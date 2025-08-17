import { sendMessage, LLMResult } from "@/lib/sendMessage";
import { ModelConfig } from "@/types/types";
import { AVAILABLE_MODELS } from "@/config/modelConfig";
import { AVAILABLE_TOOLS } from "@/lib/toolsConfig";
import { callMCPToolSSE } from "@/lib/mcpClient";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      message,
      modelConfig,
      conversationHistory,
      documentContext,
      currentArtifactId,
      currentArtifactTitle,
    } = body;

    if (!message) {
      return new Response("Message is required", { status: 400 });
    }

    const selectedModelConfig: ModelConfig =
      modelConfig && modelConfig.provider ? modelConfig : AVAILABLE_MODELS[2];

    const result: LLMResult = await sendMessage(message, {
      modelConfig: selectedModelConfig,
      conversationHistory,
      documentContext,
    });

    // ---- TEXT REPLY ---------------------------------------------------------
    if (result.type === "text") {
      const aiResponse =
        result.content || "I'm sorry, I couldn't generate a response.";
      return Response.json({ result: { output: aiResponse } });
    }

    // ---- TOOL CALLS ---------------------------------------------------------
    if (result.type === "tool_call") {
      const { toolName, toolArgs } = result;

      // Built-in document tools
      if (toolName === "create_document" || toolName === "update_document") {
        if (toolName === "create_document") {
          const { title, content } = toolArgs;
          return Response.json({
            result: {
              output: `I've created a document for you: "${title}"`,
              artifact: {
                id: `artifact-${Date.now()}`,
                title,
                type: "document",
                versions: [{ content, createdAt: Date.now() }],
                createdAt: Date.now(),
                updatedAt: Date.now(),
              },
            },
          });
        }
        if (toolName === "update_document") {
          if (!currentArtifactId || !currentArtifactTitle) {
            throw new Error("Update tool called without artifact context.");
          }
          const { content } = toolArgs;
          return Response.json({
            result: {
              output: `I've updated the document for you.`,
              artifact: {
                id: currentArtifactId,
                title: currentArtifactTitle,
                type: "document",
                versions: [{ content, createdAt: Date.now() }],
                updatedAt: Date.now(),
              },
            },
          });
        }
      }

      // External (n8n MCP) tools
      const tool = AVAILABLE_TOOLS.find((t) => t.name === toolName);
      if (tool && tool.executionType === "n8n") {
        if (!tool.authentication || !tool.authentication.secret) {
          throw new Error(
            `Authentication secret for tool '${toolName}' is not configured in environment variables.`
          );
        }

        // Auth header for MCP server
        const authHeaderName = tool.authentication.headerName;
        const authHeaderValue = tool.authentication.secret!;
        const headers = { [authHeaderName]: authHeaderValue };

        // Pick which MCP tool to call based on the args
        const wantsEmailFinder =
          typeof toolArgs?.linkedin_url === "string" &&
          toolArgs.linkedin_url.length > 0;

        const mcpToolName = wantsEmailFinder
          ? "Kinga_Email_Finder"
          : "Kinga_CRM";
        const mcpArgs = wantsEmailFinder
          ? { linkedin_url: toolArgs.linkedin_url }
          : { crm_handoff_package: JSON.stringify(toolArgs ?? {}) };

        const mcp = await callMCPToolSSE({
          baseUrl: tool.endpoint, // e.g., https://.../mcp/kinga-base-mcp
          headers,
          toolName: mcpToolName,
          args: mcpArgs,
          timeoutMs: 30000,
        });

        if ("error" in mcp) {
          const msg = mcp.error?.message || "MCP error";
          throw new Error(msg);
        }

        // Raw text from MCP (fallbacks handled)
        const rawToolText =
          (mcp.result?.content?.[0]?.text as string) ??
          (typeof mcp.result === "string"
            ? mcp.result
            : JSON.stringify(mcp.result));

        // --- Normalize tool output into presentable flat JSON via the model ---
        const normalizePrompt = `
Normalize the following tool result into a single, flat JSON object for display.

Rules:
- Use human-readable keys (e.g., "Name", "Email", "Company", "Status", "Confidence", "Source URL").
- Keep structure flat (no nesting) unless absolutely necessary.
- Include keys even if values are empty.
- Output ONLY valid JSON (no prose, no markdown fences).

Tool result:
"""${rawToolText}"""
        `.trim();

        const normalized: LLMResult = await sendMessage(normalizePrompt, {
          modelConfig: selectedModelConfig,
          conversationHistory: [],
        });

        const displayOutput =
          normalized.type === "text" && normalized.content
            ? normalized.content
            : rawToolText; // fallback if model didn't comply

        return Response.json({ result: { output: displayOutput } });
      }

      throw new Error(`Unknown tool name: ${toolName}`);
    }

    throw new Error("Invalid result type from sendMessage service.");
  } catch (err: any) {
    console.error("Error in /api/chat:", err.stack || err);
    return new Response(JSON.stringify({ error: err.message || "An unknown error occurred" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
