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

/** Read tool permissions from Firestore: users/{uid}/toolPermissions/tools */
async function readToolFlags(uid: string): Promise<{
  email_finder: boolean;
  search: boolean;
  crm: boolean;
}> {
  try {
    const snap = await adminDb.doc(`users/${uid}/toolPermissions`).get();
    console.log("[/api/chat] snap:", snap);
    if (!snap.exists) {
      return { email_finder: false, search: false, crm: false };
    }
    const d = snap.data() as any;
    return {
      email_finder: !!d?.email_finder,
      search: !!d?.search,
      crm: !!d?.crm,
    };
  } catch {
    return { email_finder: true, search: true, crm: true };
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

    // --- 3) Plain text path -------------------------------------------------
    if (llm.type === "text") {
      const result: ApiResult = {
        output: llm.content ?? "",
        suggestedTitle: autoTitleFrom(message || currentArtifactTitle || ""),
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
          suggestedTitle: artifact.title || autoTitleFrom(message || ""),
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
              suggestedTitle: autoTitleFrom(message || currentArtifactTitle || ""),
            },
          });
        }
        const artifact = buildUpdateArtifact(currentArtifactId, toolArgs);
        const result: ApiResult = {
          output: "I've updated the document for you.",
          artifact,
          suggestedTitle: currentArtifactTitle || autoTitleFrom(message || ""),
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
              suggestedTitle: autoTitleFrom(message || currentArtifactTitle || ""),
            },
          });
        }

        const envelope = res.envelope as any;
        const card = res.card as KingaCard | undefined;

        const toolJson = `<tool_json tool="search" v="1">\n${JSON.stringify(
          envelope
        )}\n</tool_json>`;
        const ctx = {
          query: envelope?.data?.query || agent_query,
          sources: envelope?.meta?.source || [],
        };
        const ctxBlock = `<ctx tool="search" v="1">\n${JSON.stringify(ctx)}\n</ctx>`;

        const result: ApiResult = {
          output: `${envelope?.summary || "Search results ready."}\n${toolJson}\n${ctxBlock}`,
          card,
          suggestedTitle:
            (agent_query.length > 60 ? agent_query.slice(0, 57) + "…" : agent_query) || "Search",
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
              suggestedTitle: autoTitleFrom(message || currentArtifactTitle || ""),
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
              suggestedTitle: "CRM",
            },
          });
        }

        const envelope = res.envelope as any;
        const card = res.card as KingaCard | undefined;

        const toolJson = `<tool_json tool="crm" v="1">\n${JSON.stringify(
          envelope
        )}\n</tool_json>`;
        const ctx = {
          intent: envelope?.data?.intent,
          entity: envelope?.data?.entity,
          ids: envelope?.data?.ids,
          notes: envelope?.data?.notes,
        };
        const ctxBlock = `<ctx tool="crm" v="1">\n${JSON.stringify(ctx)}\n</ctx>`;

        const prettyEntity = String(envelope?.data?.entity || "CRM").replace(/_/g, " ");

        const result: ApiResult = {
          output: `${envelope?.summary || "CRM action complete."}\n${toolJson}\n${ctxBlock}`,
          card,
          suggestedTitle: `CRM · ${prettyEntity}`,
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

        const d = envelope?.data || {};
        const name = d.full_name || `${d.first_name || ""} ${d.last_name || ""}`.trim();
        const company = d.company || "";
        const suggestedTitle = name ? `Email · ${name}${company ? ` — ${company}` : ""}` : "Email result";

        const toolJson = `<tool_json tool="email_finder" v="1">\n${JSON.stringify(envelope)}\n</tool_json>`;
        const summary = envelope?.summary || "Email lookup result.";

        const result: ApiResult = {
          output: `${summary}${card ? " See the card below." : ""}\n${toolJson}`,
          card,
          suggestedTitle,
        };
        return NextResponse.json({ result });
      }

      // Unknown tool: degrade gracefully
      return NextResponse.json({
        result: {
          output:
            "That tool isn’t available here yet. Tell me what you need and I’ll help directly.",
          suggestedTitle: autoTitleFrom(message || currentArtifactTitle || ""),
        },
      });
    }

    // Shouldn’t reach here
    return NextResponse.json({
      result: {
        output: "I couldn’t process that request. Please try again.",
        suggestedTitle: autoTitleFrom(message || currentArtifactTitle || ""),
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
