/**
 * src/lib/tools/router.ts
 *
 * Hard-route: Email Finder via your n8n MCP gateway.
 * - No AVAILABLE_TOOLS
 * - No “same URL” blocking
 * - Uses env: N8N_MCP_BASE_URL, N8N_AUTH_HEADER_NAME, N8N_AUTH_HEADER_VALUE
 * - Returns a concise text + optional KingaCard + suggestedTitle
 */

import type { KingaCard } from "@/types/types";
import { runEmailFinder } from "@/lib/tools/runners/emailFinder";

// export type SimpleTurn = { role: "user" | "assistant"; content: string };

export type RouterResult =
  | { handled: true; output: string; card?: KingaCard; suggestedTitle?: string }
  | { handled: false };


  type EmailFinderData = {
    full_name?: string;
    first_name?: string;
    last_name?: string;
    company?: string;
  };

// LinkedIn profile URL
const LINKEDIN_IN_RE = /https?:\/\/(?:www\.)?linkedin\.com\/in\/[^\s)]+/i;

// “find email” intent (keeps compose/“write an email” out)
const LOOKUP_INTENT_RE =
  /\b(find|lookup|look\s*up|get|fetch|discover|pull|what(?:'s| is))\b[^\n]{0,40}\b(e[-\s]?mail|email|contact(?:\s*(?:info|information)?)?)\b|\b(e[-\s]?mail|email)\s*address\b/i;

/** Small helper so we can log config problems without leaking secrets */
function debugConfig(): { ok: boolean; reason?: string; base?: string; headerName?: string } {
  const base = process.env.N8N_MCP_BASE_URL;
  const headerName = process.env.N8N_AUTH_HEADER_NAME;
  const headerValue = process.env.N8N_AUTH_HEADER_VALUE;

  if (!base) return { ok: false, reason: "N8N_MCP_BASE_URL missing" };
  if (!headerName) return { ok: false, reason: "N8N_AUTH_HEADER_NAME missing", base };
  if (!headerValue) return { ok: false, reason: "N8N_AUTH_HEADER_VALUE missing", base, headerName };
  return { ok: true, base, headerName };
}

export async function hardRouteEmailFinder(
  message: string,
  // conversationHistory?: SimpleTurn[]
): Promise<RouterResult> {
  const text = String(message || "");

  // Not a lookup → let the LLM handle it
  if (!LOOKUP_INTENT_RE.test(text)) return { handled: false };

  // Need a LinkedIn URL
  const linkedin_url = text.match(LINKEDIN_IN_RE)?.[0];
  if (!linkedin_url) {
    return {
      handled: true,
      output:
        "Please paste the LinkedIn profile URL (e.g., https://www.linkedin.com/in/username/) so I can look up the email.",
    };
  }

  // Config check
  const cfg = debugConfig();
  if (!cfg.ok) {
    console.warn("[email_finder] not configured:", cfg.reason);
    return {
      handled: true,
      output:
        "The email finder isn’t available right now. I can still draft an outreach email if you’d like.",
    };
  }

  // Call your existing runner exactly once
  const res = await runEmailFinder(
    { linkedin_url },
    {
      baseUrl: process.env.N8N_MCP_BASE_URL!,
      headers: {
        [process.env.N8N_AUTH_HEADER_NAME!]: process.env.N8N_AUTH_HEADER_VALUE!,
      },
      timeoutMs: 30_000,
      // mcpToolName: "EmailFinder" // only if your n8n MCP names it differently
    }
  );

  if (!res.ok) {
    console.warn("[email_finder] runner failed:", res.error || "unknown error");
    return {
      handled: true,
      output:
        "The email lookup tool had a problem. You can ask me to try again, or I can draft an outreach email instead.",
    };
  }

  // Shape result text + card + suggested title
  const envelope = res.envelope as { data?: EmailFinderData; summary?: string } | null | undefined;
  const card = res.card as KingaCard | undefined;

  const d = envelope?.data || {};
  const name = d.full_name || `${d.first_name || ""} ${d.last_name || ""}`.trim();
  const company = d.company || "";
  const summary = envelope?.summary || "Email lookup result.";
  const suggestedTitle = name ? `Email · ${name}${company ? ` — ${company}` : ""}` : "Email result";

  // Include a machine-readable block the LLM can use on the next turn (optional)
  const toolJsonBlock =
    `<tool_json tool="email_finder" v="1">\n${JSON.stringify(envelope)}\n</tool_json>`;

  const output = `${summary}${card ? " See the card below." : ""}\n${toolJsonBlock}`;

  return { handled: true, output, card, suggestedTitle };
}
