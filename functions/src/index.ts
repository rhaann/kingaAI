// functions/src/index.ts

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { firestore } from "firebase-admin"; 
import * as googleDrive from "./serverGoogleDriveService";

admin.initializeApp();

// --- FUNCTION 1: Initiate the Auth Flow ---
export const googleDriveAuth = functions.https.onRequest(async (request, response) => {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new functions.https.HttpsError("unauthenticated", "No token provided.");
    }
    const idToken = authHeader.split("Bearer ")[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const userId = decodedToken.uid;
    const authUrl = googleDrive.getAuthUrl(userId);
    response.redirect(authUrl);
  } catch (error) {
    console.error("Auth initiation failed:", error);
    response.status(401).send("Authentication failed. Please log in again.");
  }
});

// --- FUNCTION 2: Handle the Callback from Google ---
export const googleDriveCallback = functions.https.onRequest(async (request, response) => {
  try {
    const code = request.query.code as string;
    const state = request.query.state as string;
    if (!code) throw new Error("Authorization code is missing.");
    if (!state) throw new Error("State parameter is missing.");
    const decodedState = JSON.parse(Buffer.from(state, "base64").toString("utf8"));
    const userId = decodedState.userId;
    if (!userId) throw new Error("User ID was not found in the state parameter.");
    const tokens = await googleDrive.getTokensFromCode(code);
    const userDocRef = admin.firestore().collection("users").doc(userId);
    await userDocRef.set({ googleDriveTokens: tokens }, { merge: true });
    const appUrl = functions.config().google.app_url || "http://localhost:3000";
    response.redirect(appUrl);
  } catch (error) {
    console.error("Google callback failed:", error);
    const appUrl = functions.config().google.app_url || "http://localhost:3000";
    response.redirect(`${appUrl}?error=google-auth-failed`);
  }
});

// --- FUNCTION 3: Save a Document ---
export const googleDriveSave = functions.https.onRequest(async (request, response) => {
  if (request.method !== "POST") {
    response.status(405).send("Method Not Allowed");
    return;
  }
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new functions.https.HttpsError("unauthenticated", "No token provided.");
    }
    const idToken = authHeader.split("Bearer ")[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const userId = decodedToken.uid;
    const userDocRef = admin.firestore().collection("users").doc(userId);
    const docSnap = await userDocRef.get();
    const tokens = docSnap.data()?.googleDriveTokens;
    if (!tokens) {
      throw new functions.https.HttpsError("failed-precondition", "User has not connected Google Drive.");
    }
    const { title, content } = request.body;
    if (!title || !content) {
      throw new functions.https.HttpsError("invalid-argument", "Missing title or content.");
    }
    // --- 2. FIX: Pass the userId to the service function ---
    const { file, newTokens } = await googleDrive.createGoogleDoc(userId, tokens, title, content);
    if (newTokens) {
      await userDocRef.set({ googleDriveTokens: newTokens }, { merge: true });
    }
    response.status(200).json({ success: true, fileUrl: file.webViewLink });
  } catch (error: any) {
    console.error("Save to Drive failed:", error);
    if (error.code) {
      response.status(400).json({ error: error.message });
    } else {
      response.status(500).json({ error: "An internal error occurred." });
    }
  }
});

// --- 3. ADD THE NEW N8N CALLBACK FUNCTION ---
/**
 * This is the secure Cloud Function endpoint that n8n workflows will call upon completion.
 */
export const n8nCallback = functions.https.onRequest(async (request, response) => {
  if (request.method !== "POST") {
    response.status(405).send("Method Not Allowed");
    return;
  }
  try {
    const secret = request.headers['x-kinga-secret'];
    if (secret !== functions.config().n8n.callback_secret) {
      console.error("Unauthorized attempt to call n8nCallback: Invalid secret.");
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { userId, chatId, resultData } = request.body;
    if (!userId || !chatId || !resultData) {
      response.status(400).json({ error: 'Missing required fields: userId, chatId, or resultData' });
      return;
    }

    const newAiMessage = {
      id: `msg-${Date.now()}`, // Add an ID for React keys
      role: 'ai',
      content: `The workflow has completed. Here are the results:\n\n${JSON.stringify(resultData, null, 2)}`,
    };

    const chatDocRef = admin.firestore().collection('users').doc(userId).collection('chats').doc(chatId);
    await chatDocRef.update({
      messages: firestore.FieldValue.arrayUnion(newAiMessage),
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });

    response.status(200).json({ success: true, message: 'Callback received and processed.' });
  } catch (error: any) {
    console.error("Error in n8nCallback function:", error);
    response.status(500).json({ error: 'Internal Server Error' });
  }
});