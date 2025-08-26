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
  data?: unknown;
  ui?: { mime?: string; content?: KingaCard };
  meta?: unknown;
}

/* ----------------------------- small helpers ----------------------------- */

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

const hasProp = <K extends string>(
  v: unknown,
  key: K
): v is Record<K, unknown> => isObject(v) && key in v;

const hasJson = (v: unknown): v is { json?: unknown } => isObject(v) && "json" in v;
const hasText = (v: unknown): v is { text?: unknown } => isObject(v) && "text" in v;
const hasContent = (v: unknown): v is { content?: unknown } =>
  isObject(v) && "content" in v;

/* --------------------------------- API --------------------------------- */

export function extractKingaEnvelope(
  mcp: unknown,
  rawToolText?: string
): { envelope: KingaEnvelope | null; foundVia: string | null } {
  const r = hasProp(mcp, "result") ? (mcp as { result: unknown }).result : mcp;

  // 1) OpenAI-style: result.content[0].json or result.content[0].text (JSON)
  if (hasContent(r) && Array.isArray((r as { content?: unknown[] }).content)) {
    const content = (r as { content: unknown[] }).content;

    const jsonPart = content.find((p) => hasJson(p) && (p as { json?: unknown }).json != null) as
      | { json?: unknown }
      | undefined;
    if (jsonPart?.json !== undefined) {
      return { envelope: normalize(jsonPart.json), foundVia: "content[].json" };
    }

    const textPart = content.find(
      (p) => hasText(p) && typeof (p as { text?: unknown }).text === "string"
    ) as { text?: unknown } | undefined;
    if (textPart?.text && typeof textPart.text === "string") {
      const env = safeParse(textPart.text);
      if (env != null) return { envelope: normalize(env), foundVia: "content[].text(JSON)" };
    }
  }

  // 2) n8n items: [ { json: ... } ] or direct array of envelopes
  if (Array.isArray(r)) {
    const first = (r as unknown[])[0];
    const v = hasJson(first) ? (first as { json?: unknown }).json : first;
    if (v !== undefined && v !== null) {
      return { envelope: normalize(v), foundVia: "array[0]" };
    }
  }

  // 3) { json: ... } wrapper
  if (hasJson(r) && (r as { json?: unknown }).json != null) {
    return { envelope: normalize((r as { json?: unknown }).json), foundVia: "result.json" };
  }

  // 4) Object already looks like an envelope (has toolId or ui)
  if (isObject(r) && (("toolId" in r) || ("ui" in r))) {
    return { envelope: normalize(r), foundVia: "result.self" };
  }

  // 5) Last resort: try parsing the raw text we already built
  if (typeof rawToolText === "string" && rawToolText.trim()) {
    const parsed = safeParse(rawToolText);
    if (parsed != null) {
      const first = Array.isArray(parsed)
        ? (hasJson((parsed as unknown[])[0]) ? ((parsed as unknown[])[0] as { json?: unknown }).json : (parsed as unknown[])[0])
        : (hasJson(parsed) ? (parsed as { json?: unknown }).json : parsed);
      if (first !== undefined && first !== null) {
        return { envelope: normalize(first), foundVia: "rawText.parse" };
      }
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
export function buildCtxFromEnvelope(env: KingaEnvelope | null): Record<string, string> {
  if (!env?.data || !isObject(env.data)) return {};
  const d = env.data as Record<string, unknown>;

  const firstString = (...keys: string[]): string => {
    for (const k of keys) {
      const v = d[k];
      if (typeof v === "string" && v.trim()) return v;
    }
    return "";
    };

  const name =
    firstString("full_name") ||
    [firstString("first_name"), firstString("last_name")].filter(Boolean).join(" ").trim() ||
    firstString("name");

  const email = firstString("email", "primary_email");
  const company = firstString("company", "organization", "org");
  const linkedin = firstString("linkedin_url", "url");

  return { name, email, company, linkedin };
}

/* ------------------------------ internals ------------------------------ */

function normalize(v: unknown): KingaEnvelope {
  // If n8n returned an array-wrapped envelope, unwrap
  const env = Array.isArray(v) ? (v[0] ?? {}) : (v ?? {});
  return env as KingaEnvelope;
}

function safeParse(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function shallowScanForEnvelope(root: unknown): unknown | null {
  const seen = new Set<unknown>();
  const q: unknown[] = [];
  const push = (v: unknown) => {
    if (isObject(v) || Array.isArray(v)) {
      if (!seen.has(v)) {
        seen.add(v);
        q.push(v);
      }
    }
  };

  push(root);
  let steps = 0;
  while (q.length && steps < 400) {
    steps++;
    const cur = q.shift();
    if (!cur) continue;

    if (isObject(cur)) {
      // { ui: { mime: "application/kinga.card+json" } }
      if (
        "ui" in cur &&
        isObject((cur as Record<string, unknown>).ui) &&
        (cur as { ui: { mime?: unknown } }).ui.mime === "application/kinga.card+json"
      ) {
        return cur;
      }

      if ("json" in cur) push((cur as { json?: unknown }).json);

      for (const [k, v] of Object.entries(cur as Record<string, unknown>)) {
        if (k === "content" && Array.isArray(v)) {
          for (const part of v as unknown[]) {
            if (hasJson(part) && (part as { json?: unknown }).json != null) {
              return (part as { json?: unknown }).json as unknown;
            }
            push(part);
          }
        } else {
          push(v);
        }
      }
    } else if (Array.isArray(cur)) {
      for (const v of cur as unknown[]) push(v);
    }
  }
  return null;
}
