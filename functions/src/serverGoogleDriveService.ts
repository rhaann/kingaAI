// functions/src/serverGoogleDriveService.ts

import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { DriveFile, GoogleDriveTokens } from "./types"; // Will now resolve to types.ts
import * as functions from "firebase-functions";

function getOauthClient(): OAuth2Client {
  const config = functions.config().google;
  if (!config || !config.client_id || !config.client_secret || !config.redirect_uri) {
    throw new Error("Google OAuth environment variables are not configured in Firebase.");
  }
  return new google.auth.OAuth2(config.client_id, config.client_secret, config.redirect_uri);
}

export function getAuthUrl(userId: string): string {
  const oauth2Client = getOauthClient();
  const state = Buffer.from(JSON.stringify({ userId })).toString("base64");
  const scopes = [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/documents",
  ];

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    prompt: "consent",
    state: state,
  });
}

export async function getTokensFromCode(code: string): Promise<GoogleDriveTokens> {
  const oauth2Client = getOauthClient();
  // FIX: Changed 'client' to 'oauth2Client'
  const { tokens } = await oauth2Client.getToken(code);
  return tokens as GoogleDriveTokens;
}

export async function createGoogleDoc(
  tokens: GoogleDriveTokens,
  title: string,
  content: string
): Promise<{ file: DriveFile; newTokens: GoogleDriveTokens | null }> {
  const oauth2Client = getOauthClient();
  oauth2Client.setCredentials(tokens);

  let refreshedTokens: GoogleDriveTokens | null = null;
  oauth2Client.on("tokens", (newTokens) => {
    // FIX: Ensure we handle potentially null values from the new token
    if (newTokens.access_token) {
      refreshedTokens = {
        ...tokens,
        access_token: newTokens.access_token,
        expiry_date: newTokens.expiry_date || tokens.expiry_date,
        // Keep other properties from the original tokens
      };
    }
  });

  const drive = google.drive({ version: "v3", auth: oauth2Client });
  const docs = google.docs({ version: "v1", auth: oauth2Client });

  const doc = await docs.documents.create({ requestBody: { title } });
  const docId = doc.data.documentId;
  if (!docId) {
    throw new Error("Google Docs API failed to return a document ID.");
  }
  // You can add your complex content insertion logic here if needed.

  const fileDetails = await drive.files.get({
    fileId: docId,
    fields: "id, name, webViewLink",
  });

  const file: DriveFile = {
    id: fileDetails.data.id!,
    name: fileDetails.data.name!,
    webViewLink: fileDetails.data.webViewLink!,
  };

  return { file, newTokens: refreshedTokens };
}