'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  runTransaction,
  writeBatch,
} from 'firebase/firestore';


import { db } from "@/services/firebase";
import { useAuth } from "@/context/authContext";
import type { Chat, Message, Artifact, ModelConfig } from "@/types/types";
import { AVAILABLE_MODELS } from "@/config/modelConfig";

/**
 * useChats — Firestore (subcollections) chat data hook
 * ---------------------------------------------------
 * Chats:    users/{uid}/chats/{chatId}                (metadata only)
 * Messages: users/{uid}/chats/{chatId}/messages/{id}  (append-only, createdAt)
 * Artifacts:users/{uid}/chats/{chatId}/artifacts/{id} (title,type,versionCount,updatedAt)
 * Versions: users/{uid}/chats/{chatId}/artifacts/{id}/versions/{id} (index,content,createdAt)
 *
 * Why: avoids 1MB doc limit, supports pagination, and makes writes concurrency-safe.
 */

export function useChats() {
  const { user } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // ---- Chat list (sidebar) ----
  useEffect(() => {
    if (!user) return;
    const chatsRef = collection(db, 'users', user.uid, 'chats');
    const q = query(chatsRef, orderBy('updatedAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const rows: Chat[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setChats(rows);
    });
    return () => unsub();
  }, [user]);

  // ---- Active chat subscriptions (messages + artifacts) ----
  const activeUnsubs = useRef<(() => void)[]>([]);
  const loadChat = useCallback((chatId: string) => {
    if (!user) throw new Error('Not signed in');

    // cleanup old listeners
    activeUnsubs.current.forEach((fn) => { try { fn(); } catch {} });
    activeUnsubs.current = [];

    setCurrentChatId(chatId);
    setLoading(true);

    // Messages stream
    const msgsRef = collection(db, 'users', user.uid, 'chats', chatId, 'messages');
    const msgsQ = query(msgsRef, orderBy('createdAt', 'asc'));
    const unsubMsgs = onSnapshot(msgsQ, (snap) => {
      const rows: Message[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setMessages(rows);
    });
    activeUnsubs.current.push(unsubMsgs);

    // Artifacts (headers only; versions fetched on demand if you need)
    const artsRef = collection(db, 'users', user.uid, 'chats', chatId, 'artifacts');
    const artsQ = query(artsRef, orderBy('updatedAt', 'desc'));
    const unsubArts = onSnapshot(artsQ, (snap) => {
      const rows: Artifact[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      setArtifacts(rows);
      setLoading(false);
    });
    activeUnsubs.current.push(unsubArts);
  }, [user]);

  // ---- Create / delete / update chat metadata ----
  const createNewChat = useCallback(async (title = 'New Chat', model?: ModelConfig) => {
    if (!user) throw new Error('Not signed in');
    const chatsRef = collection(db, 'users', user.uid, 'chats');
    const chosen = model ?? AVAILABLE_MODELS[0]; // always set a model
    const docRef = await addDoc(chatsRef, {
      title,
      modelConfig: {
        id: chosen.id,
        name: chosen.name,
        provider: chosen.provider,
        model: chosen.model,
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastMessagePreview: '',
    });
    
    setCurrentChatId(docRef.id);
    return docRef.id;
  }, [user]);

  // NOTE: client-side deep deletes are expensive; this deletes the chat doc only.
  // For full cleanup, run a backend job to delete subcollections.
  const deleteChat = useCallback(async (chatId: string) => {
    if (!user) throw new Error('Not signed in');
    await deleteDoc(doc(db, 'users', user.uid, 'chats', chatId));
    if (currentChatId === chatId) setCurrentChatId(null);
  }, [user, currentChatId]);

  const updateChatTitle = useCallback(async (chatId: string, title: string) => {
    if (!user) throw new Error('Not signed in');
    await updateDoc(doc(db, 'users', user.uid, 'chats', chatId), {
      title,
      updatedAt: serverTimestamp(),
    });
  }, [user]);

  const updateChat = useCallback(async (chatId: string, partial: any) => {
    if (!user) throw new Error('Not signed in');
    await updateDoc(doc(db, 'users', user.uid, 'chats', chatId), {
      ...partial,
      updatedAt: serverTimestamp(),
    });
  }, [user]);

  const updateCurrentChatModel = useCallback(async (model: ModelConfig) => {
    if (!user || !currentChatId) throw new Error('No active chat');
    await updateDoc(doc(db, 'users', user.uid, 'chats', currentChatId), {
      modelConfig: model,
      updatedAt: serverTimestamp(),
    });
  }, [user, currentChatId]);

  // ---- Writes: messages & artifacts ----

  /** Append one or more messages as individual docs; update chat metadata once. */
  // Persist the full messages array without touching artifacts or other fields.
  const saveMessagesToCurrentChat = async (next: Message[]) => {
    if (!user || !currentChatId) return;
    const chatRef = doc(db, "users", user.uid, "chats", currentChatId);

    await updateDoc(chatRef, {
      messages: next,
      lastMessagePreview:
        typeof next?.[next.length - 1]?.content === "string"
          ? (next[next.length - 1]!.content as string).slice(0, 200)
          : "",
      updatedAt: serverTimestamp(),
    });
  }


  // Save/merge an artifact for the current chat.
  // - If `incoming.versions` contains just the newest version, we APPEND it.
  // - If `incoming` carries the full versions array, we REPLACE with that.
  // - We only update the `artifacts` field, so `messages` remains intact.
  // merge/append artifact versions; never wipe messages or older versions
  const saveArtifactToCurrentChat = async (incoming: Artifact) => {
    if (!user || !currentChatId) return null;

    const chatRef = doc(db, "users", user.uid, "chats", currentChatId);
    const snap = await getDoc(chatRef);
    if (!snap.exists()) return null;

    const chat = snap.data() as any;
    const artifacts: Artifact[] = Array.isArray(chat.artifacts) ? chat.artifacts : [];

    const idx = artifacts.findIndex((a) => a.id === incoming.id);
    const incVers = Array.isArray(incoming.versions) ? incoming.versions : [];

    // ---- Guard: never allow an "empty" update to erase content ----
    if (incVers.length === 1) {
      const c = (incVers[0]?.content ?? "").trim();
      if (!c) {
        // treat as no-op: return existing artifact/version number if present
        const prev = idx >= 0 ? artifacts[idx] : undefined;
        if (prev) return { artifact: prev, versionNumber: prev.versions?.length ?? 1 };
      }
    }

    let updated: Artifact;

    if (idx >= 0) {
      const prev = artifacts[idx]!;

      if (incVers.length === 1) {
        // ---- ALWAYS APPEND when the server sends a single version ----
        const newVer = {
          ...incVers[0]!,
          // ensure timestamp exists and moves forward
          createdAt:
            typeof incVers[0]!.createdAt === "number" && incVers[0]!.createdAt > 0
              ? incVers[0]!.createdAt
              : Date.now(),
        };

        updated = {
          ...prev,
          title: incoming.title ?? prev.title,
          type: prev.type ?? "document",
          versions: [...(prev.versions ?? []), newVer],
          updatedAt: incoming.updatedAt ?? Date.now(),
        };
      } else if (incVers.length > 1) {
        // ---- Full replace only when server explicitly sends ALL versions ----
        updated = {
          ...prev,
          ...incoming,
          versions: incVers,
          updatedAt: incoming.updatedAt ?? Date.now(),
        };
      } else {
        // nothing to merge; keep previous
        updated = prev;
      }

      artifacts[idx] = updated;
    } else {
      // New artifact entirely
      updated = {
        ...incoming,
        versions: incVers,
        type: incoming.type ?? "document",
        createdAt: incoming.createdAt ?? Date.now(),
        updatedAt: incoming.updatedAt ?? Date.now(),
      };
      artifacts.push(updated);
    }

    // IMPORTANT: only update the artifacts field so messages aren't touched
    await updateDoc(chatRef, { artifacts, updatedAt: serverTimestamp() });

    const versionNumber = updated.versions?.length ?? 1;
    return { artifact: updated, versionNumber };
  };



  // ---- Accessors ----
  const getCurrentChat = useCallback(
    () => chats.find((c) => c.id === currentChatId) || null,
    [chats, currentChatId]
  );
  const getCurrentChatModel = useCallback(
    () => (getCurrentChat() as any)?.modelConfig ?? null,
    [getCurrentChat]
  );

  return {
    chats,
    currentChatId,
    messages,
    artifacts,
    loading,

    createNewChat,
    deleteChat,
    updateCurrentChatModel,
    saveMessagesToCurrentChat,
    saveArtifactToCurrentChat,
    loadChat,
    getCurrentChat,
    getCurrentChatModel,

    // keep these for compatibility with your components
    setChats,
    updateChatTitle,
    updateChat,
    setCurrentChatId,
  };
}
