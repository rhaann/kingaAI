"use client";

import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { useAuth } from './authContext';
import { db } from '../services/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

interface GoogleDriveContextType {
  isConnected: boolean;
  isConnecting: boolean;
  connect: () => void;
  saveDocument: (title: string, content: string) => Promise<string>;
  disconnect: () => void;
}

const GoogleDriveContext = createContext<GoogleDriveContextType | undefined>(undefined);

export const useGoogleDrive = (): GoogleDriveContextType => {
  const context = useContext(GoogleDriveContext);
  if (!context) {
    throw new Error('useGoogleDrive must be used within a GoogleDriveProvider');
  }
  return context;
};

export const GoogleDriveProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setIsConnected(false);
      setIsLoading(false);
      return;
    }

    const userDocRef = doc(db, 'users', user.uid);

    const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const userData = docSnap.data();
        const hasTokens = !!userData.googleDriveTokens;
        setIsConnected(hasTokens);
      } else {
        setIsConnected(false);
      }
      setIsLoading(false);
      setIsConnecting(false);
    }, (error) => {
      console.error("Error listening to user document:", error);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const connect = () => {
    // A simple redirect is sufficient here. The browser's session cookies
    // will help identify the user on the subsequent callback.
    if (!user) {
      console.error("Cannot connect Google Drive: User is not logged in.");
      return;
    }
    setIsConnecting(true);
    window.location.href = '/api/googleDrive/auth';
  };

  const saveDocument = async (title: string, content: string): Promise<string> => {
    if (!isConnected || !user) {
      throw new Error('Not connected to Google Drive or user not logged in.');
    }

    // --- THIS IS THE CRUCIAL UPDATE ---
    // 1. Get the user's Firebase ID token. This proves their identity to our backend.
    const token = await user.getIdToken();

    // 2. Make the fetch request, including the token in the Authorization header.
    const response = await fetch('/api/googleDrive/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`, // Add the token here
      },
      body: JSON.stringify({ title, content }),
    });
    // ---------------------------------

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to save document');
    }

    const data = await response.json();
    return data.fileUrl;
  };

  const disconnect = () => {
    console.log('Disconnect functionality to be implemented.');
  };

  const value: GoogleDriveContextType = {
    isConnecting: isLoading || isConnecting,
    isConnected,
    connect,
    saveDocument,
    disconnect,
  };

  return (
    <GoogleDriveContext.Provider value={value}>
      {children}
    </GoogleDriveContext.Provider>
  );
};