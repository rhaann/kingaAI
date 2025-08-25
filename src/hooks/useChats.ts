// src/hooks/useChats.ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
} from "firebase/firestore";
import { auth, db } from "@/services/firebase";
import type { Chat, Message, Artifact, ModelConfig } from "@/types/types";
import { AVAILABLE_MODELS } from "@/config/modelConfig";

/** Optional args when saving chat messages */
type SaveOpts = {
  /** If the server returned a better title, pass it here so we can store it. */
  suggestedTitle?: string;
};

export function useChats() {
  const [userId, setUserId] = useState<string | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);

  // --- Auth subscription ----------------------------------------------------
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      setUserId(u?.uid ?? null);
      // Clear state if user logs out
      if (!u) {
        setChats([]);
        setCurrentChatId(null);
      }
    });
    return () => unsub();
  }, []);

  // --- Firestore subscription to user's chats -------------------------------
  useEffect(() => {
    if (!userId) return;

    const chatsCol = collection(db, "users", userId, "chats");
    // Order newest first if index exists; otherwise remove orderBy
    const q = query(chatsCol, orderBy("updatedAt", "desc"));

    const unsub = onSnapshot(q, (snap) => {
      const next: Chat[] = [];
      snap.forEach((d) => {
        const data = d.data() as any;
        next.push({
          id: d.id,
          title: data.title ?? "New chat",
          modelConfig: data.modelConfig,
          messages: Array.isArray(data.messages) ? data.messages : [],
          artifacts: Array.isArray(data.artifacts) ? data.artifacts : [],
          createdAt: data.createdAt ?? null,
          updatedAt: data.updatedAt ?? null,
          lastMessagePreview: data.lastMessagePreview ?? "",
        } as Chat);
      });
      setChats(next);
    });

    return () => unsub();
  }, [userId]);

  // --- Helpers --------------------------------------------------------------

  const getChatRef = useCallback(
    (chatId: string) => {
      if (!userId) throw new Error("No user");
      return doc(db, "users", userId, "chats", chatId);
    },
    [userId]
  );

  // Create a new chat; always set a valid modelConfig
  const createNewChat = useCallback(
    async (model?: ModelConfig) => {
      if (!userId) return null;

      const chosen = model ?? AVAILABLE_MODELS[0];
      const chatsCol = collection(db, "users", userId, "chats");

      const docRef = await addDoc(chatsCol, {
        title: "New chat",
        modelConfig: {
          id: chosen.id,
          name: chosen.name,
          provider: chosen.provider,
          model: chosen.model,
        },
        messages: [],
        artifacts: [],
        lastMessagePreview: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setCurrentChatId(docRef.id);
      return docRef.id;
    },
    [userId]
  );

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

  const updateCurrentChatModel = useCallback(
    async (model: ModelConfig) => {
      if (!userId || !currentChatId) return;
      await updateDoc(getChatRef(currentChatId), {
        modelConfig: {
          id: model.id,
          name: model.name,
          provider: model.provider,
          model: model.model,
        },
        updatedAt: serverTimestamp(),
      });
    },
    [userId, currentChatId, getChatRef]
  );

  const loadChat = useCallback((chatId: string) => {
    setCurrentChatId(chatId);
  }, []);

  const updateChatTitle = useCallback(
    async (chatId: string, title: string) => {
      if (!userId) return;
      await updateDoc(getChatRef(chatId), {
        title: (title ?? "New chat").trim() || "New chat",
        updatedAt: serverTimestamp(),
      });
    },
    [userId, getChatRef]
  );

  const updateChat = useCallback(
    async (chatId: string, partial: Partial<Chat>) => {
      if (!userId) return;
      const payload: any = { ...partial, updatedAt: serverTimestamp() };
      // Never allow messages/artifacts to be set to undefined accidentally
      if (payload.messages === undefined) delete payload.messages;
      if (payload.artifacts === undefined) delete payload.artifacts;

      await updateDoc(getChatRef(chatId), payload);
    },
    [userId, getChatRef]
  );

  // --- Messages save: apply suggestedTitle (from server) safely -------------
  const saveMessagesToCurrentChat = useCallback(
    async (nextMessages: Message[], opts?: SaveOpts) => {
      if (!userId || !currentChatId) return;

      const ref = getChatRef(currentChatId);
      const snap = await getDoc(ref);
      const curr = snap.exists() ? (snap.data() as any) : {};

      const last =
        typeof nextMessages?.[nextMessages.length - 1]?.content === "string"
          ? (nextMessages[nextMessages.length - 1]!.content as string).slice(0, 200)
          : "";

      const incomingTitle = (opts?.suggestedTitle ?? "").trim();

      // Only set a better title if the current one is weak/empty
      const hasWeakTitle =
        !curr.title ||
        curr.title === "Untitled" ||
        curr.title === "New chat" ||
        String(curr.title).toLowerCase().startsWith("can you");

      const update: Record<string, any> = {
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

  // --- Artifacts: append-safe versioning (no message wipe) ------------------
  // Rules:
  //  - If incoming.versions has exactly ONE entry -> APPEND that version.
  //  - If incoming.versions has >1 entries -> treat as full REPLACE (server explicitly sent all versions).
  //  - If incoming has a single version with empty content -> NO-OP (do not erase).
  //  - Only update the `artifacts` field so we never touch `messages`.
  const saveArtifactToCurrentChat = useCallback(
    async (incoming: Artifact) => {
      if (!userId || !currentChatId) return null;

      const chatRef = getChatRef(currentChatId);
      const snap = await getDoc(chatRef);
      if (!snap.exists()) return null;

      const chat = snap.data() as any;
      const artifacts: Artifact[] = Array.isArray(chat.artifacts) ? chat.artifacts : [];

      const idx = artifacts.findIndex((a) => a.id === incoming.id);
      const incVers = Array.isArray(incoming.versions) ? incoming.versions : [];

      // Guard: a single empty version update should not erase content
      if (incVers.length === 1) {
        const c = String(incVers[0]?.content ?? "").trim();
        if (!c) {
          const prev = idx >= 0 ? artifacts[idx] : undefined;
          if (prev) {
            return { artifact: prev, versionNumber: prev.versions?.length ?? 1 };
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

      // Only touch artifacts so messages remain intact
      await updateDoc(chatRef, { artifacts, updatedAt: serverTimestamp() });

      const versionNumber = updated.versions?.length ?? 1;
      return { artifact: updated, versionNumber };
    },
    [userId, currentChatId, getChatRef]
  );

  // Memoized API
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
