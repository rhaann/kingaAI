import { NextRequest, NextResponse } from "next/server";

import { sendMessage } from "@/lib/sendMessage";
import type { KingaCard, ModelConfig } from "@/types/types";

import { runWebSearch } from "@/lib/tools/runners/search";
import { runCrm } from "@/lib/tools/runners/crm";
import { MCP_SERVER, llmToolsForPermissions } from "@/config/toolsConfig";
import { runEmailFinder } from "@/lib/tools/runners/emailFinder";



// If you already have auth helpers, keep them.
// Otherwise, this example assumes you verify user elsewhere and have a UID here.
import { getUserFromRequest } from "@/services/authRequest";
import { adminDb } from "@/services/firebaseAdmin";
import { FieldPath } from "firebase-admin/firestore";

/** What we return to the client */
type ApiResult = {
  output: string | null;
  card?: KingaCard;
  artifact?: any;
  suggestedTitle?: string;
};

/** Title fallback from the latest user message */
function autoTitleFrom(text: string): string {
  const cleaned = String(text || "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "New chat";
  return cleaned.length > 60 ? cleaned.slice(0, 57) + "…" : cleaned;
}

/** Build a new artifact (internal create_document) */
function buildNewArtifact(args: any) {
  const now = Date.now();
  const title =
    (typeof args?.title === "string" && args.title.trim()) ||
    (typeof args?.subject === "string" && args.subject.trim()) ||
    "Document";

  const content = String(args?.content ?? "");
  return {
    id: crypto.randomUUID(),
    title,
    type: "document",
    createdAt: now,
    updatedAt: now,
    versions: [{ content, createdAt: now }],
  };
}

/** Build an update artifact envelope (client appends single version) */
function buildUpdateArtifact(currentArtifactId: string | null, args: any) {
  const now = Date.now();
  const content = String(args?.content ?? "");
  return {
    id: currentArtifactId ?? crypto.randomUUID(),
    versions: [{ content, createdAt: now }], // client logic: single version => append
    updatedAt: now,
  };
}


async function readToolFlags(userId: string): Promise<{ [key: string]: boolean }> {
  const toolIds = ["crm", "email_finder", "search"];

  const permissionsRef = adminDb
    .collection("users")
    .doc(userId)
    .collection("toolPermissions");


  // Query by document ID for the tools we care about
  const q = permissionsRef.where(FieldPath.documentId(), "in", toolIds);

  // Default: fail closed
  const permissionsStatus: { [key: string]: boolean } = {
    crm: false,
    email_finder: false,
    search: false,
  };

  // Helper: tolerate different boolean field names
  const pickBool = (data: any): boolean | undefined => {
    const candidates = ["enabled", "allowed", "allow", "value", "on", "active", "isEnabled"];
    for (const k of candidates) {
      if (typeof data?.[k] === "boolean") return data[k];
    }
    return undefined;
  };

  try {
    const querySnapshot = await q.get();

    querySnapshot.forEach((doc) => {
      const data = doc.data() as Record<string, any>;
      const v = pickBool(data);
      if (typeof v === "boolean" && doc.id in permissionsStatus) {
        permissionsStatus[doc.id] = v;
      }
    });

    return permissionsStatus;
  } catch (error) {
    console.error("Error fetching tool permissions:", error);
    // Return defaults (all false) rather than {}
    return permissionsStatus;
  }
}




/** Pull the tool envelope JSON out of assistant output for logging (optional) */
function extractToolEnvelopeFromOutput(output: string) {
  const m = output?.match(/<tool_json[^>]*>([\s\S]*?)<\/tool_json>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

async function synthesizeWithLLM({
  envelope,
  message,
  modelConfig,
  conversationHistory = [],
  documentContext,
}: {
  envelope: any;
  message: string;
  modelConfig: ModelConfig;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  documentContext?: string;
}): Promise<string> {
  const synthesisPrompt =
    "You are helping the user. Interpret the tool results below and produce a concise, helpful answer. " +
    "If sources are present (envelope.meta.source), cite them briefly. Avoid dumping raw JSON.\n\n" +
    `<tool_json v="1">\n${JSON.stringify(envelope)}\n</tool_json>`;

  const llm = await sendMessage(synthesisPrompt, {
    modelConfig,
    conversationHistory,
    documentContext,
    tools: [], // disable tools on the synthesis pass
  });

  return llm.type === "text" ? (llm.content ?? "") : "Here’s what I found.";
}

/** Ask the LLM to propose a short chat title (tools disabled). */
async function generateChatTitleWithLLM({
  message,
  modelConfig,
  envelope,
}: {
  message: string;
  modelConfig: ModelConfig;
  envelope?: any;
}): Promise<string | null> {
  const toolSummary = envelope?.summary ? `\n\nTool summary:\n${envelope.summary}` : "";
  const prompt =
    "Generate a concise, descriptive chat title (max 6 words). " +
    "Output ONLY the title with no quotes or punctuation.\n\n" +
    `User request:\n${message}${toolSummary}`;

  const llm = await sendMessage(prompt, {
    modelConfig,
    conversationHistory: [],
    documentContext: undefined,
    tools: [],
  });
  if (llm.type !== "text") return null;
  const t = (llm.content || "").trim();
  return t ? (t.length > 60 ? t.slice(0, 60) : t) : null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const message: string = body.message ?? "";
    const modelConfig: ModelConfig | undefined = body.modelConfig;
    const conversationHistory:
      | Array<{ role: "user" | "assistant"; content: string }>
      | undefined = body.conversationHistory;
    const documentContext: string | undefined = body.documentContext;
    const currentArtifactId: string | null = body.currentArtifactId ?? null;
    const currentArtifactTitle: string | undefined = body.currentArtifactTitle;
    const chatId: string | undefined = body.chatId; // optional, for logging context

    if (!message) {
      return NextResponse.json(
        { result: { output: "Message is required.", suggestedTitle: "New chat" } },
        { status: 200 }
      );
    }

    // --- AUTH (require a signed-in user) -----------------------------------
    const user = await getUserFromRequest();
    if (!user) {
      return NextResponse.json(
        { result: { output: "Unauthorized. Please sign in.", suggestedTitle: "New chat" } },
        { status: 200 }
      );
    }
    const userId = user.uid;

    // --- Tool permissions ---------------------------------------------------
    const toolFlags = await readToolFlags(userId);
    console.log("[/api/chat] tool flags:", toolFlags);

    // --- 2) Ask the model (LLM) --------------------------------------------
    // Build LLM tool list based on permissions
    const permsForLLM = {
      search: toolFlags.search,
      email_finder: toolFlags.email_finder,
      crm: toolFlags.crm,
    } as Record<string, boolean>;

    console.log("[/api/chat] permsForLLM:", permsForLLM);

    const llm = await sendMessage(message, {
      modelConfig: modelConfig!, // you already set this per chat
      conversationHistory,
      documentContext,
      tools: llmToolsForPermissions(permsForLLM),
    });

    const llmTitle = await generateChatTitleWithLLM({ message, modelConfig: modelConfig! });

    // --- 3) Plain text path -------------------------------------------------
    if (llm.type === "text") {
      const result: ApiResult = {
        output: llm.content ?? "",
        suggestedTitle: llmTitle || autoTitleFrom(message || currentArtifactTitle || ""),
      };
      return NextResponse.json({ result });
    }

    // --- 4) Tool calls (internal + MCP) ------------------------------------
    if (llm.type === "tool_call") {
      const { toolName, toolArgs } = llm;

      // Internal tool: create_document
      if (toolName === "create_document") {
        const artifact = buildNewArtifact(toolArgs);
        const result: ApiResult = {
          output: `I've created a document for you: "${artifact.title}"`,
          artifact,
          suggestedTitle: llmTitle || artifact.title || autoTitleFrom(message || ""),
        };
        return NextResponse.json({ result });
      }

      // Internal tool: update_document (client appends a single version)
      if (toolName === "update_document") {
        if (!currentArtifactId) {
          return NextResponse.json({
            result: {
              output:
                "I need to know which document is open to update it. Please open a document and try again.",
              suggestedTitle: llmTitle || autoTitleFrom(message || currentArtifactTitle || ""),
            },
          });
        }
        const artifact = buildUpdateArtifact(currentArtifactId, toolArgs);
        const result: ApiResult = {
          output: "I've updated the document for you.",
          artifact,
          suggestedTitle: llmTitle || currentArtifactTitle || autoTitleFrom(message || ""),
        };
        return NextResponse.json({ result });
      }
      console.log("[/api/chat] toolName:", toolName);
      // MCP: SEARCH
      if (toolName === "search") {
        if (!toolFlags.search) {
          return NextResponse.json({
            result: { output: "You don’t have access to the Search tool." },
          });
        }
        
        const agent_query = String(toolArgs?.agent_query || "").trim();
        if (!agent_query) {
          return NextResponse.json({
            result: { output: "I need a search query. Try: “Search for <topic>…”" },
          });
        }

        const res = await runWebSearch(
          { agent_query },
          {
            baseUrl: MCP_SERVER.endpoint,
            headers: { [MCP_SERVER.authHeaderName]: MCP_SERVER.authHeaderValue },
            timeoutMs: 30_000,
          }
        );

        if (!res.ok) {
          return NextResponse.json({
            result: {
              output:
                "Search tool failed. I can still summarize what I know, or you can try rephrasing the query.",
              suggestedTitle: llmTitle || autoTitleFrom(message || currentArtifactTitle || ""),
            },
          });
        }

        const envelope = res.envelope as any;
        const card = res.card as KingaCard | undefined;

        const output = await synthesizeWithLLM({
          envelope,
          message,
          modelConfig: modelConfig!,
          conversationHistory,
          documentContext,
        });

        const result: ApiResult = {
          output,
          card,
          suggestedTitle:
            llmTitle ||
            (agent_query.length > 60 ? agent_query.slice(0, 57) + "…" : agent_query) ||
            "Search",
        };
        return NextResponse.json({ result });
      }

      // MCP: CRM
      if (toolName === "crm") {
        if (!toolFlags.crm) {
          return NextResponse.json({
            result: { output: "You don’t have access to the CRM tool." },
          });
        }

        const pkg =
          typeof toolArgs?.crm_handoff_package === "string"
            ? toolArgs.crm_handoff_package
            : JSON.stringify(toolArgs?.crm_handoff_package ?? {});

        if (!pkg) {
          return NextResponse.json({
            result: {
              output:
                "I need CRM details to proceed (contact/company fields, intent, etc.). Tell me what you want to add/update.",
              suggestedTitle: llmTitle || autoTitleFrom(message || currentArtifactTitle || ""),
            },
          });
        }

        const res = await runCrm(
          { crm_handoff_package: pkg },
          {
            baseUrl: MCP_SERVER.endpoint,
            headers: { [MCP_SERVER.authHeaderName]: MCP_SERVER.authHeaderValue },
            timeoutMs: 30_000,
          }
        );

        if (!res.ok) {
          return NextResponse.json({
            result: {
              output:
                "CRM tool failed after the request. If partial data was prepared, I can still present it—otherwise try again with clearer details.",
              suggestedTitle: llmTitle || "CRM",
            },
          });
        }

        const envelope = res.envelope as any;
        const card = res.card as KingaCard | undefined;

        const output = await synthesizeWithLLM({
          envelope,
          message,
          modelConfig: modelConfig!,
          conversationHistory,
          documentContext,
        });

        const prettyEntity = String(envelope?.data?.entity || "CRM").replace(/_/g, " ");

        const result: ApiResult = {
          output,
          card,
          suggestedTitle: llmTitle || `CRM · ${prettyEntity}`,
        };
        return NextResponse.json({ result });
      }

      // MCP: EMAIL FINDER
      if (toolName === "email_finder") {
        if (!toolFlags.email_finder) {
          return NextResponse.json({ result: { output: "You don’t have access to the Email Finder tool." } });
        }

        const linkedin_url = String(toolArgs?.linkedin_url || "").trim();
        if (!linkedin_url) {
          return NextResponse.json({
            result: { output: "Please paste a LinkedIn profile URL (e.g., https://www.linkedin.com/in/username/) so I can look up the email." },
          });
        }

        const res = await runEmailFinder(
          { linkedin_url },
          {
            baseUrl: MCP_SERVER.endpoint,
            headers: { [MCP_SERVER.authHeaderName]: MCP_SERVER.authHeaderValue },
            timeoutMs: 30_000,
          }
        );

        if (!res.ok) {
          return NextResponse.json({
            result: { output: "The email lookup tool had a problem. You can ask me to try again, or I can draft an outreach email instead." },
          });
        }

        const envelope = res.envelope as any;
        const card = res.card as KingaCard | undefined;

        const output = await synthesizeWithLLM({
          envelope,
          message,
          modelConfig: modelConfig!,
          conversationHistory,
          documentContext,
        });

        const result: ApiResult = {
          output,
          card,
          suggestedTitle: llmTitle || "Email result",
        };
        return NextResponse.json({ result });
      }

      // Unknown tool: degrade gracefully
      return NextResponse.json({
        result: {
          output:
            "That tool isn’t available here yet. Tell me what you need and I’ll help directly.",
          suggestedTitle: llmTitle || autoTitleFrom(message || currentArtifactTitle || ""),
        },
      });
    }

    // Shouldn’t reach here
    return NextResponse.json({
      result: {
        output: "I couldn’t process that request. Please try again.",
        suggestedTitle: llmTitle || autoTitleFrom(message || currentArtifactTitle || ""),
      },
    });
  } catch (err: any) {
    console.error("[/api/chat] error:", err);
    return NextResponse.json(
      {
        result: {
          output:
            "Something went wrong while processing your request. Please try again.",
          suggestedTitle: "New chat",
        },
      },
      { status: 200 }
    );
  }
}
