// src/lib/firebaseAdmin.ts
//
// Minimal Firebase Admin bootstrap used by server routes.
// Uses either GOOGLE_APPLICATION_CREDENTIALS or env vars.

import * as admin from "firebase-admin";

let app: admin.app.App | undefined;

export function getAdminApp(): admin.app.App {
  if (app) return app;

  if (admin.apps.length) {
    app = admin.apps[0]!;
    return app;
  }

  // Preferred: GOOGLE_APPLICATION_CREDENTIALS points to a service-account JSON.
  // Optional fallback: env vars for serverless hosts.
  const hasKeyEnv =
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY;

  if (hasKeyEnv) {
    app = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
      }),
    });
  } else {
    app = admin.initializeApp(); // uses ADC if available
  }

  return app;
}

export function getFirestore(): admin.firestore.Firestore {
  return getAdminApp().firestore();
}

export function getAuth(): admin.auth.Auth {
  return getAdminApp().auth();
}
