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

import { auth } from "@/services/firebase";

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

  
  const pendingIdsRef = useRef<Set<string>>(new Set());
  

  useEffect(() => {
    const chat = chats.find((c) => c.id === currentChatId);
    if (!chat) return; 
  
    const mc = chat.modelConfig;
    const byId   = mc?.id   ? AVAILABLE_MODELS.find((m) => m.id === mc.id)   : null;
    const byName = mc?.name ? AVAILABLE_MODELS.find((m) => m.name === mc.name) : null;
    setSelectedModel(byId || byName || AVAILABLE_MODELS[0]);
      
  }, [currentChatId]);
  
  useEffect(() => {
    const chat = chats.find((c) => c.id === currentChatId);
    if (!chat) return;
  
    const serverMsgs: Message[] = Array.isArray(chat.messages) ? chat.messages : [];
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
    await createNewChat(selectedModel);
  };

  const handleSelectChat = (chatId: string) => {
    loadChat(chatId);
  };



  type ToolFlags = { email_finder: boolean; search: boolean; crm: boolean };

  async function fetchToolFlags(): Promise<ToolFlags> {
    const defaults: ToolFlags = { email_finder: false, search: false, crm: false };
    const uid = auth.currentUser?.uid;
    try {
      if (!uid) return defaults;
  
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
  
    
  
    // 3) Prepare request payload for the API
    const updatedMessages = [...messages, userMessage]; // history for server (exclude typing bubble)
  
    const conversationHistoryForAPI = buildConversationHistory(updatedMessages);
  
    const documentContext = undefined;
    const toolFlags = await fetchToolFlags();
  
    const requestBody = {
      message: userMessage.content,
      modelConfig: selectedModel,
      conversationHistory: conversationHistoryForAPI,
      documentContext,
      toolFlags,
    };
  
    try {
      // 4) Call API (Workflow-1 or Workflow-2 decided in the route)
      const { result } = await callChatApi({ ...requestBody, chatId }, "/api/chat-n8n");
  
      const aiContent = result?.output ?? "No response";
  
      // 5) Replace typing bubble with the final AI message and persist
      const finalMessages: Message[] = [...updatedMessages, { id: thinkingMessageId, role: "ai", content: aiContent }];
      setMessages(finalMessages);
      await saveMessagesToCurrentChat(finalMessages, { suggestedTitle: result?.suggestedTitle });
    } catch (e: unknown) {
      // Show a friendly error in the typing bubble place
      setMessages(prev =>
        prev.map(m => (m.id === thinkingMessageId ? { ...m, content: `An error occurred: ${e}`} : m))
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
