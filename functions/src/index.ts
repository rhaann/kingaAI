import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as googleDrive from "./serverGoogleDriveService"; // Our Service Layer

// Initialize the Firebase Admin SDK. It's safe to do this once at the top level.
admin.initializeApp();

// --- FUNCTION 1: Initiate the Auth Flow ---

export const googleDriveAuth = functions.https.onRequest(async (request, response) => {
  try {
    // Security: Get the user's ID token from the request header.
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new functions.https.HttpsError("unauthenticated", "No token provided.");
    }
    const idToken = authHeader.split("Bearer ")[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const userId = decodedToken.uid;

    // Call the Service to get the Google URL.
    const authUrl = googleDrive.getAuthUrl(userId);

    // Redirect the user's browser to that URL.
    response.redirect(authUrl);
  } catch (error) {
    console.error("Auth initiation failed:", error);
    response.status(401).send("Authentication failed. Please log in again.");
  }
});


// --- FUNCTION 2: Handle the Callback from Google ---

export const googleDriveCallback = functions.https.onRequest(async (request, response) => {
  try {
    // The URL will have '?code=...' and '?state=...'
    const code = request.query.code as string;
    const state = request.query.state as string;

    if (!code) throw new Error("Authorization code is missing.");
    if (!state) throw new Error("State parameter is missing.");

    // Security: Decode the state to get the original userId.
    const decodedState = JSON.parse(Buffer.from(state, "base64").toString("utf8"));
    const userId = decodedState.userId;
    if (!userId) throw new Error("User ID was not found in the state parameter.");

    // Call the Service to exchange the code for tokens.
    const tokens = await googleDrive.getTokensFromCode(code);

    // Persistence: Save the tokens securely to the user's document in Firestore.
    const userDocRef = admin.firestore().collection("users").doc(userId);
    await userDocRef.set({ googleDriveTokens: tokens }, { merge: true });

    // Redirect the user back to the main application.
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
  // This is a POST request, so we check the method.
  if (request.method !== "POST") {
    response.status(405).send("Method Not Allowed");
    return;
  }

  try {
    // Security: Verify the user's identity.
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new functions.https.HttpsError("unauthenticated", "No token provided.");
    }
    const idToken = authHeader.split("Bearer ")[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const userId = decodedToken.uid;

    // Persistence: Get the user's saved tokens from Firestore.
    const userDocRef = admin.firestore().collection("users").doc(userId);
    const docSnap = await userDocRef.get();
    const tokens = docSnap.data()?.googleDriveTokens;
    if (!tokens) {
      throw new functions.https.HttpsError("failed-precondition", "User has not connected Google Drive.");
    }

    // Get the document details from the request body.
    const { title, content } = request.body;
    if (!title || !content) {
      throw new functions.https.HttpsError("invalid-argument", "Missing title or content.");
    }

    // Call the Service to create the Google Doc.
    const { file, newTokens } = await googleDrive.createGoogleDoc(tokens, title, content);

    // Persistence: If the service gave us a refreshed token, save it back to the database.
    if (newTokens) {
      await userDocRef.set({ googleDriveTokens: newTokens }, { merge: true });
    }

    // Send a success response back to the client.
    response.status(200).json({ success: true, fileUrl: file.webViewLink });
  } catch (error: any) {
    console.error("Save to Drive failed:", error);
    if (error.code) { // This is a Firebase HttpsError
      response.status(400).json({ error: error.message });
    } else {
      response.status(500).json({ error: "An internal error occurred." });
    }
  }
});