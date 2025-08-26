"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
  query,
  orderBy,
  type FirestoreDataConverter,
  type DocumentReference,
  type UpdateData,
  type Query,
  type FieldValue,
} from "firebase/firestore";
import { auth, db } from "@/services/firebase";
import type { Chat, Message, Artifact, ModelConfig } from "@/types/types";
import { AVAILABLE_MODELS } from "@/config/modelConfig";

type SaveOpts = {
  suggestedTitle?: string;
};

type SaveResult = { artifact?: Artifact; versionNumber?: number; versionIndex?: number };

/** Firestore doc shape (allows FieldValue + an internal preview field). */
type ChatDoc = Omit<Chat, "createdAt" | "updatedAt"> & {
  id: string;
  createdAt: number | Timestamp;
  updatedAt: number | Timestamp;
  /** Stored in Firestore, not part of the public Chat type */
  lastMessagePreview?: string;
};

const toMillis = (v: number | Timestamp): number => {
  if (typeof v === "number") return v;
  return v.seconds;
};

const toChat = (d: ChatDoc): Chat => ({
  id: d.id,
  title: d.title,
  messages: d.messages,
  artifacts: d.artifacts,
  modelConfig: d.modelConfig,
  createdAt: toMillis(d.createdAt),
  updatedAt: toMillis(d.updatedAt),
});

/* --------------------------- Firestore converter --------------------------- */
const chatDocConverter: FirestoreDataConverter<ChatDoc> = {
  toFirestore: (chat: ChatDoc) => {
    // strip id from stored doc
    const { id: _omit, ...rest } = chat;
    void _omit;           
    return rest;
  },
  fromFirestore: (snap) => {
    const data = snap.data() as Record<string, unknown>;

    const messages = Array.isArray(data.messages) ? (data.messages as Message[]) : [];
    const artifacts = Array.isArray(data.artifacts) ? (data.artifacts as Artifact[]) : [];

    return {
      id: snap.id,
      title: typeof data.title === "string" ? data.title : "New chat",
      modelConfig: data.modelConfig as Chat["modelConfig"],
      messages,
      artifacts,
      createdAt: (data.createdAt as Timestamp) ?? Date.now(),
      updatedAt: (data.updatedAt as Timestamp) ?? Date.now(),
      lastMessagePreview:
        typeof data.lastMessagePreview === "string" ? data.lastMessagePreview : undefined,
    };
  },
};

/* ---------------------------------- Hook ---------------------------------- */
export function useChats() {
  const [userId, setUserId] = useState<string | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);

  /* ------------------------------ Auth subscription ------------------------------ */
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      setUserId(u?.uid ?? null);
      if (!u) {
        setChats([]);
        setCurrentChatId(null);
      }
    });
    return () => unsub();
  }, []);

  /* -------------------------- Firestore subscription -------------------------- */
  useEffect(() => {
    if (!userId) return;

    const rawCol = collection(db, "users", userId, "chats");
    const q: Query = query(rawCol, orderBy("updatedAt", "desc"));
    const typedQ = (q as Query).withConverter(chatDocConverter);

    const unsub = onSnapshot(typedQ, (snap) => {
      const list = snap.docs.map((d) => toChat(d.data()));
      setChats(list);
    });

    return () => unsub();
  }, [userId]);

  /* --------------------------------- Helpers --------------------------------- */
  const getChatRef = useCallback(
    (chatId: string): DocumentReference<ChatDoc> => {
      if (!userId) throw new Error("No user");
      return doc(db, "users", userId, "chats", chatId).withConverter(chatDocConverter);
    },
    [userId]
  );

  /* ------------------------------ Create a chat ------------------------------ */
  const createNewChat = useCallback(
    async (model?: ModelConfig) => {
      if (!userId) return null;

      const chosen = model ?? AVAILABLE_MODELS[0];
      // Use the raw collection for addDoc; timestamps resolved server-side
      const rawCol = collection(db, "users", userId, "chats");

      const docRef = await addDoc(rawCol, {
        title: "New chat",
        modelConfig: {
          id: chosen.id,
          name: chosen.name,
          provider: chosen.provider,
          model: chosen.model,
        },
        messages: [] as Message[],
        artifacts: [] as Artifact[],
        lastMessagePreview: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setCurrentChatId(docRef.id);
      return docRef.id;
    },
    [userId]
  );

  /* ------------------------------ Delete a chat ------------------------------ */
  const deleteChat = useCallback(
    async (chatId: string) => {
      if (!userId) return;
      await deleteDoc(getChatRef(chatId));
      if (currentChatId === chatId) {
        setCurrentChatId(null);
      }
    },
    [userId, currentChatId, getChatRef]
  );

  /* -------------------------- Update current model -------------------------- */
  const updateCurrentChatModel = useCallback(
    async (model: ModelConfig) => {
      if (!userId || !currentChatId) return;
      const payload: UpdateData<ChatDoc> = {
        modelConfig: {
          id: model.id,
          name: model.name,
          provider: model.provider,
          model: model.model,
        },
        updatedAt: serverTimestamp(),
      };
      await updateDoc(getChatRef(currentChatId), payload);
    },
    [userId, currentChatId, getChatRef]
  );

  const loadChat = useCallback((chatId: string) => {
    setCurrentChatId(chatId);
  }, []);

  /* ------------------------------- Update title ------------------------------ */
  const updateChatTitle = useCallback(
    async (chatId: string, title: string) => {
      if (!userId) return;
      const payload: UpdateData<ChatDoc> = {
        title: (title ?? "New chat").trim() || "New chat",
        updatedAt: serverTimestamp(),
      };
      await updateDoc(getChatRef(chatId), payload);
    },
    [userId, getChatRef]
  );

  /* ----------------------------- Generic updater ----------------------------- */
  const updateChat = useCallback(
    async (chatId: string, partial: Partial<Chat> & { lastMessagePreview?: string }) => {
      if (!userId) return;

      const payload: UpdateData<ChatDoc> = { updatedAt: serverTimestamp() };

      if (partial.title !== undefined) payload.title = partial.title;
      if (partial.modelConfig !== undefined) payload.modelConfig = partial.modelConfig;
      if (partial.messages !== undefined) payload.messages = partial.messages;
      if (partial.artifacts !== undefined) payload.artifacts = partial.artifacts;
      if (partial.lastMessagePreview !== undefined)
        payload.lastMessagePreview = partial.lastMessagePreview;
      if (partial.createdAt !== undefined) payload.createdAt = partial.createdAt as number | FieldValue;
      if (partial.updatedAt !== undefined) payload.updatedAt = partial.updatedAt as number | FieldValue;

      await updateDoc(getChatRef(chatId), payload);
    },
    [userId, getChatRef]
  );

  /* -------- Save messages (and optionally improve weak title from server) -------- */
  const saveMessagesToCurrentChat = useCallback(
    async (nextMessages: Message[], opts?: SaveOpts) => {
      if (!userId || !currentChatId) return;

      const ref = getChatRef(currentChatId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return;

      const curr = snap.data();

      const last =
        typeof nextMessages?.[nextMessages.length - 1]?.content === "string"
          ? (nextMessages[nextMessages.length - 1]!.content as string).slice(0, 200)
          : "";

      const incomingTitle = (opts?.suggestedTitle ?? "").trim();

      const hasWeakTitle =
        !curr.title ||
        curr.title === "Untitled" ||
        curr.title === "New chat" ||
        (typeof curr.title === "string" && curr.title.toLowerCase().startsWith("can you"));

      const update: UpdateData<ChatDoc> = {
        messages: nextMessages,
        lastMessagePreview: last,
        updatedAt: serverTimestamp(),
      };
      if (incomingTitle && hasWeakTitle) {
        update.title = incomingTitle;
      }

      await updateDoc(ref, update);
    },
    [userId, currentChatId, getChatRef]
  );

  /* --------------- Save/merge artifact (append version or replace) --------------- */
  const saveArtifactToCurrentChat = useCallback(
    async (incoming: Artifact) => {
      if (!userId || !currentChatId) return null;

      const chatRef = getChatRef(currentChatId);
      const snap = await getDoc(chatRef);
      if (!snap.exists()) return null;

      const chat = snap.data();
      const artifacts: Artifact[] = Array.isArray(chat.artifacts) ? chat.artifacts : [];

      const idx = artifacts.findIndex((a) => a.id === incoming.id);
      const incVers = Array.isArray(incoming.versions) ? incoming.versions : [];

      // Guard: a single empty version update should not erase content
      if (incVers.length === 1) {
        const c = String(incVers[0]?.content ?? "").trim();
        if (!c) {
          const prev = idx >= 0 ? artifacts[idx] : undefined;
          if (prev) {
            return { artifact: prev, versionNumber: prev.versions?.length ?? 1 } satisfies SaveResult;
          }
        }
      }

      let updated: Artifact;

      if (idx >= 0) {
        const prev = artifacts[idx]!;
        if (incVers.length === 1) {
          // Append one new version
          const newVer = {
            ...incVers[0]!,
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
          // Full replace (server provided all versions intentionally)
          updated = {
            ...prev,
            ...incoming,
            versions: incVers,
            updatedAt: incoming.updatedAt ?? Date.now(),
          };
        } else {
          updated = prev; // nothing to merge
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

      await updateDoc(chatRef, { artifacts, updatedAt: serverTimestamp() } as UpdateData<ChatDoc>);

      const versionNumber = updated.versions?.length ?? 1;
      return { artifact: updated, versionNumber } satisfies SaveResult;
    },
    [userId, currentChatId, getChatRef]
  );

  /* ---------------------------------- API ---------------------------------- */
  return useMemo(
    () => ({
      chats,
      currentChatId,
      createNewChat,
      deleteChat,
      updateCurrentChatModel,
      saveMessagesToCurrentChat,
      saveArtifactToCurrentChat,
      loadChat,
      updateChatTitle,
      updateChat,
    }),
    [
      chats,
      currentChatId,
      createNewChat,
      deleteChat,
      updateCurrentChatModel,
      saveMessagesToCurrentChat,
      saveArtifactToCurrentChat,
      loadChat,
      updateChatTitle,
      updateChat,
    ]
  );
}
