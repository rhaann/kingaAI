import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAuth } from '@/context/authContext';
import { Chat, Message, Artifact, ModelConfig } from "@/types/types";
import { AVAILABLE_MODELS } from "@/config/modelConfig";

// Helper to convert Firestore Timestamps to numbers for our Chat type
const convertTimestamps = (chatData: any): Chat => {
  return {
    ...chatData,
    createdAt: (chatData.createdAt as Timestamp)?.toMillis() || Date.now(),
    updatedAt: (chatData.updatedAt as Timestamp)?.toMillis() || Date.now(),
  };
};

export const useChats = () => {
  const { user } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Real-time listener for chat history from Firestore
  useEffect(() => {
    if (!user) {
      setChats([]);
      setCurrentChatId(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const chatsCollectionRef = collection(db, 'users', user.uid, 'chats');
    const q = query(chatsCollectionRef, orderBy('updatedAt', 'desc'));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const userChats = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return convertTimestamps({ ...data, id: doc.id }) as Chat;
      });
      setChats(userChats);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching chats:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // --- CRUD FUNCTIONS ---

  const createNewChat = useCallback(async (modelConfig?: ModelConfig): Promise<string> => {
    if (!user) throw new Error("User not authenticated");

    const fallbackModel = {
      id: 'gemini-1.5-flash',
      name: 'Gemini Flash',
      provider: 'Google'
    };

    const selectedModel = modelConfig || AVAILABLE_MODELS?.[3] || fallbackModel;

    const plainModelConfig = {
      id: selectedModel.id,
      name: selectedModel.name,
      provider: selectedModel.provider,
    };

    const newChatData = {
      title: 'New Chat',
      messages: [],
      artifacts: [],
      modelConfig: plainModelConfig, 
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      userId: user.uid,
    };

    const chatsCollectionRef = collection(db, 'users', user.uid, 'chats');
    const docRef = await addDoc(chatsCollectionRef, newChatData);
    
    setCurrentChatId(docRef.id);
    return docRef.id;
  }, [user]);

  const deleteChat = useCallback(async (chatId: string) => {
    if (!user) throw new Error("User not authenticated");

    const chatDocRef = doc(db, 'users', user.uid, 'chats', chatId);
    await deleteDoc(chatDocRef);

    if (currentChatId === chatId) {
      setCurrentChatId(null);
    }
  }, [user, currentChatId]);

  const updateCurrentChatModel = useCallback(async (modelConfig: ModelConfig) => {
    if (!user || !currentChatId) return;

    const plainModelConfig = {
      id: modelConfig.id,
      name: modelConfig.name,
      provider: modelConfig.provider,
    };

    const chatDocRef = doc(db, 'users', user.uid, 'chats', currentChatId);
    await updateDoc(chatDocRef, {
      modelConfig: plainModelConfig,
      updatedAt: serverTimestamp(),
    });
  }, [user, currentChatId]);

  // This function must be defined BEFORE saveMessagesToCurrentChat
  const generateChatTitle = useCallback(async (chatId: string, messages: Message[]) => {
    if (!user || messages.length < 2) return;
    
    const conversationSample = messages.slice(0, 4).map(msg => `${msg.role}: ${msg.content.slice(0, 200)}`).join('\n');
    try {
      const response = await fetch('/api/generateTitle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationSample }),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.title) {
          const chatDocRef = doc(db, 'users', user.uid, 'chats', chatId);
          await updateDoc(chatDocRef, { title: data.title });
        }
      }
    } catch (error) {
      console.error('Failed to generate title:', error);
    }
  }, [user]);

  const saveMessagesToCurrentChat = useCallback(async (messages: Message[]) => {
    if (!user || !currentChatId) return;

    const chatDocRef = doc(db, 'users', user.uid, 'chats', currentChatId);
    await updateDoc(chatDocRef, {
      messages,
      updatedAt: serverTimestamp(),
    });

    const currentChat = chats.find(c => c.id === currentChatId);
    if (currentChat && currentChat.title === 'New Chat' && messages.length >= 2) {
      generateChatTitle(currentChatId, messages);
    }
  }, [user, currentChatId, chats, generateChatTitle]);

  const saveArtifactToCurrentChat = useCallback(async (artifact: Artifact) => {
    if (!user || !currentChatId) return;

    const currentChat = chats.find(chat => chat.id === currentChatId);
    if (!currentChat) return;

    const existingArtifactIndex = currentChat.artifacts.findIndex(a => a.id === artifact.id);
    let updatedArtifacts;
    if (existingArtifactIndex >= 0) {
      updatedArtifacts = [...currentChat.artifacts];
      updatedArtifacts[existingArtifactIndex] = artifact;
    } else {
      updatedArtifacts = [...currentChat.artifacts, artifact];
    }

    const chatDocRef = doc(db, 'users', user.uid, 'chats', currentChatId);
    await updateDoc(chatDocRef, {
      artifacts: updatedArtifacts,
      updatedAt: serverTimestamp(),
    });
  }, [user, currentChatId, chats]);

  const loadChat = useCallback((chatId: string) => {
    setCurrentChatId(chatId);
    return chats.find(chat => chat.id === chatId);
  }, [chats]);

  const getCurrentChat = useCallback((): Chat | null => {
    return chats.find(chat => chat.id === currentChatId) || null;
  }, [chats, currentChatId]);

  const getCurrentChatModel = useCallback((): ModelConfig => {
    const currentChat = chats.find(chat => chat.id === currentChatId);
    // We need to find the full model config from our available models list
    // based on the simple ID we saved in Firestore.
    return AVAILABLE_MODELS.find(m => m.id === currentChat?.modelConfig.id) || AVAILABLE_MODELS[3];
  }, [chats, currentChatId]);

  return {
    chats,
    currentChatId,
    loading,
    createNewChat,
    deleteChat,
    updateCurrentChatModel,
    saveMessagesToCurrentChat,
    saveArtifactToCurrentChat,
    loadChat,
    getCurrentChat,
    getCurrentChatModel,
  };
};