/**
 * runners/search.ts — Kinga Search (MCP) runner
 *
 * Mirrors runners/emailFinder.ts:
 * - Uses SSE via callMCPToolSSE
 * - Extracts a Kinga envelope with envelope.ts helpers
 * - Returns a normalized result: { ok, envelope, card, ctx, raw, durationMs } | { ok:false, error,... }
 */

import { callMCPToolSSE } from "@/lib/mcpClient";
import type { KingaCard } from "@/types/types";
import {
  extractKingaEnvelope,
  getCardFromEnvelope,
  buildCtxFromEnvelope,
} from "@/lib/tools/envelope";

export type WebSearchInput = { agent_query: string };

export interface ToolRunContext {
  baseUrl: string;
  headers: Record<string, string>;
  timeoutMs?: number;
  /** Optional override; default matches your n8n MCP sub-tool id */
  mcpToolName?: string;
}

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
 * Run the Search MCP tool.
 * `args.agent_query` should be the search query/topic (string).
 */
export async function runWebSearch(
  args: WebSearchInput,
  ctx: ToolRunContext
): Promise<ToolRunResult> {
  const started = Date.now();

  try {
    const mcp = await callMCPToolSSE({
      baseUrl: ctx.baseUrl,
      headers: ctx.headers,
      toolName: "TestSearch",
      args,
      timeoutMs: ctx.timeoutMs ?? 30_000,
    });

    // Surface raw for debugging if needed
    const raw = (mcp as any)?.result ?? mcp;

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
      error: err?.message || "Search failed",
      durationMs: Date.now() - started,
    };
  }
}
