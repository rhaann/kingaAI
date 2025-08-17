import { useState, useEffect, useCallback } from "react";
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
} from "firebase/firestore";
import { db } from "@/services/firebase";
import { useAuth } from "@/context/authContext";
import { Chat, Message, Artifact, ModelConfig } from "@/types/types";
import { AVAILABLE_MODELS } from "@/config/modelConfig";

// ---- Helpers ---------------------------------------------------------------

/** Convert Firestore Timestamps -> number (ms) so our app types are consistent. */
const convertTimestamps = (chatData: any): Chat => {
  return {
    ...chatData,
    createdAt: (chatData.createdAt as Timestamp)?.toMillis?.() || Date.now(),
    updatedAt: (chatData.updatedAt as Timestamp)?.toMillis?.() || Date.now(),
  };
};

/** Deep-ish clone of an artifact (ensures a fresh versions array). */
const cloneArtifact = (a: Artifact): Artifact => ({
  ...a,
  versions: [...(a.versions ?? [])],
});

// ---- Hook ------------------------------------------------------------------

export const useChats = () => {
  const { user } = useAuth();
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Real-time listener for the user's chats
  useEffect(() => {
    if (!user) {
      setChats([]);
      setCurrentChatId(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const chatsRef = collection(db, "users", user.uid, "chats");
    const q = query(chatsRef, orderBy("updatedAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (qs) => {
        const rows = qs.docs.map((d) => {
          const data = d.data();
          const messages: Message[] = (data.messages || []).map((m: any) => ({
            ...m,
            content:
              typeof m?.content === "string"
                ? m.content
                : JSON.stringify(m?.content ?? ""),
          }));
        
          // Normalize artifacts: ensure versions list exists for each artifact
          const artifacts: Artifact[] = (data.artifacts || []).map((art: any) => {
            const versions = Array.isArray(art.versions)
              ? art.versions
              : [{ content: art.content, createdAt: art.createdAt }].filter(Boolean);
            return {
              ...art,
              versions,
            } as Artifact;
          });

          return convertTimestamps({ ...data, id: d.id, messages, artifacts });
        });

        setChats(rows);
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching chats:", err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // ---- CRUD + Utilities ----------------------------------------------------

  const createNewChat = useCallback(
    async (modelConfig?: ModelConfig): Promise<string> => {
      if (!user) throw new Error("User not authenticated");

      const fallbackModel: ModelConfig =
        AVAILABLE_MODELS?.[2] ||
        ({ id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "OpenAI" } as ModelConfig);

      const selected = modelConfig || fallbackModel;
      const plainModelConfig = {
        id: selected.id,
        name: selected.name,
        provider: selected.provider,
      } as ModelConfig;

      const newChat = {
        title: "New Chat",
        messages: [] as Message[],
        artifacts: [] as Artifact[],
        modelConfig: plainModelConfig,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        userId: user.uid,
      };

      const chatsRef = collection(db, "users", user.uid, "chats");
      const docRef = await addDoc(chatsRef, newChat);

      setCurrentChatId(docRef.id);
      return docRef.id;
    },
    [user]
  );

  const deleteChat = useCallback(
    async (chatId: string) => {
      if (!user) throw new Error("User not authenticated");
      const chatRef = doc(db, "users", user.uid, "chats", chatId);
      await deleteDoc(chatRef);
      if (currentChatId === chatId) {
        setCurrentChatId(null);
      }
    },
    [user, currentChatId]
  );

  const updateCurrentChatModel = useCallback(
    async (modelConfig: ModelConfig) => {
      if (!user || !currentChatId) return;
      const plain = { id: modelConfig.id, name: modelConfig.name, provider: modelConfig.provider };
      const chatRef = doc(db, "users", user.uid, "chats", currentChatId);
      await updateDoc(chatRef, { modelConfig: plain, updatedAt: serverTimestamp() });
    },
    [user, currentChatId]
  );

  const generateChatTitle = useCallback(
    async (chatId: string, messages: Message[]) => {
      if (!user || messages.length < 2) return;

      const firstUser = messages.find((m) => m.role === "user")?.content ?? messages[0]?.content ?? "New Chat";
      const singleLine = firstUser.replace(/\s+/g, " ").trim();
      let candidate = singleLine.slice(0, 60);
      if (singleLine.length > 60) {
        const lastSpace = candidate.lastIndexOf(" ");
        if (lastSpace > 20) candidate = candidate.slice(0, lastSpace);
      }
      candidate = candidate.replace(/[:.,;!\-–—!?]+$/g, "");
      if (candidate) candidate = candidate.charAt(0).toUpperCase() + candidate.slice(1);

      try {
        const chatRef = doc(db, "users", user.uid, "chats", chatId);
        await updateDoc(chatRef, { title: candidate || "New Chat" });
      } catch (e) {
        console.error("Failed to set chat title:", e);
      }
    },
    [user]
  );

  const saveMessagesToCurrentChat = useCallback(
    async (messages: Message[]) => {
      if (!user || !currentChatId) return;

      const safeMessages: Message[] = messages.map((m) => ({
        ...m,
        content:
          typeof m.content === "string"
            ? m.content
            : JSON.stringify(m.content ?? ""),
      }));
  
      // Optimistic local update
      setChats((prev) =>
        prev.map((c) =>
          c.id === currentChatId
            ? { ...c, messages: safeMessages, updatedAt: Date.now() }
            : c
        )
      );
  
      const chatRef = doc(db, "users", user.uid, "chats", currentChatId);
      await updateDoc(chatRef, { messages: safeMessages, updatedAt: serverTimestamp() });
  
      const currentChat = chats.find((c) => c.id === currentChatId);
      if (currentChat && currentChat.title === "New Chat" && safeMessages.length >= 2) {
        generateChatTitle(currentChatId, safeMessages);
      }
    },
    [user, currentChatId, chats, generateChatTitle]
  );

  /**
   * Save an artifact to the current chat.
   * - If it's new: append it with its versions.
   * - If it exists: append only the latest incoming version to the existing versions.
   * Returns the new version number and the persisted artifact reference.
   */
  const saveArtifactToCurrentChat = useCallback(
    async (
      incoming: Artifact
    ): Promise<{ versionNumber: number; artifact: Artifact } | null> => {
      if (!user || !currentChatId) return null;

      const curr = chats.find((c) => c.id === currentChatId);
      if (!curr) return null;

      // Normalize incoming (fresh versions array, timestamps)
      const normalized = cloneArtifact({
        ...incoming,
        createdAt: incoming.createdAt ?? Date.now(),
        updatedAt: Date.now(),
      });

      // Build new artifacts array immutably
      const idx = curr.artifacts.findIndex((a) => a.id === normalized.id);
      let newArtifacts: Artifact[];
      let persisted: Artifact;

      if (idx >= 0) {
        const existing = cloneArtifact(curr.artifacts[idx]);

        // Append only the latest version from normalized
        const latest = normalized.versions[normalized.versions.length - 1];
        const updatedVersions = latest
          ? [...existing.versions, latest]
          : [...existing.versions];

        persisted = {
          ...existing,
          ...normalized,
          versions: updatedVersions,
          updatedAt: normalized.updatedAt,
        };

        newArtifacts = [...curr.artifacts];
        newArtifacts[idx] = persisted;
      } else {
        // First time this artifact is saved
        persisted = normalized;
        newArtifacts = [...curr.artifacts, persisted];
      }

      const versionNumber = persisted.versions.length || 1;

      // Optimistic local update with the exact array we will persist
      setChats((prev) =>
        prev.map((c) =>
          c.id === currentChatId ? { ...c, artifacts: newArtifacts, updatedAt: Date.now() } : c
        )
      );

      // Persist the exact same array
      const chatRef = doc(db, "users", user.uid, "chats", currentChatId);
      await updateDoc(chatRef, {
        artifacts: newArtifacts,
        updatedAt: serverTimestamp(),
      });

      return { versionNumber, artifact: persisted };
    },
    [user, currentChatId, chats, setChats]
  );

  const loadChat = useCallback(
    (chatId: string) => {
      setCurrentChatId(chatId);
      return chats.find((c) => c.id === chatId) || null;
    },
    [chats]
  );

  const getCurrentChat = useCallback((): Chat | null => {
    return chats.find((c) => c.id === currentChatId) || null;
  }, [chats, currentChatId]);

  const getCurrentChatModel = useCallback((): ModelConfig => {
    const current = chats.find((c) => c.id === currentChatId);
    return AVAILABLE_MODELS.find((m) => m.id === current?.modelConfig.id) || AVAILABLE_MODELS[2];
  }, [chats, currentChatId]);

  // ---- Return API ----------------------------------------------------------

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
    setChats, // exposed so callers can do advanced local tweaks if needed
  };
};
