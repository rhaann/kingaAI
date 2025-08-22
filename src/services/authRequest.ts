/**
 * Request → Firebase user (server-only)
 * - Extracts ID token from `Authorization: Bearer <token>` (preferred),
 *   or falls back to `__session` cookie.
 * - Verifies token via `verifyIdToken` and returns `{ uid, decoded }` or `null`.
 * - Use at the top of API routes to require auth.
 */


import { headers, cookies } from "next/headers";
import { verifyIdToken } from "@/services/firebaseAdmin";

export async function getUserFromRequest() {
  // Next.js 15: dynamic APIs must be awaited
  const h = await headers();
  const c = await cookies();

  let token: string | undefined;

  // Prefer Authorization: Bearer <token>
  const auth = h.get("authorization") || h.get("Authorization");
  if (auth?.startsWith("Bearer ")) token = auth.slice(7);

  // Fallback: __session cookie
  if (!token) token = c.get("__session")?.value;

  if (!token) return null;

  try {
    const decoded = await verifyIdToken(token);
    return { uid: decoded.uid, decoded };
  } catch (e:any) {
    console.error("[auth] verifyIdToken failed:", e?.errorInfo || e?.message || e);
    return null;
  }
}
