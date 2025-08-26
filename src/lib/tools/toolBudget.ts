/**
 * toolBudget.ts — lightweight "tool budget" helpers.
 * Prevents duplicate/looped tool calls via a short TTL cache; also provides a stable args key and a tiny console logger.
 * Exports: LAST_TOOL_CACHE, TOOL_TTL_SUCCESS_MS, TOOL_TTL_NOT_FOUND_MS, RETRY_REGEX, toolKey(), logToolRun().
 * Typical flow: check cache (+ RETRY), run tool, cache success, log one line.
 */

import type { KingaCard } from "@/types/types";


export type CacheEntry = {
  ctx: Record<string, string>;               // compact facts for <ctx> block
  card?: KingaCard;       // UI card to re-show if we skip duplicate
  ts: number;             // timestamp (ms)
  status: "ok" | "error"; // execution status we observed
  resultStatus?: string;  // optional: envelope.status (e.g., "ok" | "not_found")
};

/**
 * In-memory cache (resets on server restart).
 */
export const LAST_TOOL_CACHE = new Map<string, CacheEntry>();

/**
 * TTLs for reusing prior results.
 * - Successful results: reuse for 2 minutes
 * - "not_found" (but ok): shorter reuse to allow fast retries
 */
export const TOOL_TTL_SUCCESS_MS = 2 * 60 * 1000; // 2 minutes
export const TOOL_TTL_NOT_FOUND_MS = 45 * 1000;   // 45 seconds

/**
 * Users can force a rerun with words like "retry" / "try again".
 */
export const RETRY_REGEX = /\b(retry|try again|run again|refresh|rerun)\b/i;

/**
 * Deterministic JSON key for args (order-insensitive).
 */
function stableKey(obj: unknown): string {
  if (obj == null) return String(obj);
  if (typeof obj !== "object") return String(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableKey).join(",")}]`;
  const entries = Object.entries(obj as Record<string, unknown>)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableKey(v)}`);
  return `{${entries.join(",")}}`;
}

// --- Failure tracking (for "tool seems down" messaging) ---------------------
export const FAIL_TTL_MS = 10 * 60 * 1000; // 10 minutes window

// Tracks recent consecutive failures by tool+args key
export const TOOL_FAILS = new Map<string, { count: number; ts: number }>();

export function recordToolFailure(key: string) {
  const now = Date.now();
  const prev = TOOL_FAILS.get(key);
  if (prev && now - prev.ts < FAIL_TTL_MS) {
    TOOL_FAILS.set(key, { count: prev.count + 1, ts: now });
  } else {
    TOOL_FAILS.set(key, { count: 1, ts: now });
  }
}

export function clearToolFailures(key: string) {
  TOOL_FAILS.delete(key);
}

export function hasTooManyRecentFailures(key: string, threshold = 2): boolean {
  const rec = TOOL_FAILS.get(key);
  if (!rec) return false;
  return Date.now() - rec.ts < FAIL_TTL_MS && rec.count >= threshold;
}


/**
 * Public: build a cache key for (tool + args).
 */
export function toolKey(toolName: string, args: unknown) {
  return `${toolName}:${stableKey(args)}`;
}

/**
 * Tiny, consistent console logger for tool runs.
 * Example output:
 * { kind:"tool", tool:"email_finder", mcpTool:"TestEmailFinder", durationMs:812, status:"ok" }
 */
export function logToolRun(params: {
  tool: string;
  mcpTool?: string;
  durationMs: number;
  status: "ok" | "error" | "skipped-duplicate";
  error?: string;
}) {
  const { tool, mcpTool, durationMs, status, error } = params;
  // eslint-disable-next-line no-console
  console.log({
    kind: "tool",
    tool,
    mcpTool,
    durationMs,
    status,
    ...(error ? { error } : {}),
  });
}
