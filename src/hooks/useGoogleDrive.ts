import { useState, useCallback } from 'react';
import { GoogleDriveTokens } from '@/types/types';

export const useGoogleDrive = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [tokens, setTokens] = useState<GoogleDriveTokens | null>(null);

  const connect = useCallback(async (): Promise<boolean> => {
    setIsConnecting(true);
    
    try {
      // Get auth URL from server
      const authResponse = await fetch('/api/googleDrive/auth');
      if (!authResponse.ok) {
        throw new Error('Failed to get auth URL');
      }
      
      const { authUrl } = await authResponse.json();
      
      // Open popup for OAuth
      return new Promise((resolve) => {
        const popup = window.open(
          authUrl,
          'google-auth',
          'width=500,height=600,scrollbars=yes,resizable=yes'
        );

        const messageListener = (event: MessageEvent) => {
          if (event.data.type === 'GOOGLE_DRIVE_AUTH_SUCCESS') {
            setTokens(event.data.tokens);
            setIsConnected(true);
            window.removeEventListener('message', messageListener);
            resolve(true);
          } else if (event.data.type === 'GOOGLE_DRIVE_AUTH_ERROR') {
            console.error('Google Drive auth error:', event.data.error);
            window.removeEventListener('message', messageListener);
            resolve(false);
          }
        };

        window.addEventListener('message', messageListener);

        // Handle popup closed manually
        const checkClosed = setInterval(() => {
          if (popup?.closed) {
            clearInterval(checkClosed);
            window.removeEventListener('message', messageListener);
            resolve(false);
          }
        }, 1000);
      });
    } catch (error) {
      console.error('Connect failed:', error);
      return false;
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const saveDocument = useCallback(async (title: string, content: string): Promise<string> => {
    if (!tokens) {
      throw new Error('Not connected to Google Drive');
    }

    try {
      const response = await fetch('/api/google-drive/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, tokens })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText);
      }

      const data = await response.json();
      return data.shareableUrl;
    } catch (error) {
      console.error('Save failed:', error);
      throw error;
    }
  }, [tokens]);

  return {
    isConnected,
    isConnecting,
    connect,
    saveDocument
  };
};