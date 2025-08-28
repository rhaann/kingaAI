"use client";

import React, { useMemo, useState } from "react";
import { Copy, Check } from "lucide-react";

type FieldItem = { label: string; value: string };
type MCPEnvelope = { result?: { content?: Array<{ text?: unknown }> } };
type OpenAIMessageArray = Array<{ message?: { content?: unknown } }>;
type GenericObject = Record<string, unknown>;

const isObject = (v: unknown): v is GenericObject =>
  typeof v === "object" && v !== null && !Array.isArray(v);


/**
 * Very small helper: turn anything into a plain string for copy/render.
 */
function toStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  // Arrays / objects -> compact JSON (fallback)
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/**
 * Try to parse a JSON-looking payload (string that starts with { or [}).
 * Returns undefined if it's not JSON.
 */
function safeParseJSON(content: string): unknown | undefined {
  const trimmed = content.trim();
  if (!trimmed) return undefined;
  const looksJson = trimmed.startsWith("{") || trimmed.startsWith("[");
  if (!looksJson) return undefined;
  try {
    const parsed = JSON.parse(trimmed);
    // If it's an array with a single element, unwrap it for convenience
    if (Array.isArray(parsed) && parsed.length === 1) return parsed[0];
    return parsed;
  } catch {
    return undefined;
  }
}

/**
 * Try to extract "fields" from common LLM/MCP shapes.
 * - If it's an object with a "result.content[0].text" (MCP), lift it out.
 * - If it's an object, use its own keys.
 * Always return an ordered list of { label, value } preserving object key order.
 */
function extractFields(raw: unknown): Array<{ label: string; value: string }> | null {
  if (raw == null) return null;

  // MCP-ish shape: { result: { content: [{ text: "..." }] } }
  if (isObject(raw) && "result" in raw) {
    const env = raw as MCPEnvelope;
    const t = env.result?.content?.[0]?.text;
    if (typeof t === "string") {
      const inner = safeParseJSON(t);
      if (inner && isObject(inner)) {
        return extractFields(inner);
      }
      return [{ label: "Result", value: toStr(t) }];
    }
  }

  // Array of messages (OpenAI style) with first.message.content
  if (Array.isArray(raw) && raw.length) {
    const arr = raw as OpenAIMessageArray;
    const txt = arr[0]?.message?.content;
    const inner = typeof txt === "string" ? safeParseJSON(txt) : undefined;
    if (inner && isObject(inner)) {
      return extractFields(inner);
    }
    if (txt !== undefined) {
      return [{ label: "Result", value: toStr(txt) }];
    }
  }

  // Generic object → field list (preserve key order)
  if (isObject(raw)) {
    const out: Array<FieldItem> = [];
    for (const key of Object.keys(raw)) {
      const value = (raw as GenericObject)[key];
      out.push({ label: beautifyLabel(key), value: toStr(value) });
    }
    return out.length ? out : null;
  }

  // Primitive
  if (typeof raw !== "object") {
    return [{ label: "Result", value: toStr(raw) }];
  }

  return null;
}

/**
 * Turn snake_case / camelCase into “Title Case”.
 */
function beautifyLabel(key: string): string {
  return key
    .replace(/[_\-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}


// Clean a URL for display: domain.com/path (no protocol, no query/hash, drop trailing slash)
function cleanUrlForDisplay(raw: string): string {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, ""); // prefer domain.com over www.domain.com
    const path = u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "");
    return host + path;
  } catch {
    // Fallback for non-absolute URLs
    const noProto = raw.replace(/^https?:\/\//i, "");
    const noWww = noProto.replace(/^www\./i, "");
    return noWww.split(/[?#]/)[0].replace(/\/$/, "");
  }
}

// Normalize sloppy markdown like "[x] (url)" and remove duplicates "[x](url) (url)"
function normalizeLinkMarkup(s: string): string {
  if (!s) return s;
  // remove space between ] (
  s = s.replace(/\[([^\]]+)\]\s+\((https?:\/\/[^\s)]+)\)/g, "[$1]($2)");
  // drop duplicate raw url right after the markdown link
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)\s*\(\2\)/g, "[$1]($2)");
  return s;
}


/**
 * Detect URLs inside a string and render them as clickable links.
 */
function renderWithLinks(text: string) {
  if (!text) return <span className="text-foreground/80">—</span>;

  // Fix bad markdown spacing and duplicates first
  text = normalizeLinkMarkup(text);

  // Match either a markdown link OR a raw URL/mailto
  const re =
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^)]+)\)|(https?:\/\/[^\s)]+|mailto:[^\s)]+)/gi;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    const idx = m.index;

    // Push preceding plain text
    if (idx > lastIndex) {
      parts.push(<span key={`t-${lastIndex}`}>{text.slice(lastIndex, idx)}</span>);
    }

    
    const link = (m[2] || m[3]) ?? "";

    if (link.startsWith("mailto:")) {
      const email = link.replace(/^mailto:/i, "");
      parts.push(
        <a
          key={`a-${idx}`}
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2"
        >
          {email}
        </a>
      );
    } else {
      const display = cleanUrlForDisplay(link); // ← show only domain.com/path
      parts.push(
        <a
          key={`a-${idx}`}
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2"
        >
          {display}
        </a>
      );
    }

    lastIndex = idx + m[0].length; // consume the whole token (so we don't show "(url)" after)
  }

  // Tail
  if (lastIndex < text.length) {
    parts.push(<span key="t-end">{text.slice(lastIndex)}</span>);
  }

  return parts.length ? parts : <span className="text-foreground/80">—</span>;
}


type Props = {
  content: string;
};

/**
 * MarkdownRenderer
 * - Shows a simple label:value list.
 * - Empty values render as "—".
 * - Per-field copy on hover, plus a "Copy all" button at the bottom.
 * - If we cannot extract structured fields and content isn't JSON, we show the raw text.
 */
export default function MarkdownRenderer({ content }: Props) {
  const parsed = useMemo(() => safeParseJSON(content), [content]);
  const fieldList = useMemo(() => {
    if (parsed !== undefined) return extractFields(parsed);
    // If not JSON, try to be helpful: show the raw text as a single field
    return null;
  }, [parsed]);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const doCopy = async (text: string, key?: string) => {
    try {
      await navigator.clipboard.writeText(text);
      if (key) {
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 1200);
      } else {
        setCopiedAll(true);
        setTimeout(() => setCopiedAll(false), 1200);
      }
    } catch {
      // no-op
    }
  };

  if (!fieldList) {
    // Not structured — show the original text plainly (with links if any)
    return (
      <div className="text-base leading-relaxed whitespace-pre-wrap">
        {renderWithLinks(content)}
      </div>
    );
  }

  // Build "copy all" string
  const copyAllText = fieldList
    .map(({ label, value }) => `${label}: ${value || ""}`)
    .join("\n");

  const hasAnyNonEmpty = fieldList.some((f) => (f.value ?? "") !== "");

  return (
    <div className="space-y-2 text-base">
      {!hasAnyNonEmpty && (
        <div className="text-foreground/70 italic">
          We couldn’t find structured fields in this response.
        </div>
      )}

      <dl className="space-y-2">
        {fieldList.map(({ label, value }) => {
          const key = label;
          return (
            <div key={key} className="group flex items-start gap-2">
              <dt className="min-w-[110px] font-semibold">{label}:</dt>
              <dd className="flex-1 break-words">{renderWithLinks(value)}</dd>
              {/* per-field copy (shows on hover) */}
              <button
                aria-label={`Copy ${label}`}
                onClick={() => doCopy(value || "", key)}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-foreground/10"
                title={`Copy ${label}`}
              >
                {copiedKey === key ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
          );
        })}
      </dl>

      {/* Copy all */}
      <div className="pt-2">
        <button
          onClick={() => doCopy(copyAllText)}
          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-foreground/10 hover:bg-foreground/15 transition-colors"
          title="Copy all fields"
        >
          {copiedAll ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copiedAll ? "Copied" : "Copy all"}
        </button>
      </div>
    </div>
  );
}
