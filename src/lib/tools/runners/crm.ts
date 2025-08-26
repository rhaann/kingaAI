/**
 * runners/crm.ts — Kinga CRM (MCP) runner
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
 * Run the CRM MCP tool.
 * `args.crm_handoff_package` must be a string (stringified JSON).
 */
export async function runCrm(
  args: { crm_handoff_package: string },
  ctx: ToolRunContext
): Promise<ToolRunResult> {
  const started = Date.now();

  try {
    const mcp = await callMCPToolSSE({
      baseUrl: ctx.baseUrl,
      headers: ctx.headers,
      toolName: "TestCRM",
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
      error: err instanceof Error ? err.message : "CRM failed",
      durationMs: Date.now() - started,
    };
  }
}
