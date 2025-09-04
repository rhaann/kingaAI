"use client";

import SideMenu from "@/components/sideMenu";
import { Plus } from "lucide-react";
import Image from "next/image";
import { useTheme } from "next-themes";
import { useState, useRef, useEffect } from "react";
import { useChats } from "@/hooks/useChats";
import { Message, ModelConfig } from "@/types/types";
import { AVAILABLE_MODELS } from "../config/modelConfig";
import MarkdownRenderer from "./markdown";
import ChatInputBox from "@/components/chatInputBox";

import { callChatApi } from "@/lib/client/callChatApi";
import { buildConversationHistory } from "@/lib/chat/buildConversationHistory";

import { auth, db } from "@/services/firebase";
import { collection, getDocs } from "firebase/firestore";

export function ChatApplication() {
  const { resolvedTheme } = useTheme();
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedModel, setSelectedModel] = useState<ModelConfig>(AVAILABLE_MODELS[0]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // App data (from Firestore via your hook)
  const {
    chats,
    currentChatId,
    createNewChat,
    deleteChat,
    saveMessagesToCurrentChat,
    
    loadChat,
  } = useChats();

  const lastContextRef = useRef<any | null>(null);


  // Simple “send email” intent (align with server-side logic)
  function wantsEmailLocal(s: string): boolean {
    const m = s.toLowerCase().trim();
    if (/@/.test(m) && /\b(email\s+is|my\s+email|their\s+email)\b/.test(m)) return false;
    return /\b(send|draft|write|compose)\b.*\bemail\b|\bemail\b.*\b(him|her|them|me|us|person|team)\b/i.test(m);
  }

  // Minimal email validator
  function isValidEmail(val: unknown): val is string {
    if (typeof val !== "string") return false;
    const s = val.trim();
    // simple, safe, and good enough for preflight
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(s);
  }
  const pendingIdsRef = useRef<Set<string>>(new Set());
  

  useEffect(() => {
    const chat = chats.find((c) => c.id === currentChatId);
    if (!chat) return; 
  
    const mc = (chat as any).modelConfig;
    const byId   = mc?.id   ? AVAILABLE_MODELS.find((m) => m.id === mc.id)   : null;
    const byName = mc?.name ? AVAILABLE_MODELS.find((m) => m.name === mc.name) : null;
    setSelectedModel(byId || byName || AVAILABLE_MODELS[0]);
  
    // only on chat change
    
  }, [currentChatId]);
  
  useEffect(() => {
    const chat = chats.find((c) => c.id === currentChatId);
    if (!chat) return;
  
    const serverMsgs: Message[] = Array.isArray((chat as any).messages) ? (chat as any).messages : [];
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
  
    
  }, [chats, currentChatId]);
  
  

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleNewChat = async () => {
    lastContextRef.current = null;            // NEW
    await createNewChat(selectedModel);
  };

  const handleSelectChat = (chatId: string) => {
    lastContextRef.current = null;            // NEW
    loadChat(chatId);
  };



  type ToolFlags = { email_finder: boolean; search: boolean; crm: boolean };

  async function fetchToolFlags(): Promise<ToolFlags> {
    const defaults: ToolFlags = { email_finder: false, search: false, crm: false };
    const uid = auth.currentUser?.uid;
    try {
      if (!uid) return defaults;
  
      // 1) Try per-user collection: users/{uid}/toolPermissions/{toolId}
      const perUserCol = collection(db, "users", uid, "toolPermissions");
      const perUserSnap = await getDocs(perUserCol);
      
  
    } catch (e) {
      console.warn("[client] fetchToolFlags failed:", e);
    }
    return defaults;
  }
  const handleSend = async (messageContent: string) => {
    if (!messageContent.trim()) return;
  
    // Ensure we have a chatId (create one if needed)
    let chatId = currentChatId;
    if (!chatId) {
      const newId = await createNewChat(selectedModel);
      if (!newId) return;
      chatId = newId;
    }
  
    // 1) Optimistic user message + typing bubble
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: messageContent.trim(),
    };
    const thinkingMessageId = crypto.randomUUID();
  
    setMessages(prev => [
      ...prev,
      userMessage,
      { id: thinkingMessageId, role: "ai", content: "..." },
    ]);
    pendingIdsRef.current.add(userMessage.id);
    pendingIdsRef.current.add(thinkingMessageId);
  
    // 2) Email preflight (only if the user intent is "send email")
    const sendEmailIntent = wantsEmailLocal(messageContent);
  
    // try to get an email from last context first, then fall back to one typed in this message
    const ctx = lastContextRef.current || null;
    const emailFromContext =
      ctx?.email ??
      ctx?.Email ??
      ctx?.contact?.email ??
      ctx?.person?.email ??
      null;
  
    const emailFromMessage =
      messageContent.match(/\b[^\s@]+@[^\s@]+\.[^\s@]{2,}\b/i)?.[0] ?? null;
  
    const candidateEmail = emailFromContext || emailFromMessage;
  
    if (sendEmailIntent) {
      if (!candidateEmail) {
        // replace typing bubble with a guardrail
        setMessages(prev =>
          prev.map(m =>
            m.id === thinkingMessageId
              ? {
                  ...m,
                  content:
                    "I don’t have a contact email yet. Ask me to research them first, or include an address (e.g., `email alex@example.com`).",
                }
              : m
          )
        );
        pendingIdsRef.current.delete(thinkingMessageId);
        return;
      }
      if (!isValidEmail(candidateEmail)) {
        setMessages(prev =>
          prev.map(m =>
            m.id === thinkingMessageId
              ? {
                  ...m,
                  content: `The email I have (\`${candidateEmail}\`) doesn’t look valid. Please provide a correct address or run a quick search first.`,
                }
              : m
          )
        );
        pendingIdsRef.current.delete(thinkingMessageId);
        return;
      }
    }
  
    // 3) Prepare request payload for the API
    const updatedMessages = [...messages, userMessage]; // history for server (exclude typing bubble)
  
    const conversationHistoryForAPI = buildConversationHistory(updatedMessages);
  
    const documentContext = undefined;
    const toolFlags = await fetchToolFlags();
  
    const reqContext = (lastContextRef.current && typeof lastContextRef.current === 'object'
      && Object.keys(lastContextRef.current).length > 0)
      ? lastContextRef.current
      : null;

    const requestBody = {
      message: userMessage.content,
      modelConfig: selectedModel,
      conversationHistory: conversationHistoryForAPI,
      documentContext,
      toolFlags,
      context: reqContext, // pass prior JSON so WF2 can run (omit if empty)
    };
  
    try {
      // 4) Call API (Workflow-1 or Workflow-2 decided in the route)
      const { result } = await callChatApi({ ...requestBody, chatId }, "/api/chat-n8n");
  
      // Store fresh context from WF1 so a follow-up "send email" can use it
      if (result?.context) {
        lastContextRef.current = result.context;
      }
  
      let aiContent = result?.output ?? "No response";
  
      // 5) Replace typing bubble with the final AI message and persist
      const finalMessages: Message[] = [...updatedMessages, { id: thinkingMessageId, role: "ai", content: aiContent }];
      setMessages(finalMessages);
      await saveMessagesToCurrentChat(finalMessages, { suggestedTitle: result?.suggestedTitle });
    } catch (e) {
      // Show a friendly error in the typing bubble place
      setMessages(prev =>
        prev.map(m => (m.id === thinkingMessageId ? { ...m, content: "An error occurred." } : m))
      );
    } finally {
      // Release optimistic protection so snapshots can reconcile
      pendingIdsRef.current.delete(userMessage.id);
      pendingIdsRef.current.delete(thinkingMessageId);
    }
  };
  
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
        <div className={`w-full flex flex-col bg-background`}>
          {/* Header */}
          <div className="flex items-center justify-between p-4 h-[69px] border-b border-border">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center justify-center">
                {resolvedTheme === "dark" ? (
                  <Image src="/logoLight.svg" alt="Actual Insight Logo" width={24} height={24} />
                ) : (
                  <Image src="/logoDark.svg" alt="Actual Insight Logo" width={24} height={24} />
                )}
              </span>
              <span className="text-foreground font-semibold">actual insight</span>
            </div>
            <button
              onClick={handleNewChat}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              aria-label="New chat"
            >
              <Plus className="w-5 h-5" />
              <span className="hidden sm:inline">New Chat</span>
            </button>
          </div>

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
                  // const isKingaCardFromParsed = isRecord && Array.isArray((parsed as { sections?: unknown[] } | null)?.sections);
                  const willRenderCardFallback = false;



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
                        : (
                            <>
                              {/* always show the interpreted answer first */}
                              <MarkdownRenderer content={contentStr} />
                            </>
                          )
                        }

                        
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

        
      </div>
    </div>
  );
}
