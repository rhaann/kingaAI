/**
 * runners/search.ts — Kinga Search (MCP) runner
 *
 * Purpose:
 * - Calls the n8n MCP gateway tool "search" with { agent_query }.
 * - Normalizes the response to your standard envelope and returns { ok, envelope, card }.
 *
 * Behavior:
 * - Times out safely (default 30s) and reports "timeout" / "network error".
 * - Accepts either a single envelope or [envelope] array from n8n.
 * - Back-compat: accepts envelope.toolId "search" or older "web_search".
 * - Injects latency (ms) into envelope.meta.latencyMs for your route logger.
 * - Does NOT write logs itself; /api/chat/route parses <tool_json> and logs.
 *
 * Inputs:
 *   runWebSearch({ agent_query }, { baseUrl, headers, timeoutMs, mcpToolName? })
 *
 * Outputs:
 *   { ok: true, envelope, card } on success (status "ok"/"success")
 *   { ok: false, error, envelope? } on failure
 */

import { MCP_TOOL_IDS } from "@/config/toolsConfig";

export type WebSearchInput = { agent_query: string };

type RunnerOpts = {
  baseUrl: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  mcpToolName?: string; // override if your n8n node id differs
};

type Ok = { ok: true; envelope: any; card?: any };
type Err = { ok: false; error: string; envelope?: any };
export type WebSearchResult = Ok | Err;

export async function runWebSearch(
  input: WebSearchInput,
  opts: RunnerOpts
): Promise<WebSearchResult> {
  const tool = opts.mcpToolName ?? MCP_TOOL_IDS.kinga_search; // "search"
  const url = opts.baseUrl;
  const headers = {
    "content-type": "application/json",
    ...(opts.headers ?? {}),
  };
  const timeoutMs = Math.max(1000, opts.timeoutMs ?? 30_000);

  const started = Date.now();
  let res: Response;

  try {
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), timeoutMs);

    res = await fetch(url, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        tool,          // <- n8n MCP tool id: "search"
        args: input,   // { agent_query }
      }),
    });

    clearTimeout(to);
  } catch (e: any) {
    return { ok: false, error: e?.name === "AbortError" ? "timeout" : "network error" };
  }

  const latencyMs = Date.now() - started;

  if (!res.ok) {
    return { ok: false, error: `mcp ${tool} http ${res.status}` };
  }

  let payload: any;
  try {
    payload = await res.json();
  } catch {
    return { ok: false, error: "invalid json from MCP" };
  }

  // n8n responds with a single envelope OR an array of 1
  const envelope = Array.isArray(payload) ? payload[0] : payload;

  // Back-compat: accept both "search" and older "web_search"
  const toolId = envelope?.toolId;
  const isSearch = toolId === "search" || toolId === "web_search";

  // Attach latency into meta for your route logger
  envelope.meta = { ...(envelope.meta ?? {}), latencyMs };

  if (isSearch && (envelope?.status === "ok" || envelope?.status === "success")) {
    return { ok: true, envelope, card: envelope?.ui?.content };
  }
  return { ok: false, error: String(envelope?.summary || "search failed"), envelope };
}
