import { NextRequest, NextResponse } from "next/server";
import { sendMessage } from "@/lib/sendMessage";
import type { KingaCard, ModelConfig } from "@/types/types";
import { runWebSearch } from "@/lib/tools/runners/search";
import { runCrm } from "@/lib/tools/runners/crm";
import { MCP_SERVER, llmToolsForPermissions } from "@/config/toolsConfig";
import { runEmailFinder } from "@/lib/tools/runners/emailFinder";
import { getUserFromRequest } from "@/services/authRequest";
import { adminDb } from "@/services/firebaseAdmin";



type ArtifactEnvelope = {
  id: string;
  title?: string;
  type?: string;
  createdAt?: number;
  updatedAt?: number;
  versions?: Array<{ content: string; createdAt: number }>;
};

type ToolEnvelope = Record<string, unknown> & {
  summary?: string;
  data?: { entity?: string };
};


/** What we return to the client */
type ApiResult = {
  output: string | null;
  card?: KingaCard;
  artifact?: ArtifactEnvelope; 
  suggestedTitle?: string;
  rawEnvelopes?: unknown[];
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
function buildNewArtifact(args: { title?: unknown; subject?: unknown; content?: unknown }): ArtifactEnvelope {
  const now = Date.now();
  const title =
    (typeof args?.title === "string" && args.title.trim()) ||
    (typeof args?.subject === "string" && args.subject.trim()) ||
    "Document";

    const content = typeof args?.content === "string" ? args.content : String(args?.content ?? "");
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
function buildUpdateArtifact(currentArtifactId: string | null, args: { content?: unknown }): ArtifactEnvelope {
  const now = Date.now();
  const content = typeof args?.content === "string" ? args.content : String(args?.content ?? "");
  return {
    id: currentArtifactId ?? crypto.randomUUID(),
    versions: [{ content, createdAt: now }], // client logic: single version => append
    updatedAt: now,
  };
}


async function readToolFlags(userId: string): Promise<{ [key: string]: boolean }> {
  const defaults: { [key: string]: boolean } = { crm: false, email_finder: false, search: false };

  // Helper: tolerate different boolean field names
  const pickBool = (data: Record<string, unknown>): boolean | undefined => {
    const candidates = ["enabled", "allowed", "allow", "value", "on", "active", "isEnabled"];
    for (const k of candidates) {
      const v = data?.[k];
      if (typeof v === "boolean") return v;
    }
    return undefined;
  };

  try {
    // 1) Try per-user collection: users/{uid}/toolPermissions/{toolId}
    const perUserSnap = await adminDb
      .collection("users")
      .doc(userId)
      .collection("toolPermissions")
      .get();
    if (!perUserSnap.empty) {
      const out = { ...defaults };
      perUserSnap.forEach((d) => {
        const data = d.data() as Record<string, unknown>;
        const on = pickBool(data);
        const key = d.id as keyof typeof out;
        if (typeof on === "boolean" && key in out) out[key] = on;
      });
      console.log("out", out);
      return out;
    }
  } catch (error) {
    console.error("Error fetching tool permissions:", error);
  }

  return defaults;
}

/** Clean URL for display: domain.com/path (no protocol, query, or hash). Truncate long paths. */
function cleanUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const host = u.hostname;
    const path = u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "");
    const trimmed = path.length > 60 ? path.slice(0, 60) + "…" : path;
    return host + trimmed;
  } catch {
    // Best-effort for non-absolute URLs
    const noQuery = raw.split("?")[0].split("#")[0].replace(/^https?:\/\//, "");
    const [host, ...rest] = noQuery.split("/");
    const path = rest.length ? "/" + rest.join("/") : "";
    const trimmed = path.length > 60 ? path.slice(0, 60) + "…" : path;
    return host + trimmed;
  }
}

/** Build a map of raw->clean URLs from common envelope fields. */
function buildSanitizedUrlsMap(envelope: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const add = (u?: string) => {
    if (!u || typeof u !== "string") return;
    out[u] = cleanUrl(u);
  };

  try {
    const e = envelope as any;
    add(e?.data?.website);
    add(e?.data?.linkedin_url);

    // search findings
    const findings = e?.data?.findings;
    if (Array.isArray(findings)) {
      for (const f of findings) add(f?.source);
    }

    // meta.sources array
    const srcs = e?.meta?.source;
    if (Array.isArray(srcs)) {
      for (const s of srcs) add(s);
    }
  } catch {
    /* ignore */
  }
  return out;
}

async function synthesizeWithLLM({
  envelope,
  message: _message,
  modelConfig,
  conversationHistory = [],
  documentContext,
}: {
  envelope: unknown;
  message: string;
  modelConfig: ModelConfig;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  documentContext?: string;
}): Promise<string> {
  const sanitizedUrls = buildSanitizedUrlsMap(envelope);

  const system = [
    "You are a results interpreter. Turn tool envelopes into a unified, conversational answer.",
    "Rules:",
    "- Base your answer ONLY on the envelope.",
    "- Do not mention which tool produced the data; no section headers or tool names.",
    "- Start with a 2–3 sentence summary that answers the user directly.",
    "- If the envelope includes a list (findings/results/items/records), weave in up to THREE concise items.",
    "- Dates should appear inline when present (e.g., “(2024-05-01–present)”).",
    "- Emails may be shown in full. Do NOT include internal IDs (companyId, contactId, runId, etc.).",
    "- URLs: when you include a link, render it as Markdown `[clean-domain.com/path](RAW_URL)`. Use <sanitized_urls> to map raw → clean. One link per bullet/line; no link lists.",    "- If the envelope indicates limitations/notes or partial access, append ONE italicized line at the end starting with “Note:” (no links there).",
    "- If status is failure or required fields are missing, give a brief, neutral explanation and a simple next step.",
    "- If you’re uncertain, say what’s missing and ask ONE clarifying question at the end.",
    "- Never repeat the raw URL after the Markdown link; do not append (URL) after [text](URL).",
    "- No space between the closing ']' and opening '(' in a link.",
    "- For links, output the bare clean URL text only: domain.com/path (no protocol, no []() Markdown).",
    "- Do not append the raw URL in parentheses after a link.",
    "- Keep ~150–250 words. Be clear and professional."
  ].join("\n");

  const payload = {
    user_query: _message,
    envelope,
    sanitized_urls: sanitizedUrls
  };

  const synthesisPrompt =
    `${system}\n\n<sanitized_urls>\n${JSON.stringify(sanitizedUrls, null, 2)}\n</sanitized_urls>\n` +
    `<envelope>\n${JSON.stringify(envelope)}\n</envelope>`;

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
  envelope?: ToolEnvelope;
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
    // const chatId: string | undefined = body.chatId; 

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

    // --- 2) Ask the model (LLM) --------------------------------------------
    // Build LLM tool list based on permissions
    const permsForLLM = {
      search: toolFlags.search,
      email_finder: toolFlags.email_finder,
      crm: toolFlags.crm,
    } as Record<string, boolean>;

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

        const envelope = res.envelope as ToolEnvelope;
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
          rawEnvelopes: [envelope],
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

        const envelope = res.envelope as ToolEnvelope;
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
          rawEnvelopes: [envelope],
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

        const envelope = res.envelope as ToolEnvelope;
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
          rawEnvelopes: [envelope],
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
  } catch (err: unknown) {
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
