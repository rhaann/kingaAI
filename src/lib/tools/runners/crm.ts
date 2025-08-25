/**
 * runners/crm.ts — Kinga CRM (MCP) runner
 *
 * Purpose:
 * - Calls the n8n MCP gateway tool "crm" with { crm_handoff_package } (stringified JSON).
 * - Normalizes the response to your standard envelope and returns { ok, envelope, card }.
 *
 * Behavior:
 * - Times out safely (default 30s) and reports "timeout" / "network error".
 * - Accepts either a single envelope or [envelope] array from n8n.
 * - Back-compat: accepts envelope.toolId "crm" or older "crm_upsert".
 * - Injects latency (ms) into envelope.meta.latencyMs for your route logger.
 * - Does NOT write logs itself; /api/chat/route parses <tool_json> and logs.
 *
 * Inputs:
 *   runCrm({ crm_handoff_package }, { baseUrl, headers, timeoutMs, mcpToolName? })
 *
 * Outputs:
 *   { ok: true, envelope, card } on success (status "success"/"ok")
 *   { ok: false, error, envelope? } on failure
 */

import { MCP_TOOL_IDS } from "@/config/toolsConfig";

export type CrmInput = { crm_handoff_package: string };

type RunnerOpts = {
  baseUrl: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  mcpToolName?: string; // override if your n8n node id differs
};

type Ok = { ok: true; envelope: any; card?: any };
type Err = { ok: false; error: string; envelope?: any };
export type CrmResult = Ok | Err;

export async function runCrm(
  input: CrmInput,
  opts: RunnerOpts
): Promise<CrmResult> {
  const tool = opts.mcpToolName ?? MCP_TOOL_IDS.kinga_crm; // "crm"
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
        tool,          // <- n8n MCP tool id: "crm"
        args: input,   // { crm_handoff_package }
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

  // Back-compat: accept both "crm" and older "crm_upsert"
  const toolId = envelope?.toolId;
  const isCrm = toolId === "crm" || toolId === "crm_upsert";

  // Attach latency into meta for your route logger
  envelope.meta = { ...(envelope.meta ?? {}), latencyMs };

  // CRM returns "success" on happy path (accept "ok" just in case)
  if (isCrm && (envelope?.status === "success" || envelope?.status === "ok")) {
    return { ok: true, envelope, card: envelope?.ui?.content };
  }
  return { ok: false, error: String(envelope?.summary || "crm failed"), envelope };
}
