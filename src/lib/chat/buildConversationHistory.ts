/**
 * buildConversationHistory
 * ------------------------
 * Purpose: Create the trimmed, server-ready chat history to send with /api/chat.
 *
 * What it does:
 * - Maps roles to the server contract: 'user' → 'user', 'assistant' or 'ai' → 'assistant'.
 * - Drops any 'system' messages.
 * - Keeps only the last N entries (default 10) to control token usage.
 * - Preserves order and content (including any <tool_json>/<ctx> blocks).
 *
 * Why it exists:
 * - Centralizes the “what the server needs” logic so multiple callers don’t re-implement it.
 * - Keeps chatApplication focused on UI/state, not protocol shaping.
 *
 * Inputs:  messages: Array<{ role: 'user'|'assistant'|'ai'|'system'; content: string }>
 * Output:  Array<{ role: 'user'|'assistant'; content: string }>
 *
 * Gotchas:
 * - If upstream role names change, update the mapping here.
 * - If you raise/lower the limit, ensure the server prompt is still coherent.
 *
 * Example:
 *   const history = buildConversationHistory(messages, 10);
 *   await callChatApi({ message, modelConfig, conversationHistory: history });
 */
export type Msg = { role: 'user'|'assistant'|'ai'|'system'; content: string; createdAt?: number };

export function buildConversationHistory(
  messages: Msg[],
  limit = 10
): Array<{ role: 'user'|'assistant'; content: string }> {
  const mapRole = (r: Msg['role']): 'user'|'assistant'|null =>
    r === 'user' ? 'user' : r === 'assistant' || r === 'ai' ? 'assistant' : null;

  return messages
    .map(m => ({ role: mapRole(m.role), content: m.content }))
    .filter((m): m is { role: 'user'|'assistant'; content: string } => !!m.role)
    .slice(-limit);
}
