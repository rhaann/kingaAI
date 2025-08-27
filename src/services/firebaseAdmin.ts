import { getApps, initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
// optional: import type { ServiceAccount } from "firebase-admin";

function getCredentialAndProject() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (raw) {
    const gsa = JSON.parse(raw) as {
      project_id?: string;
      client_email?: string;
      private_key?: string;
    };

    const credential = cert({
      projectId: gsa.project_id,
      clientEmail: gsa.client_email,
      privateKey: gsa.private_key?.replace(/\\n/g, "\n"),
    }); // as ServiceAccount  <- not required if keys are camelCase like above

    return { credential, projectId: gsa.project_id };
  }

  if (process.env.NODE_ENV !== "production") {
    return { credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID };
  }
  throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY is missing in production");
}

const { credential, projectId } = getCredentialAndProject();

const app =
  getApps()[0] ??
  initializeApp({
    credential,
    projectId: projectId ?? process.env.FIREBASE_PROJECT_ID,
  });

export const adminAuth = getAuth(app);
export const adminDb = getFirestore(app);
export const verifyIdToken = (token: string) => adminAuth.verifyIdToken(token);
