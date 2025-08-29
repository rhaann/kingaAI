"use client";

import SideMenu from "@/components/sideMenu";
import { FileText, Edit3, X, Check, ChevronRight } from "lucide-react";
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useChats } from "@/hooks/useChats";
import { Message, Artifact, ModelConfig, KingaCard, ToolEnvelope } from "@/types/types";
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

type ChatLike = {
  messages?: Message[];
  modelConfig?: Partial<ModelConfig>;
  artifacts?: Artifact[];
};


export function ChatApplication() {
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
    saveMessagesToCurrentChat,
    saveArtifactToCurrentChat,
    loadChat,
  } = useChats();

  const currentChat = useMemo(
    () => chats.find((chat) => chat.id === currentChatId) || null,
    [chats, currentChatId]
  );
  const currentChatArtifacts = currentChat?.artifacts || [];

  
  const pendingIdsRef = useRef<Set<string>>(new Set());
  


  useEffect(() => {
    const chat = chats.find((c) => c.id === currentChatId);
    if (!chat) return; 
  
    const c = chat as ChatLike;
    const mc = c.modelConfig;
    const byId   = mc?.id   ? AVAILABLE_MODELS.find((m) => m.id === mc.id)   : null;
    const byName = mc?.name ? AVAILABLE_MODELS.find((m) => m.name === mc.name) : null;
    setSelectedModel(byId || byName || AVAILABLE_MODELS[0]);
  
    // only on chat change
    closeArtifact();
  }, [currentChatId]);
  
  useEffect(() => {
    const chat = chats.find((c) => c.id === currentChatId);
    if (!chat) return;
  
    const c = chat as ChatLike;
    const serverMsgs: Message[] = Array.isArray(c.messages) ? c.messages : [];
    const serverIds = new Set(serverMsgs.map((m) => m.id));
  
    // Use functional updater: no need for messagesRef or messages in deps
    setMessages((prev) => {
      const optimisticMissing = Array.from(pendingIdsRef.current)
        .map((id) => prev.find((m) => m.id === id))
        .filter((m): m is Message => !!m)
        .filter((m) => !serverIds.has(m.id));
  
      const stitched = optimisticMissing.length
        ? serverMsgs.concat(optimisticMissing)
        : serverMsgs;
  
      const changed =
        prev.length !== stitched.length ||
        prev.some((m, i) => m.id !== stitched[i]?.id);
  
      return changed ? stitched : prev;
    });
  
    // keep artifact pane in sync
    if (currentArtifact) {
      const updated = c.artifacts?.find?.((a: Artifact) => a.id === currentArtifact.id);
      if (updated) {
        const maxIdx = Math.max(0, (updated.versions?.length ?? 1) - 1);
        setCurrentArtifact(updated);
        setCurrentVersionIndex((i) => Math.min(i, maxIdx));
      }
    }
  }, [chats, currentChatId, currentArtifact]);
  
  


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
      type SaveResult = { artifact?: Artifact; versionNumber?: number; versionIndex?: number };
      const pr = persisted as SaveResult | undefined;
      const artifactFromReturn = pr?.artifact;
      const versionNumber =
        pr?.versionNumber ?? (pr?.versionIndex != null ? pr.versionIndex : 1);

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
          const data = d.data() as Record<string, unknown>;
          const on = (data as Record<string, unknown>).allowed
            ?? (data as Record<string, unknown>).enabled
            ?? (data as Record<string, unknown>).allow
            ?? (data as Record<string, unknown>).value
            ?? (data as Record<string, unknown>).on;
          
          const key = d.id as keyof ToolFlags;
          if (typeof on === "boolean" && key in out) {
            out[key] = on;
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
          const data = d.data() as Record<string, unknown>;
          const on = (data as Record<string, unknown>).allowed
            ?? (data as Record<string, unknown>).enabled
            ?? (data as Record<string, unknown>).allow
            ?? (data as Record<string, unknown>).value
            ?? (data as Record<string, unknown>).on;
          
          const key = d.id as keyof ToolFlags;
          if (typeof on === "boolean" && key in out) {
            out[key] = on;
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
  
    // Ensure chatId (create one if needed)
    let chatId = currentChatId;
    if (!chatId) {
      const newId = await createNewChat(selectedModel);
      if (!newId) return;
      chatId = newId;
    }
  
    // 1) Optimistic user message
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: messageContent.trim(),
    };
    const thinkingMessageId = crypto.randomUUID();
  
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages); // show user message immediately
    setMessages((prev) => [...prev, { id: thinkingMessageId, role: "ai", content: "..." }]); // typing bubble
  
    // Track optimistic IDs so the snapshot guard won’t wipe them
    pendingIdsRef.current.add(userMessage.id);
    pendingIdsRef.current.add(thinkingMessageId);
  
    // 2) Prepare request
    const conversationHistoryForAPI = buildConversationHistory(updatedMessages);
  
    const fallbackArtifact =
      currentArtifact ??
      (currentChatArtifacts.length > 0
        ? currentChatArtifacts[currentChatArtifacts.length - 1]
        : null);
  
    function buildDocumentContext(art?: Artifact | null, budget = 12000): string | undefined {
      if (!art) return undefined;
      const versions = art.versions ?? [];
      const index = versions
        .map(
          (v, i) =>
            `V${i + 1}@${new Date(v.createdAt).toLocaleString()} len=${(v.content ?? "").length}`
        )
        .join(", ");
  
      const parts: string[] = [
        `Artifact "${art.title}" (id: ${art.id})`,
        `Versions: ${versions.length}${index ? ` — ${index}` : ""}`,
      ];
  
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
      // 3) Call API
      const { result } = await callChatApi({ ...requestBody, chatId });
  
      // 4) Build assistant message
      const aiMessage: Message = {
        id: thinkingMessageId,
        role: "ai",
        content: result.output ?? "No response",
      };
      aiMessage.rawEnvelopes = (result.rawEnvelopes ?? undefined) as ToolEnvelope[] | undefined;
      if (result.card) aiMessage.card = result.card as KingaCard;
  
      // 5) Artifact handling (replace/append strategy)
      if (result.artifact) {
        const incoming = result.artifact as Artifact;
  
        const prev = fallbackArtifact;
        const prevLatest = prev?.versions?.[prev.versions.length - 1]?.content ?? "";
        const newChunk = incoming.versions?.[0]?.content ?? "";
        const now = Date.now();
  
        const nextContent = newChunk.trim() ? newChunk : prevLatest;
        const normalized: Artifact = {
          ...incoming,
          versions: [{ content: nextContent, createdAt: now }],
          updatedAt: now,
        };
  
        if (!nextContent.trim()) {
          aiMessage.content = "No changes detected for the document.";
        } else {
          const saved = (await saveArtifactToCurrentChat(normalized)) as
            | { artifact?: Artifact; versionNumber?: number; versionIndex?: number }
            | null
            | undefined;
  
          const finalVersionNumber =
            saved?.versionNumber ?? (saved?.versionIndex != null ? saved.versionIndex : 1);
          const persistedArtifact = saved?.artifact ?? normalized;
  
          openArtifact(persistedArtifact, Math.max(0, (finalVersionNumber ?? 1) - 1));
          aiMessage.artifactId = persistedArtifact.id;
          aiMessage.artifactVersion = finalVersionNumber ?? 1;
          aiMessage.content = result.output ?? "I've updated the document for you.";
        }
      }
  
      // 6) Commit messages + title suggestion
      const finalMessages = [...updatedMessages, aiMessage];
      setMessages(finalMessages);
      await saveMessagesToCurrentChat(finalMessages, { suggestedTitle: result.suggestedTitle });
    } catch {
      setMessages((prev) =>
        prev.map((m) => (m.id === thinkingMessageId ? { ...m, content: "An error occurred." } : m))
      );
      
    } finally {
      // Always release optimistic protection so snapshots can take over
      pendingIdsRef.current.delete(userMessage.id);
      pendingIdsRef.current.delete(thinkingMessageId);
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
                  const rawEnvelopes = message.rawEnvelopes;
                  const hasRawToggles = Array.isArray(rawEnvelopes) && rawEnvelopes.length > 0;

                  try {
                    if (/^\s*[{[]/.test(contentStr)) {
                      parsed = JSON.parse(contentStr);
                      isRecord =
                        !!parsed && typeof parsed === "object" && !Array.isArray(parsed);
                    }
                  } catch {
                    // not JSON — ignore and let markdown handle it
                  }
                  const isKingaCardFromParsed = isRecord && Array.isArray((parsed as { sections?: unknown[] } | null)?.sections);
                  const willRenderCardFallback =!hasRawToggles && !contentStr.trim() && (!!message.card || isKingaCardFromParsed);



                  const bubbleClass = willRenderCardFallback
                    ? "max-w-full sm:max-w-[90%] md:max-w-[75%] lg:max-w-[65%] p-0"
                    : `max-w-full sm:max-w-[90%] md-max-w-[75%] lg:max-w-[65%]
                        rounded-2xl p-3 sm:p-4 shadow-sm border
                        ${isUser ? "bg-turquoise text-white border-turquoise/60"
                                : "bg-secondary text-secondary-foreground border-border"}`;


                  return (
                    <div
                      key={message.id}
                      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                    >
                      <div className={bubbleClass}>
                        {message.content === "..."
                        ? (
                            // typing dots
                            <div className="flex items-center space-x-1">
                              <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" />
                              <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:0.1s]" />
                              <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:0.2s]" />
                            </div>
                          )
                        : willRenderCardFallback
                        ? (
                            <StructuredCard card={(message.card ?? (parsed as KingaCard))} />
                          )
                        : (
                            <>
                              {/* always show the interpreted answer first */}
                              <MarkdownRenderer content={contentStr} />

                              {/* raw toggles, one per envelope */}
                              {rawEnvelopes && rawEnvelopes.length > 0 && (
                                  <div className="mt-3 space-y-3">
                                    {rawEnvelopes.map((env, idx) => {
                                      const card =
                                        env.ui?.mime === "application/kinga.card+json" ? env.ui.content : undefined;
                                      const prettyTitle = card?.title ?? env.summary ?? "Details";
                                      return (
                                        <details
                                          key={idx}
                                          className="group rounded-lg border border-border bg-background mt-2"
                                        >
                                          <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-secondary-foreground flex items-center justify-between">
                                            <span className="text-foreground">{prettyTitle}</span>
                                            <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90" />
                                          </summary>
                                          <div className="px-3 pb-3">
                                            {card ? (
                                              <StructuredCard card={card} frameless />
                                            ) : (
                                              <StructuredCard
                                                data={env.data ?? (env as unknown)}
                                                title={prettyTitle}
                                                frameless
                                              />
                                            )}
                                          </div>
                                        </details>
                                      );
                                    })}
                                  </div>
                              )}

                              {/* if someone pasted a JSON-ish record as a message, still show it nicely */}
                              {!isUser && isRecord && !hasRawToggles && (
                                <div className="mt-3">
                                  <StructuredCard data={parsed} frameless />
                                </div>
                              )}
                            </>
                          )
                        }

                        

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
