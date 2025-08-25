"use client";

import SideMenu from "@/components/sideMenu";
import { FileText, Edit3, X, Check, ChevronRight } from "lucide-react";
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useChats } from "@/hooks/useChats";
import { Message, Artifact, ModelConfig, KingaCard } from "@/types/types";
import { AVAILABLE_MODELS } from "../config/modelConfig";
import { ExportMenu } from "./exportMenu";
import MarkdownRenderer from "./markdown";
import ChatInputBox from "@/components/chatInputBox";
import StructuredCard from "@/components/markdown/structuredCard";
import type { ExportFormat } from "./exportMenu";
import { exportToPDF } from "@/services/pdfExport";

import { callChatApi } from "@/lib/client/callChatApi";
import { buildConversationHistory } from "@/lib/chat/buildConversationHistory";

import { auth, db } from "@/services/firebase";
import { collection, getDocs } from "firebase/firestore";


export function ChatApplication() {
  // Local UI state
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentArtifact, setCurrentArtifact] = useState<Artifact | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ModelConfig>(AVAILABLE_MODELS[0]);
  const [currentVersionIndex, setCurrentVersionIndex] = useState(0);
  const [editedContent, setEditedContent] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // App data (from Firestore via your hook)
  const {
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
  } = useChats();

  const currentChat = useMemo(
    () => chats.find((chat) => chat.id === currentChatId) || null,
    [chats, currentChatId]
  );
  const currentChatArtifacts = currentChat?.artifacts || [];

  useEffect(() => {
    const chat = chats.find((c) => c.id === currentChatId);
  
    if (chat) {
      // never set undefined into state
      setMessages(Array.isArray((chat as any).messages) ? (chat as any).messages : []);
  
      // modelConfig might be missing on new chats
      const mc = (chat as any).modelConfig;
      const byId   = mc?.id   ? AVAILABLE_MODELS.find((m) => m.id === mc.id)   : null;
      const byName = mc?.name ? AVAILABLE_MODELS.find((m) => m.name === mc.name) : null;
      setSelectedModel(byId || byName || AVAILABLE_MODELS[0]);
    } else if (currentChatId) {
      setMessages([]);
    }
  
    // only on chat change
    closeArtifact();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChatId]);
  

  useEffect(() => {
    const chat = chats.find((c) => c.id === currentChatId);
    if (!chat) return;
  
    const newMessages = Array.isArray((chat as any).messages) ? (chat as any).messages : [];
    // Only pull from store if it’s caught up (>=) to what the UI has
    if (newMessages.length >= messages.length && messages !== newMessages) {
      setMessages(newMessages);
    }
  
    if (currentArtifact) {
      const updated = chat.artifacts?.find?.((a: any) => a.id === currentArtifact.id);
      if (updated) {
        const maxIdx = Math.max(0, (updated.versions?.length ?? 1) - 1);
        setCurrentArtifact(updated);
        setCurrentVersionIndex((i) => Math.min(i, maxIdx));
      }
    }
  }, [chats, currentChatId]); // keep messages OUT of deps
  


  // Add a system “version updated” bubble and persist it
  function addVersionBubble(artifact: Artifact, versionNumber: number) {
    const msg: Message = {
      id: crypto.randomUUID(),
      role: "ai",
      content: `Updated “${artifact.title}”`,
      artifactId: artifact.id,
      artifactVersion: versionNumber,
    };
    const next = [...messages, msg];
    setMessages(next);
    saveMessagesToCurrentChat(next);
  }

  // --- exporting helpers ----------------------------------------------------

  function downloadTextFile(filename: string, text: string) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.replace(/[^a-z0-9\-_]+/gi, "_") + ".txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /** ultra-light markdown → email-friendly plain text */
  function toEmailBody(title: string, content: string) {
    let body = content;

    // links: [text](url) -> text (url)
    body = body.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1 ($2)");

    // bold/italic: **x** / *x* / _x_ -> x
    body = body.replace(/\*\*([^*]+)\*\*/g, "$1");
    body = body.replace(/\*([^*]+)\*/g, "$1");
    body = body.replace(/_([^_]+)_/g, "$1");

    // headings: '# Title' -> 'Title'
    body = body.replace(/^\s*#{1,6}\s*/gm, "");

    // bullets normalize
    body = body.replace(/^\s*[-*•]\s+/gm, "• ");

    // collapse too many blank lines
    body = body.replace(/\n{3,}/g, "\n\n");

    body = body.trim();
    return body || title;
  }

  // --- artifact open/close/edit ---------------------------------------------

  const openArtifact = (artifact: Artifact, versionIndex?: number) => {
    setCurrentArtifact(artifact);
    if (artifact.versions && artifact.versions.length > 0) {
      setCurrentVersionIndex(
        typeof versionIndex === "number" ? versionIndex : artifact.versions.length - 1
      );
    }
    setIsEditing(false);
  };

  const closeArtifact = () => {
    setCurrentArtifact(null);
    setIsEditing(false);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleNewChat = async () => {
    await createNewChat(selectedModel);
  };

  const handleSelectChat = (chatId: string) => {
    loadChat(chatId);
  };

  const handleEditClick = () => {
    if (!currentArtifact) return;
    setEditedContent(currentArtifact.versions[currentVersionIndex].content);
    setIsEditing(true);
  };
  const handleCancelEdit = () => {
    if (currentArtifact) {
      const current = currentArtifact.versions[currentVersionIndex]?.content ?? "";
      setEditedContent(current);
    } else {
      setEditedContent("");
    }
    setIsEditing(false);
  };

  const handleSaveClick = async () => {
    if (!currentArtifact) return;

    // Build a draft that appends a new version
    const draft: Artifact = {
      ...currentArtifact,
      versions: [...currentArtifact.versions, { content: editedContent, createdAt: Date.now() }],
      updatedAt: Date.now(),
    };

    // Persist to Firestore
    const persisted = await saveArtifactToCurrentChat(draft);
    if (persisted) {
      // Support either return shape: { artifact, versionNumber } OR { artifactId, versionIndex }
      const artifactFromReturn = (persisted as any).artifact as Artifact | undefined;
      const versionNumber =
        (persisted as any).versionNumber ??
        ((persisted as any).versionIndex != null ? (persisted as any).versionIndex : 1);

      const artifactToOpen = artifactFromReturn ?? draft;
      setCurrentArtifact(artifactToOpen);
      setCurrentVersionIndex(Math.max(0, (versionNumber ?? 1) - 1));

      // Add a chat bubble for this new version so it’s reopenable later
      addVersionBubble(artifactToOpen, versionNumber ?? 1);
    }

    setIsEditing(false);
    setEditedContent("");
  };

  // --- export menu actions ---------------------------------------------------

  const onExport = useCallback(
    async (format: ExportFormat, artifact: Artifact) => {
      const idx =
        typeof currentVersionIndex === "number"
          ? Math.max(0, Math.min(currentVersionIndex, artifact.versions.length - 1))
          : artifact.versions.length - 1;

      const content = artifact.versions[idx]?.content ?? "";
      const title = artifact.title || "Document";

      switch (format) {
        case "pdf": {
          await exportToPDF({ title, content });
          break;
        }
        case "text": {
          downloadTextFile(title, content);
          break;
        }
        case "email": {
          const emailBody = toEmailBody(title, content);
          await navigator.clipboard.writeText(emailBody).catch(() => {});
          break;
        }
        default:
          break;
      }
    },
    [currentVersionIndex]
  );

  type ToolFlags = { email_finder: boolean; search: boolean; crm: boolean };

  async function fetchToolFlags(): Promise<ToolFlags> {
    const defaults: ToolFlags = { email_finder: false, search: false, crm: false };
    const uid = auth.currentUser?.uid;
    try {
      if (!uid) return defaults;
  
      // 1) Try per-user collection: users/{uid}/toolPermissions/{toolId}
      const perUserCol = collection(db, "users", uid, "toolPermissions");
      const perUserSnap = await getDocs(perUserCol);
      if (!perUserSnap.empty) {
        const out: ToolFlags = { ...defaults };
        perUserSnap.forEach((d) => {
          const data = d.data() as Record<string, any>;
          const on =
            data.allowed ?? data.enabled ?? data.allow ?? data.value ?? data.on;
          if (typeof on === "boolean" && (d.id in out)) {
            // doc ids must be: email_finder, search, crm
            (out as any)[d.id] = on;
          }
        });
        return out;
      }
  
      // 2) Fallback: global collection toolPermissions/{toolId}
      const globalCol = collection(db, "toolPermissions");
      const globalSnap = await getDocs(globalCol);
      if (!globalSnap.empty) {
        const out: ToolFlags = { ...defaults };
        globalSnap.forEach((d) => {
          const data = d.data() as Record<string, any>;
          const on =
            data.allowed ?? data.enabled ?? data.allow ?? data.value ?? data.on;
          if (typeof on === "boolean" && (d.id in out)) {
            (out as any)[d.id] = on;
          }
        });
        return out;
      }
    } catch (e) {
      console.warn("[client] fetchToolFlags failed:", e);
    }
    return defaults;
  }
  
  const handleSend = async (messageContent: string) => {
    if (!messageContent.trim()) return;

    // Ensure we have a chatId
    let chatId = currentChatId;
    if (!chatId) {
      chatId = await createNewChat(selectedModel);
    }

    // 1) Add the user message locally
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: messageContent.trim(),
    };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);

    // 2) Show a temporary thinking bubble
    const thinkingMessageId = crypto.randomUUID();
    setMessages((prev) => [...prev, { id: thinkingMessageId, role: "ai", content: "..." }]);

    // 3) Prepare request body
    const conversationHistoryForAPI = buildConversationHistory(updatedMessages);

    const fallbackArtifact =
      currentArtifact ??
      (currentChatArtifacts.length > 0
        ? currentChatArtifacts[currentChatArtifacts.length - 1]
        : null);

    const versions = fallbackArtifact?.versions ?? [];
    const latest = versions.length ? (versions[versions.length - 1].content ?? "") : "";
    const versionInfo = versions
      .map((v, i) => `V${i + 1}@${new Date(v.createdAt).toLocaleString()}`)
      .join(", ");
    

    // put this near the top of handleSend (before requestBody)
    function buildDocumentContext(art?: Artifact | null, budget = 12000) {
      if (!art) return undefined;
      const versions = art.versions ?? [];
      const index = versions
        .map((v, i) => `V${i + 1}@${new Date(v.createdAt).toLocaleString()} len=${(v.content ?? "").length}`)
        .join(", ");

      const parts: string[] = [
        `Artifact "${art.title}" (id: ${art.id})`,
        `Versions: ${versions.length}${index ? ` — ${index}` : ""}`,
      ];

      // latest first, then previous versions until budget is used
      let remaining = budget;
      for (let i = versions.length - 1; i >= 0 && remaining > 0; i--) {
        const label = `\n=== V${i + 1} (${new Date(versions[i].createdAt).toLocaleString()}) ===\n`;
        const body = String(versions[i].content ?? "");
        const take = Math.min(body.length, Math.max(0, remaining - label.length));
        parts.push(label + body.slice(0, take));
        remaining -= label.length + take;
      }

      return parts.join("\n");
    }

    const documentContext = buildDocumentContext(fallbackArtifact);
    const toolFlags = await fetchToolFlags();

    const requestBody = {
      message: userMessage.content,
      modelConfig: selectedModel,
      conversationHistory: conversationHistoryForAPI,
      documentContext,
      currentArtifactId: fallbackArtifact?.id,
      currentArtifactTitle: fallbackArtifact?.title,
      toolFlags,
    };

    try {
      // 4) Call your API (now includes chatId)
      const { result } = await callChatApi({ ...requestBody, chatId });

      // Optional debug logs
      console.log("[chatApplication] requestBody:", requestBody);
      console.log("[chatApplication] result:", result);

      // Update chat title if server suggested one
      // if (result?.suggestedTitle && chatId) {
      //   if (typeof updateChatTitle === "function") {
      //     await updateChatTitle(chatId, result.suggestedTitle);
      //   } else if (typeof updateChat === "function") {
      //     await updateChat(chatId, { title: result.suggestedTitle });
      //   }
      // }

      // 5) Build assistant message
      let aiMessage: Message = {
        id: thinkingMessageId,
        role: "ai",
        content: result.output || "No response",
      };
      if (result.card) aiMessage.card = result.card as KingaCard;

      // 6) Artifact handling
      if (result.artifact) {
        const incoming = result.artifact as Artifact;

        const prev = fallbackArtifact;
        const prevLatest = prev?.versions?.[prev.versions.length - 1]?.content ?? "";
        const newChunk = incoming.versions?.[0]?.content ?? "";
        const now = Date.now();

        // --- REPLACE strategy: if the tool returned any text, use it as the new version.
        // If it returned empty/whitespace, no-op (keep previous).
        const nextContent = newChunk.trim() ? newChunk : prevLatest;
        const normalized: Artifact = {
          ...incoming,
          versions: [{ content: nextContent, createdAt: now }],
          updatedAt: now,
        };

        if (!nextContent.trim()) {
          aiMessage.content = "No changes detected for the document.";
        } else {
          const saved = await saveArtifactToCurrentChat(normalized);
          const versionNumber =
            (saved as any)?.versionNumber ??
            ((saved as any)?.versionIndex != null ? (saved as any).versionIndex : 1);
          const persistedArtifact = (saved as any)?.artifact ?? normalized;

          openArtifact(persistedArtifact, Math.max(0, (versionNumber ?? 1) - 1));
          aiMessage.artifactId = persistedArtifact.id;
          aiMessage.artifactVersion = versionNumber ?? 1;
          aiMessage.content = result.output || "I've updated the document for you.";
        }
      }





      // 7) Replace thinking with final assistant message and persist
      const finalMessages = [...updatedMessages, aiMessage];
      setMessages(finalMessages);
      saveMessagesToCurrentChat(finalMessages, { suggestedTitle: result.suggestedTitle });





    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An error occurred.";
      setMessages((prev) =>
        prev.map((msg) => (msg.id === thinkingMessageId ? { ...msg, content: errorMessage } : msg))
      );
    }
  };

  // --- render ---------------------------------------------------------------

  return (
    <div className="flex h-screen bg-background">
      <SideMenu
        chats={chats}
        currentChatId={currentChatId}
        onNewChat={handleNewChat}
        onSelectChat={handleSelectChat}
        onDeleteChat={deleteChat}
      />

      <div className="flex-1 flex min-w-0">
        <div className={`${currentArtifact ? "w-1/2" : "w-full"} flex flex-col bg-background`}>
          {/* Header spacer */}
          <div className="flex items-center justify-end p-4 h-[69px]" />

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-6">
                <h1 className="text-2xl font-semibold text-foreground mb-3">
                  How can I help you?
                </h1>
              </div>
            ) : (
              <div className="max-w-5xl mx-auto space-y-5">
                {messages.map((message) => {
                  const isUser = message.role === "user";

                  // Always hold a *string* version for markdown
                  const contentStr =
                    typeof message.content === "string"
                      ? message.content
                      : (() => {
                          try {
                            return JSON.stringify(message.content);
                          } catch {
                            return String(message.content);
                          }
                        })();

                  // Try to parse JSON for structured display
                  let parsed: unknown = null;
                  let isRecord = false;

                  try {
                    if (/^\s*[{[]/.test(contentStr)) {
                      parsed = JSON.parse(contentStr);
                      isRecord =
                        !!parsed && typeof parsed === "object" && !Array.isArray(parsed);
                    }
                  } catch {
                    // not JSON — ignore and let markdown handle it
                  }

                  const isKingaCardFromParsed =
                    isRecord && Array.isArray((parsed as any)?.sections);
                  const isCardMsg = !!message.card || isKingaCardFromParsed;

                  const bubbleClass = isCardMsg
                    ? "max-w-full sm:max-w-[90%] md:max-w-[75%] lg:max-w-[65%] p-0"
                    : `max-w-full sm:max-w-[90%] md:max-w-[75%] lg:max-w-[65%]
                        rounded-2xl p-3 sm:p-4 shadow-sm border
                        ${isUser
                          ? "bg-turquoise text-white border-turquoise/60"
                          : "bg-secondary text-secondary-foreground border-border"
                        }`;

                  return (
                    <div
                      key={message.id}
                      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                    >
                      <div className={bubbleClass}>
                        {message.content === "..." ? (
                          // typing dots
                          <div className="flex items-center space-x-1">
                            <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" />
                            <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:0.1s]" />
                            <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:0.2s]" />
                          </div>
                        ) : isCardMsg ? (
                          <StructuredCard
                            card={(message.card ?? (parsed as KingaCard))}
                            
                          />
                        ) : isRecord ? (
                          <StructuredCard data={parsed}  />
                        ) : (
                          <MarkdownRenderer content={contentStr} />
                        )}

                        {message.artifactId && (
                          <button
                            onClick={() => {
                              const artifact = currentChatArtifacts.find(
                                (a) => a.id === message.artifactId
                              );
                              if (artifact) {
                                const versionIndex = (message.artifactVersion ?? 1) - 1;
                                openArtifact(artifact, versionIndex);
                              }
                            }}
                            className="w-full p-3 bg-muted rounded-lg text-left transition-colors group"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-foreground font-medium text-sm truncate">
                                {currentChatArtifacts.find((a) => a.id === message.artifactId)
                                  ?.title || "Document"}
                              </span>
                              <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                                <span className="px-2 py-1 text-xs rounded-lg font-semibold bg-primary text-primary-foreground">
                                  V{message.artifactVersion ?? 1}
                                </span>
                                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                              </div>
                            </div>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Chat input */}
          <ChatInputBox onSend={handleSend} />
        </div>

        {currentArtifact && (
          <div className="w-1/2 border-l border-border flex flex-col bg-background">
            <div className="p-4 flex-shrink-0 border-b border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <FileText className="w-5 h-5 text-foreground flex-shrink-0" />
                  <h3 className="font-semibold text-lg text-foreground truncate">
                    {currentArtifact.title}
                  </h3>
                  <span className="ml-2 px-2 py-0.5 text-xs rounded-lg font-semibold bg-primary text-primary-foreground">
                    V{currentVersionIndex + 1}
                  </span>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  {isEditing ? (
                    <>
                      <button
                        onClick={handleCancelEdit}
                        className="px-3 py-1.5 text-sm bg-muted hover:bg-border text-muted-foreground rounded-md transition-colors flex items-center gap-1.5"
                      >
                        <X className="w-4 h-4" /> Cancel
                      </button>
                      <button
                        onClick={handleSaveClick}
                        className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors flex items-center gap-1.5"
                      >
                        <Check className="w-4 h-4" /> Save
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={handleEditClick}
                        className="px-3 py-1.5 text-sm bg-primary hover:bg-primary/90 text-primary-foreground rounded-md transition-colors flex items-center gap-1.5"
                      >
                        <Edit3 className="w-3 h-3" /> Edit
                      </button>
                      <ExportMenu artifact={currentArtifact} onExport={onExport} />
                      <button
                        onClick={closeArtifact}
                        className="p-2 text-muted-foreground hover:bg-muted rounded-md"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 text-foreground">
              {isEditing ? (
                <textarea
                  value={editedContent}
                  onChange={(e) => setEditedContent(e.target.value)}
                  className="w-full h-full p-2 border-0 rounded-lg resize-none focus:outline-none bg-background text-foreground font-sans text-sm leading-relaxed"
                  placeholder="Edit your document..."
                />
              ) : (
                <pre
                  key={`${currentArtifact?.id}:${currentVersionIndex}`}
                  className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground"
                >
                  {currentArtifact?.versions[currentVersionIndex]?.content || ""}
                </pre>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
