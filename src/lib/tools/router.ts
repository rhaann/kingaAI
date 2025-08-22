/**
 * src/lib/tools/router.ts
 *
 * Hard-routes Email Finder before the LLM using simple intent + URL checks,
 * uses conversation history to detect repeats, and calls the MCP runner.
 * Fix: only block duplicate URLs after a successful run; if the last
 * assistant message indicates an error, allow an immediate retry.
 */

import { AVAILABLE_TOOLS } from "@/lib/toolsConfig";
import type { KingaCard } from "@/types/types";
import { runEmailFinder } from "@/lib/tools/runners/emailFinder";

export type SimpleTurn = { role: "user" | "assistant"; content: string };

export type RouterResult =
  | { handled: true; output: string; card?: KingaCard; suggestedTitle?: string }
  | { handled: false };

// LinkedIn profile URL
const LINKEDIN_IN_RE = /https?:\/\/(?:www\.)?linkedin\.com\/in\/[^\s)]+/i;

// Lookup vs Compose intents
const LOOKUP_INTENT_RE =
  /\b(find|lookup|look\s*up|get|fetch|discover|pull|what(?:'s| is))\b[^\n]{0,40}\b(e[-\s]?mail|email|contact(?:\s*(?:info|information)?)?)\b|\b(e[-\s]?mail|email)\s*address\b/i;
const COMPOSE_INTENT_RE =
  /\b(write|draft|compose|polish|revise|improve|send)\b[^\n]{0,40}\b(e[-\s]?mail|email)\b/i;

// Simple failure window: 2 fails within 5m -> say tool is down
const FAIL_TTL_MS = 5 * 60 * 1000;
const failMap = new Map<string, { count: number; ts: number }>();
function bumpFail(key: string): number {
  const now = Date.now();
  const prev = failMap.get(key);
  if (!prev || now - prev.ts > FAIL_TTL_MS) {
    failMap.set(key, { count: 1, ts: now });
    return 1;
  }
  const next = { count: prev.count + 1, ts: now };
  failMap.set(key, next);
  return next.count;
}
function clearFail(key: string) {
  failMap.delete(key);
}

export async function hardRouteEmailFinder(
  message: string,
  conversationHistory?: SimpleTurn[]
): Promise<RouterResult> {
  const text = String(message || "");

  const wantsLookup = LOOKUP_INTENT_RE.test(text);
  const wantsCompose = COMPOSE_INTENT_RE.test(text);

  // If the user is asking to write/compose an email, don't hard-route.
  if (wantsCompose && !wantsLookup) return { handled: false };
  if (!wantsLookup) return { handled: false };

  // Require a LinkedIn URL
  const urlMatch = text.match(LINKEDIN_IN_RE);
  const linkedin_url = urlMatch?.[0];
  if (!linkedin_url) {
    return {
      handled: true,
      output:
        "Please paste a LinkedIn profile URL (for example: https://www.linkedin.com/in/username/) so I can look up the email.",
    };
  }

  // Duplicate guard: only block if previous turn was a *successful* run
  const lastUserUrl = conversationHistory
    ?.slice()
    .reverse()
    .find((t) => t.role === "user" && LINKEDIN_IN_RE.test(t.content))
    ?.content.match(LINKEDIN_IN_RE)?.[0];

  const lastAssistantText =
    conversationHistory?.slice().reverse().find((t) => t.role === "assistant")?.content || "";

  // If last assistant said there was an error, allow retry without blocking
  const prevWasError = /isn['’]?t configured|tool failed|appears to be down|lookup tool/i.test(
    lastAssistantText
  );
  const forcedRetry = /(?:\bretry\b|\bagain\b)/i.test(text);

  if (lastUserUrl && lastUserUrl === linkedin_url && !forcedRetry && !prevWasError) {
    return {
      handled: true,
      output:
        "That looks like the same LinkedIn URL as before. Please paste a different profile link, or say “retry” to run it again.",
    };
  }

  // MCP gateway tool (your n8n MCP server)
  const agent = AVAILABLE_TOOLS.find((t) => t.name === "kinga_agent");
  if (!agent || agent.executionType !== "n8n" || !agent.authentication?.secret) {
    return {
      handled: true,
      output:
        "Email lookup isn’t configured in this environment. Please provide a different task, or try again later.",
    };
  }

  const res = await runEmailFinder(
    { linkedin_url },
    {
      baseUrl: agent.endpoint,
      headers: { [agent.authentication.headerName]: agent.authentication.secret! },
      timeoutMs: 30_000,
      // mcpToolName: "TestEmailFinder", // set if your MCP tool id differs
    }
  );

  if (!res.ok) {
    const n = bumpFail(linkedin_url);
    if (n >= 2) {
      return {
        handled: true,
        output:
          "The email lookup tool appears to be down. Please try again later or provide a different task.",
      };
    }
    return {
      handled: true,
      output:
        "The email lookup tool failed. You can say “retry” to try again, or paste a different LinkedIn profile URL.",
    };
  }

  clearFail(linkedin_url);

  const envelope = res.envelope as any;
  const card = res.card as KingaCard | undefined;
  const d = envelope?.data || {};
  const ctx = {
    name: d.full_name || `${d.first_name || ""} ${d.last_name || ""}`.trim(),
    email: d.email || "",
    company: d.company || "",
    linkedin: d.linkedin_url || linkedin_url,
  };

  const toolJsonBlock =
    `<tool_json tool="email_finder" v="1">\n${JSON.stringify(envelope)}\n</tool_json>`;
  const ctxBlock = `<ctx tool="email_finder" v="1">\n${JSON.stringify(ctx)}\n</ctx>`;
  const output = `${envelope?.summary || "Result."} See card below.\n${toolJsonBlock}\n${ctxBlock}`;

  const suggestedTitle = ctx.name
    ? `Email · ${ctx.name}${ctx.company ? ` — ${ctx.company}` : ""}`
    : "Email result";

  return { handled: true, output, card, suggestedTitle };
}
