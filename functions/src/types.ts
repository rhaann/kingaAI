// The tokens received from Google's OAuth 2.0 flow.
export interface GoogleDriveTokens {
    access_token: string;
    refresh_token?: string; // Refresh token is not always sent
    scope: string;
    token_type: 'Bearer';
    expiry_date: number;
  }
  
  // A simplified representation of a Google Drive file.
  export interface DriveFile {
    id: string;
    name: string;
    webViewLink: string; // Link to view the file in the browser
  }