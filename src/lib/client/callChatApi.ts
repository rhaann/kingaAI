/**
 * callChatApi
 * -----------
 * Purpose: Client-only helper to call `/api/chat` with the current user's Firebase ID token.
 *
 * What it does:
 * - Reads the signed-in user from Firebase Auth and gets a fresh ID token.
 * - Sends the request body to `/api/chat` with `Authorization: Bearer <token>`.
 * - Returns the parsed JSON (`{ result: ... }`) or throws with server text on non-2xx.
 *
 * Why it exists:
 * - Centralizes auth + fetch so components don’t duplicate token logic.
 * - Makes it obvious that /api/chat requires authentication.
 *
 * Inputs:  `body` – the request payload expected by the server.
 * Output:  Parsed JSON response from the API.
 *
 * Requirements:
 * - Must run in a client component (`'use client'`).
 * - User must be signed in; otherwise it throws.
 * - Server side must verify the token (see `firebaseAdmin.verifyIdToken`).
 *
 * Gotchas:
 * - Do not log the ID token. Network errors bubble up; add retries upstream if needed.
 * - If you add cookies (`__session`) later, keep this as the primary path unless SSR needs cookies.
 *
 * Example:
 *   const { result } = await callChatApi({
 *     message,
 *     modelConfig,
 *     conversationHistory,
 *     documentContext,
 *     currentArtifactId,
 *     currentArtifactTitle,
 *   });
 */


import { auth } from "@/services/firebase"; // must export a Firebase Web SDK auth instance

type Body = Record<string, any>;

export async function callChatApi(body: Body) {
  const user = auth.currentUser;
  const idToken = user ? await user.getIdToken() : undefined;

  const res = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    },
    body: JSON.stringify(body),
  });

  // Bubble 401/other errors up so UI can show them
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `${res.status} ${res.statusText}`);
  }
  return res.json();
}
