/**
 * Firebase Admin (server-only)
 * - Initializes a single Admin app (lazy singleton).
 * - Exposes `adminAuth`, `adminDb`, and `verifyIdToken(idToken)`.
 * - Uses `applicationDefault()` creds (GOOGLE_APPLICATION_CREDENTIALS).
 *   Swap to `cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!))` if needed.
 * - Never import this in client code.
 */


import { getApps, initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const projectId =
  process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

if (!projectId) {
  throw new Error("[firebaseAdmin] Set FIREBASE_PROJECT_ID in .env.local");
}

// Try ADC if available; ok if missing (verifyIdToken only needs projectId).
let cred: any | undefined;
try { cred = applicationDefault(); } catch { cred = undefined; }

const app =
  getApps()[0] ||
  initializeApp({
    projectId,
    // credential is optional; present if ADC available
    ...(cred ? { credential: cred } : {}),
  });

export const adminAuth = getAuth(app);
export const adminDb = getFirestore(app);

export function verifyIdToken(token: string) {
  return adminAuth.verifyIdToken(token);
}
