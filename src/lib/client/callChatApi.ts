import { auth } from "@/services/firebase";

export type ChatApiBody = Record<string, unknown>;

/**
 * Client-side helper to call your chat APIs.
 * Usage:
 *   const { result } = await callChatApi({ message, chatId }, "/api/chat-n8n");
 *
 * - Adds Firebase ID token as Authorization header when available
 * - Throws on non-2xx responses (caller should catch)
 */
export async function callChatApi(
  body: ChatApiBody,
  endpoint: string = "/api/chat"
): Promise<any> {
  const user = auth.currentUser;
  const idToken = user ? await user.getIdToken() : undefined;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `${res.status} ${res.statusText}`);
  }

  return res.json();
}
