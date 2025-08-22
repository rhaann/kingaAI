/**
 * envelope.ts — extract/validate Kinga envelopes from MCP responses.
 * Finds a stable JSON envelope across common shapes (content[0].json, text JSON, array[0].json, result.json, or shallow deep-scan).
 * Exports: extractKingaEnvelope(), getCardFromEnvelope(), buildCtxFromEnvelope().
 */

import type { KingaCard } from "@/types/types";

export interface KingaEnvelope {
  toolId?: string;
  version?: string;
  status?: string;          // "ok" | "error" | "not_found" | etc.
  summary?: string;
  data?: any;
  ui?: { mime?: string; content?: KingaCard };
  meta?: any;
}

export function extractKingaEnvelope(mcp: any, rawToolText?: string): { envelope: KingaEnvelope | null; foundVia: string | null } {
  const r = mcp?.result ?? mcp;

  // 1) OpenAI-style: result.content[0].json
  if (r?.content && Array.isArray(r.content)) {
    const jsonPart = r.content.find((p: any) => p && typeof p === "object" && p.json);
    if (jsonPart?.json) return { envelope: normalize(jsonPart.json), foundVia: "content[].json" };

    const textPart = r.content.find((p: any) => p && typeof p.text === "string");
    if (textPart?.text) {
      const env = safeParse(textPart.text);
      if (env) return { envelope: normalize(env), foundVia: "content[].text(JSON)" };
    }
  }

  // 2) n8n items: [ { json: ... } ] or direct array of envelopes
  if (Array.isArray(r)) {
    const v = r[0]?.json ?? r[0];
    if (v) return { envelope: normalize(v), foundVia: "array[0]" };
  }

  // 3) { json: ... } wrapper
  if (r?.json) return { envelope: normalize(r.json), foundVia: "result.json" };

  // 4) Object already looks like an envelope
  if (r && typeof r === "object" && (r.toolId || r.ui)) return { envelope: normalize(r), foundVia: "result.self" };

  // 5) Last resort: try parsing the raw text we already built
  if (rawToolText && typeof rawToolText === "string") {
    const parsed = safeParse(rawToolText);
    if (parsed) {
      const first = Array.isArray(parsed) ? (parsed[0]?.json ?? parsed[0]) : (parsed?.json ?? parsed);
      if (first) return { envelope: normalize(first), foundVia: "rawText.parse" };
    }
  }

  // 6) Shallow deep-scan for { ui: { mime: "application/kinga.card+json" } }
  const env = shallowScanForEnvelope(r);
  if (env) return { envelope: normalize(env), foundVia: "deep-scan" };

  return { envelope: null, foundVia: null };
}

export function getCardFromEnvelope(env: KingaEnvelope | null): KingaCard | null {
  if (!env?.ui || env.ui.mime !== "application/kinga.card+json") return null;
  return env.ui.content ?? null;
}

/**
 * Build a compact <ctx> for reuse. Generic: tries common fields if present.
 */
export function buildCtxFromEnvelope(env: KingaEnvelope | null): Record<string, any> {
  if (!env?.data || typeof env.data !== "object") return {};
  const d: any = env.data;

  // Common identity fields if available
  const name =
    d.full_name ||
    [d.first_name, d.last_name].filter(Boolean).join(" ").trim() ||
    d.name ||
    "";
  const email = d.email || d.primary_email || "";
  const company = d.company || d.organization || d.org || "";
  const linkedin = d.linkedin_url || d.url || "";

  return { name, email, company, linkedin };
}

// -------------------- internals --------------------

function normalize(v: any): KingaEnvelope {
  // If n8n returned an array-wrapped envelope, unwrap
  const env = Array.isArray(v) ? v[0] ?? {} : v ?? {};
  return env as KingaEnvelope;
}

function safeParse(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function shallowScanForEnvelope(root: any): any | null {
  const seen = new Set<any>();
  const q: any[] = [];
  const push = (v: any) => {
    if (v && typeof v === "object" && !seen.has(v)) {
      seen.add(v);
      q.push(v);
    }
  };
  push(root);
  let steps = 0;
  while (q.length && steps < 400) {
    steps++;
    const cur = q.shift();
    if (!cur) continue;

    if (cur.ui && cur.ui.mime === "application/kinga.card+json") return cur;
    if (cur.json) push(cur.json);

    if (Array.isArray(cur)) {
      for (const v of cur) push(v);
    } else {
      for (const k of Object.keys(cur)) {
        const v = (cur as any)[k];
        if (k === "content" && Array.isArray(v)) {
          for (const part of v) {
            if (part?.json) return part.json;
            push(part);
          }
        } else {
          push(v);
        }
      }
    }
  }
  return null;
}
