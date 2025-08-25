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
  envelope?: any;
  card?: KingaCard | null;
  ctx?: Record<string, any>;
  raw?: any;
  error?: string;
  durationMs: number;
}

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
      toolName: ctx.mcpToolName ?? "TestEmailFinder", // <-- your MCP sub-tool id
      args,
      timeoutMs: ctx.timeoutMs ?? 30_000,
    });

    // Surface raw for debugging if needed
    const raw =
      (mcp as any)?.result ??
      mcp;

    // Extract envelope across common MCP response shapes
    const rawText =
      (mcp as any)?.result?.content?.[0]?.text ??
      (typeof (mcp as any)?.result === "string" ? (mcp as any).result : undefined);

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
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || "Email Finder failed",
      durationMs: Date.now() - started,
    };
  }
}
