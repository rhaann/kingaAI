/**
 * runners/emailFinder.ts — executes the Email Finder tool end-to-end.
 * - Calls the MCP tool on n8n
 * - Extracts a stable Kinga envelope (and UI card) from varied MCP shapes
 * - Returns a normalized result (ok/envelope/card/ctx/raw/durationMs)
 *
 * This module does NOT decide when to run; the router/route does.
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
