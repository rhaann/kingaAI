/**
 * Firebase Admin (server-only)
 * - Initializes a single Admin app (lazy singleton).
 * - Exposes `adminAuth`, `adminDb`, and `verifyIdToken(idToken)`.
 * - Prefers FIREBASE_SERVICE_ACCOUNT_KEY; falls back to ADC.
 */

import { getApps, initializeApp, applicationDefault, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const projectId =
  process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

if (!projectId) {
  throw new Error("[firebaseAdmin] Set FIREBASE_PROJECT_ID in .env.local");
}

// Prefer explicit service account (FIREBASE_SERVICE_ACCOUNT_KEY), else ADC
let credential: ReturnType<typeof applicationDefault> | ReturnType<typeof cert> | undefined;
const sa = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
try {
  if (sa) credential = cert(JSON.parse(sa));
  else credential = applicationDefault();
  console.log("credential", sa);
} catch {
  // If parsing ADC fails, leave credential undefined (use unauth'ed app with projectId)
  credential = undefined;
}

const app =
  getApps()[0] ||
  initializeApp({
    projectId,
    ...(credential ? { credential } : {}),
  });

export const adminAuth = getAuth(app);
export const adminDb = getFirestore(app);

export function verifyIdToken(token: string) {
  return adminAuth.verifyIdToken(token);
}