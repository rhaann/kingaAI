/**
 * runners/emailFinder.ts — Email Finder (MCP) runner
 *
 * Purpose:
 * - Calls the n8n MCP gateway tool "email_finder" with { linkedin_url }.
 * - Normalizes the response to your standard envelope and returns { ok, envelope, card }.
 *
 * Behavior:
 * - Times out safely (default 30s) and reports "timeout" / "network error".
 * - Injects latency (ms) into envelope.meta.latencyMs for your route logger.
 * - Does NOT write logs itself; /api/chat/route parses <tool_json> and logs.
 *
 * Inputs:
 *   runEmailFinder({ linkedin_url }, { baseUrl, headers, timeoutMs, mcpToolName? })
 */

import { callMCPToolSSE } from "@/lib/mcpClient";
import type { KingaCard } from "@/types/types";
import {
  extractKingaEnvelope,
  getCardFromEnvelope,
  buildCtxFromEnvelope,
} from "@/lib/tools/envelope";
import type { KingaEnvelope } from "@/lib/tools/envelope";

// Context passed in by the router/route
export interface ToolRunContext {
  baseUrl: string;
  headers: Record<string, string>;
  timeoutMs?: number;
  /** Optional override; default matches your n8n MCP sub-tool id */
  mcpToolName?: string;
}

// Normalized result returned to the route
export interface ToolRunResult {
  ok: boolean;
  envelope?: KingaEnvelope | null;
  card?: KingaCard | null;
  ctx?: Record<string, string>;
  raw?: unknown;
  error?: string;
  durationMs: number;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

/**
 * Run the Email Finder MCP tool.
 * `args.linkedin_url` must be a LinkedIn profile URL (string).
 */
export async function runEmailFinder(
  args: { linkedin_url: string },
  ctx: ToolRunContext
): Promise<ToolRunResult> {
  const started = Date.now();

  try {
    const mcp = await callMCPToolSSE({
      baseUrl: ctx.baseUrl,
      headers: ctx.headers,
      toolName: "TestEmailFinder", // <-- your MCP sub-tool id
      args,
      timeoutMs: ctx.timeoutMs ?? 30_000,
    });

    // Surface raw for debugging if needed
    const raw: unknown =
      (isObject(mcp) && "result" in mcp ? (mcp as { result?: unknown }).result : undefined) ??
      mcp;

    // Extract envelope across common MCP response shapes
    const result = isObject(mcp) && "result" in mcp ? (mcp as { result?: unknown }).result : undefined;

    let rawText: string | undefined;
    if (typeof result === "string") {
      rawText = result;
    } else if (isObject(result) && "content" in result) {
      const content = (result as { content?: unknown }).content;
      if (Array.isArray(content)) {
        const first = content[0];
        if (isObject(first) && typeof (first as { text?: unknown }).text === "string") {
          rawText = (first as { text: string }).text;
        }
      }
    }

    const { envelope } = extractKingaEnvelope(mcp, rawText);
    const card = getCardFromEnvelope(envelope);
    const compactCtx = buildCtxFromEnvelope(envelope);

    return {
      ok: !!envelope,
      envelope,
      card,
      ctx: compactCtx,
      raw,
      durationMs: Date.now() - started,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Email Finder failed",
      durationMs: Date.now() - started,
    };
  }
}
