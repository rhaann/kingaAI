import { NextRequest, NextResponse } from "next/server";
import { sendMessage } from "@/lib/sendMessage";
import type { KingaCard, ModelConfig } from "@/types/types";
import { runWebSearch } from "@/lib/tools/runners/search";
import { runCrm } from "@/lib/tools/runners/crm";
import { MCP_SERVER, llmToolsForPermissions } from "@/config/toolsConfig";
import { runEmailFinder } from "@/lib/tools/runners/emailFinder";
import { getUserFromRequest } from "@/services/authRequest";
import { adminDb } from "@/services/firebaseAdmin";
import { buildSynthesisPrompt } from "@/lib/prompt/synthesisPrompt";
import { buildTitlePrompt } from "@/lib/prompt/titlePrompt";



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
  type Finding = { source?: unknown };
  type Minimal = {
    data?: {
      website?: unknown;
      linkedin_url?: unknown;
      findings?: Finding[];
    };
    meta?: { source?: unknown };
  };

  const out: Record<string, string> = {};
  const add = (u: unknown) => {
    if (typeof u === "string" && u.trim()) out[u] = cleanUrl(u);
  };

  const collectFrom = (env: unknown) => {
    if (env && typeof env === "object") {
      const e = env as Minimal;
      add(e.data?.website);
      add(e.data?.linkedin_url);
      if (Array.isArray(e.data?.findings)) {
        for (const f of e.data.findings) add(f?.source);
      }
      if (Array.isArray(e.meta?.source)) {
        for (const s of e.meta.source as unknown[]) add(s);
      }
    }
  };

  if (Array.isArray(envelope)) {
    for (const env of envelope) collectFrom(env);
  } else {
    collectFrom(envelope);
  }

  return out;
}


async function synthesizeWithLLM({
  envelope,
  modelConfig,
  conversationHistory = [],
}: {
  envelope: unknown;
  modelConfig: ModelConfig;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<string> {
  const sanitizedUrls = buildSanitizedUrlsMap(envelope);

  const synthesisPrompt = buildSynthesisPrompt(envelope, sanitizedUrls);

  const llm = await sendMessage(synthesisPrompt, {
    modelConfig,
    conversationHistory,
    // Important: disable document context and nudges so the synthesis step
    // never triggers the doc-update safety net or tool calls.
    documentContext: undefined,
    tools: [],
    disableNudges: true,
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
  const prompt = buildTitlePrompt(message, envelope?.summary ? String(envelope.summary) : undefined);

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
            timeoutMs: 60_000,
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
          modelConfig: modelConfig!,
          conversationHistory,
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
          modelConfig: modelConfig!,
          conversationHistory,
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
          modelConfig: modelConfig!,
          conversationHistory,
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

    // --- NEW: Multiple tool calls in a single turn -------------------------
    if (llm.type === "multi_tool_calls") {
      const calls = Array.isArray(llm.calls) ? llm.calls.slice(0, 3) : [];
      if (calls.length === 0) {
        return NextResponse.json({ result: { output: "I couldn’t determine which tools to use." } });
      }

      // Execute external MCP tools in parallel; handle internal doc tools inline first
      const envelopes: unknown[] = [];
      const ledger: Array<{ tool: string; args: Record<string, unknown>; ok: boolean; durationMs?: number; note?: string }> = [];
      let card: KingaCard | undefined;

      // 1) Handle at most one internal doc tool (create/update) first
      const docCall = calls.find(c => c.toolName === "create_document" || c.toolName === "update_document");
      if (docCall) {
        if (docCall.toolName === "create_document") {
          const artifact = buildNewArtifact(docCall.toolArgs as any);
          const result: ApiResult = {
            output: `I've created a document for you: "${artifact.title}"`,
            artifact,
            suggestedTitle: llmTitle || artifact.title || autoTitleFrom(message || ""),
          };
          return NextResponse.json({ result });
        }
        if (docCall.toolName === "update_document") {
          if (!currentArtifactId) {
            return NextResponse.json({
              result: {
                output:
                  "I need to know which document is open to update it. Please open a document and try again.",
                suggestedTitle: llmTitle || autoTitleFrom(message || currentArtifactTitle || ""),
              },
            });
          }
          const artifact = buildUpdateArtifact(currentArtifactId, docCall.toolArgs as any);
          const result: ApiResult = {
            output: "I've updated the document for you.",
            artifact,
            suggestedTitle: llmTitle || currentArtifactTitle || autoTitleFrom(message || ""),
          };
          return NextResponse.json({ result });
        }
      }

      // 2) Filter and run allowed MCP tools in parallel (cap at 3)
      const external = calls.filter(c => c.toolName !== "create_document" && c.toolName !== "update_document");
      const limited = external.slice(0, 3);

      const runners = limited.map(async (c) => {
        if (c.toolName === "search") {
          if (!toolFlags.search) return { ok: false, envelope: { summary: "Search not permitted" } } as unknown as { ok: boolean; envelope: unknown };
          const agent_query = String((c.toolArgs as Record<string, unknown> | undefined)?.agent_query || "").trim();
          if (!agent_query) return { ok: false, envelope: { summary: "Missing agent_query" } } as unknown as { ok: boolean; envelope: unknown };
          return runWebSearch(
            { agent_query },
            { baseUrl: MCP_SERVER.endpoint, headers: { [MCP_SERVER.authHeaderName]: MCP_SERVER.authHeaderValue }, timeoutMs: 30_000 }
          );
        }
        if (c.toolName === "email_finder") {
          if (!toolFlags.email_finder) return { ok: false, envelope: { summary: "Email finder not permitted" } } as unknown as { ok: boolean; envelope: unknown };
          const linkedin_url = String((c.toolArgs as Record<string, unknown> | undefined)?.linkedin_url || "").trim();
          if (!linkedin_url) return { ok: false, envelope: { summary: "Missing linkedin_url" } } as unknown as { ok: boolean; envelope: unknown };
          return runEmailFinder(
            { linkedin_url },
            { baseUrl: MCP_SERVER.endpoint, headers: { [MCP_SERVER.authHeaderName]: MCP_SERVER.authHeaderValue }, timeoutMs: 30_000 }
          );
        }
        if (c.toolName === "crm") {
          if (!toolFlags.crm) return { ok: false, envelope: { summary: "CRM not permitted" } } as unknown as { ok: boolean; envelope: unknown };
          const rawPkg = (c.toolArgs as Record<string, unknown> | undefined)?.crm_handoff_package;
          const pkg = typeof rawPkg === "string" ? rawPkg : JSON.stringify(rawPkg ?? {});
          if (!pkg) return { ok: false, envelope: { summary: "Missing crm_handoff_package" } } as unknown as { ok: boolean; envelope: unknown };
          return runCrm(
            { crm_handoff_package: pkg },
            { baseUrl: MCP_SERVER.endpoint, headers: { [MCP_SERVER.authHeaderName]: MCP_SERVER.authHeaderValue }, timeoutMs: 30_000 }
          );
        }
        return { ok: false, envelope: { summary: `Unsupported tool: ${c.toolName}` } } as unknown as { ok: boolean; envelope: unknown };
      });

      const results = await Promise.allSettled(runners);
      results.forEach((r, idx) => {
        const c = limited[idx];
        if (r.status === "fulfilled") {
          const val = r.value as { ok?: boolean; envelope?: unknown; card?: KingaCard | undefined; durationMs?: number };
          const ok = !!val?.ok;
          if (val?.envelope) envelopes.push(val.envelope);
          if (!card && val?.card) card = val.card as KingaCard;
          ledger.push({ tool: c.toolName, args: (c.toolArgs as Record<string, unknown>) || {}, ok, durationMs: val?.durationMs });
        } else {
          envelopes.push({ summary: "Tool failed" });
          ledger.push({ tool: c.toolName, args: (c.toolArgs as Record<string, unknown>) || {}, ok: false, note: "promise rejected" });
        }
      });

      // Conditional continuation: if we have LinkedIn profile URLs and permission, try email_finder
      const allUrls = Object.keys(buildSanitizedUrlsMap(envelopes));
      const linkedinProfiles = allUrls.filter((u) => /https?:\/\/([a-z]+\.)?linkedin\.com\/in\//i.test(u));

      if (linkedinProfiles.length === 1) {
        if (toolFlags.email_finder) {
          const linkedin_url = linkedinProfiles[0];
          const ef = await runEmailFinder(
            { linkedin_url },
            { baseUrl: MCP_SERVER.endpoint, headers: { [MCP_SERVER.authHeaderName]: MCP_SERVER.authHeaderValue }, timeoutMs: 30_000 }
          );
          if (ef?.ok) {
            envelopes.push(ef.envelope);
          } else {
            envelopes.push({ summary: "Email finder failed on the selected profile." });
          }
        } else {
          envelopes.push({ summary: "Email finder not permitted for this user." });
        }
      } else if (linkedinProfiles.length > 1) {
        const pickList = linkedinProfiles.map((u) => `- ${cleanUrl(u)} (${u})`).join("\n");
        const pickMsg = [
          "I found multiple LinkedIn profiles that might match. Please confirm which one to use:",
          pickList,
        ].join("\n");
        const result: ApiResult = {
          output: pickMsg,
          suggestedTitle: llmTitle || autoTitleFrom(message || currentArtifactTitle || ""),
          rawEnvelopes: envelopes,
        };
        return NextResponse.json({ result });
      }

      // Conditional CRM continuation: if we have a single likely company website/domain
      const hosts = new Set<string>();
      for (const raw of allUrls) {
        try {
          const h = new URL(raw).hostname.toLowerCase();
          if (!h.includes("linkedin.com")) hosts.add(h);
        } catch {
          // ignore
        }
      }
      if (hosts.size === 1) {
        const [onlyHost] = Array.from(hosts);
        if (toolFlags.crm) {
          const pkg = JSON.stringify({ action: "lookup_or_upsert_company", website: onlyHost });
          const crmRes = await runCrm(
            { crm_handoff_package: pkg },
            { baseUrl: MCP_SERVER.endpoint, headers: { [MCP_SERVER.authHeaderName]: MCP_SERVER.authHeaderValue }, timeoutMs: 30_000 }
          );
          if (crmRes?.ok) {
            envelopes.push(crmRes.envelope);
          } else {
            envelopes.push({ summary: `CRM failed for ${onlyHost}.` });
          }
        } else {
          envelopes.push({ summary: "CRM not permitted for this user." });
        }
      } else if (hosts.size > 1) {
        const list = Array.from(hosts).map((h) => `- ${h}`).join("\n");
        const pickMsg = [
          "I found multiple company domains. Which one should I use for CRM?",
          list,
        ].join("\n");
        const result: ApiResult = {
          output: pickMsg,
          suggestedTitle: llmTitle || autoTitleFrom(message || currentArtifactTitle || ""),
          rawEnvelopes: envelopes,
        };
        return NextResponse.json({ result });
      }

      const output = await synthesizeWithLLM({
        envelope: envelopes,
        modelConfig: modelConfig!,
        conversationHistory,
      });

      // If the synthesis looks like an email draft, store as a document artifact instead of full chat text
      const looksLikeEmail = /(^\s*subject\s*:\s*)|(^\s*hi\b)|(^\s*hello\b)/i.test(output || "");
      if (looksLikeEmail) {
        const artifact = buildNewArtifact({ title: "Outreach email", content: output });
        const result: ApiResult = {
          output: `I drafted an email for you: "${artifact.title}"`,
          artifact,
          suggestedTitle: llmTitle || artifact.title || autoTitleFrom(message || ""),
          rawEnvelopes: envelopes,
        };
        return NextResponse.json({ result });
      }

      const result: ApiResult = {
        output,
        card,
        suggestedTitle: llmTitle || autoTitleFrom(message || currentArtifactTitle || ""),
        rawEnvelopes: envelopes,
      };
      // Note: ledger is intentionally not included in the public response yet; add if desired.
      return NextResponse.json({ result });
    }

    // --- Agent loop (one continuation step) --------------------------------
    // If the first response was text, we can still give the model one more chance
    // to call tools based on synthesized or prior results if desired. Here we keep it
    // simple: only continue when the first response requested tools (handled above).
    // For a true loop, we'd refactor the above into a function and reuse it here.

    // If you want a continuation when the first result is text, uncomment below to allow a follow-up:
    // const cont = await sendMessage(buildContinuationPrompt(message, []), {
    //   modelConfig: modelConfig!,
    //   conversationHistory,
    //   documentContext,
    //   tools: llmToolsForPermissions(permsForLLM),
    // });
    // ... handle cont similar to the branches above.

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
