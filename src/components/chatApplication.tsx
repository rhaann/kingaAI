"use client";

import SideMenu from "@/components/sideMenu";
import { FileText, Edit3, X, Check, ChevronRight } from "lucide-react";
import { useState, useRef, useEffect, useMemo } from "react";
import { useChats } from "@/hooks/useChats";
import { Message, Artifact, ModelConfig } from "@/types/types";
import { AVAILABLE_MODELS } from "../config/modelConfig";
import { ExportMenu } from "./exportMenu";
import MarkdownRenderer from "./markdown";
import ChatInputBox from "@/components/chatInputBox";

export function ChatApplication() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentArtifact, setCurrentArtifact] = useState<Artifact | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ModelConfig>(AVAILABLE_MODELS[0]);
  const [currentVersionIndex, setCurrentVersionIndex] = useState(0);
  const [editedContent, setEditedContent] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    chats,
    currentChatId,
    createNewChat,
    deleteChat,
    updateCurrentChatModel,
    saveMessagesToCurrentChat,
    saveArtifactToCurrentChat,
    loadChat,
  } = useChats();

  const currentChat = useMemo(
    () => chats.find((chat) => chat.id === currentChatId) || null,
    [chats, currentChatId]
  );
  const currentChatArtifacts = currentChat?.artifacts || [];

  // runs ONLY when the selected chat changes
useEffect(() => {
  const chat = chats.find(c => c.id === currentChatId);
  if (chat) {
    setMessages(chat.messages);
    const full = AVAILABLE_MODELS.find(m => m.id === chat.modelConfig.id) || AVAILABLE_MODELS[2];
    setSelectedModel(full);
  } else if (currentChatId) {
    setMessages([]);
  }
  // safe to close ONLY when switching chats
  closeArtifact();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [currentChatId]);

// runs when the store updates; refreshes the open artifact without closing it
  useEffect(() => {
    const chat = chats.find(c => c.id === currentChatId);
    if (!chat) return;

    // keep messages in sync
    if (messages !== chat.messages) {
      setMessages(chat.messages);
    }

    // if an artifact pane is open, refresh its reference from the store
    if (currentArtifact) {
      const updated = chat.artifacts.find(a => a.id === currentArtifact.id);
      if (updated) {
        const maxIdx = Math.max(0, updated.versions.length - 1);
        setCurrentArtifact(updated);                  // new reference -> re-render
        setCurrentVersionIndex((i) => Math.min(i, maxIdx));
      }
    }
  }, [chats, currentChatId]); // IMPORTANT: no closeArtifact() here


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

  const handleSaveClick = async () => {
    if (!currentArtifact) return;
  
    const draft: Artifact = {
      ...currentArtifact,
      versions: [
        ...currentArtifact.versions,
        { content: editedContent, createdAt: Date.now() },
      ],
      updatedAt: Date.now(),
    };
  
    const persisted = await saveArtifactToCurrentChat(draft); // <- will return { artifact, versionNumber }
    if (persisted) {
      setCurrentArtifact(persisted.artifact);
      setCurrentVersionIndex(persisted.versionNumber - 1);
    }
  
    setIsEditing(false);
    setEditedContent("");
  };


  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedContent("");
  };

  // === This replaces your old <form onSubmit=...> logic ===
  const handleSend = async (messageContent: string) => {
    if (!messageContent.trim()) return;

    let chatId = currentChatId;
    if (!chatId) {
      chatId = await createNewChat(selectedModel);
    }

    const userMessage: Message = { id: crypto.randomUUID(), role: "user", content: messageContent.trim() };

    const conversationHistoryForAPI = messages
      .slice(-10)
      .map(({ role, content }) => ({ role: role === "ai" ? "assistant" : "user", content }));

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);

    const thinkingMessageId = crypto.randomUUID();
    setMessages((prev) => [...prev, { id: thinkingMessageId, role: "ai", content: "..." }]);

    // context: open artifact or latest one in chat
    const fallbackArtifact =
      currentArtifact ??
      (currentChatArtifacts.length > 0 ? currentChatArtifacts[currentChatArtifacts.length - 1] : null);

    const latestContent = fallbackArtifact
      ? fallbackArtifact.versions[fallbackArtifact.versions.length - 1]?.content
      : undefined;

    const requestBody = {
      message: userMessage.content,
      modelConfig: selectedModel,
      conversationHistory: conversationHistoryForAPI,
      documentContext: latestContent,
      currentArtifactId: fallbackArtifact?.id,
      currentArtifactTitle: fallbackArtifact?.title,
    };

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      if (!res.ok) throw new Error(await res.text());
      const { result } = await res.json();

      let aiMessage: Message = {
        id: thinkingMessageId,
        role: "ai",
        content: result.output || "No response",
      };

      if (result.artifact) {
        const artifact: Artifact = result.artifact;
      
        // saveArtifactToCurrentChat now returns { versionNumber, artifact }
        const saved = await saveArtifactToCurrentChat(artifact);
        const persistedArtifact = saved?.artifact ?? artifact;
        const versionNumber =
          saved?.versionNumber ?? (artifact.versions?.length ?? 1);
      
        // Open the exact version (0-based index for openArtifact)
        openArtifact(persistedArtifact, Math.max(0, versionNumber - 1));
      
        // Tag the chat bubble with the correct artifact + version
        aiMessage.artifactId = persistedArtifact.id;
        aiMessage.artifactVersion = versionNumber;
      
        // Keep chat content a STRING (never an object)
        aiMessage.content =
          result.output || "I've created/updated the document for you.";
      }
      

      const finalMessages = [...updatedMessages, aiMessage];
      setMessages(finalMessages);
      saveMessagesToCurrentChat(finalMessages);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An error occurred.";
      setMessages((prev) =>
        prev.map((msg) => (msg.id === thinkingMessageId ? { ...msg, content: errorMessage } : msg))
      );
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
        <div className={`${currentArtifact ? "w-1/2" : "w-full"} flex flex-col bg-background`}>
          {/* Header spacer */}
          <div className="flex items-center justify-end p-4 h-[69px]" />

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-6">
                <h1 className="text-2xl font-semibold text-foreground mb-3">How can I help you?</h1>
              </div>
            ) : (
              <div className="max-w-3xl mx-auto space-y-5">
                {messages.map((message) => {
                  const isUser = message.role === "user";
                  return (
                    <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-3 space-y-3 ${
                          isUser ? "bg-turquoise text-white" : "bg-secondary text-secondary-foreground"
                        }`}
                      >
                        {message.content === "..." ? (
                          <div className="flex items-center space-x-1">
                            <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" />
                            <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:0.1s]" />
                            <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce [animation-delay:0.2s]" />
                          </div>
                        ) : (
                          <MarkdownRenderer content={message.content} />
                        )}

                        {message.artifactId && (
                          <button
                            onClick={() => {
                              const artifact = currentChatArtifacts.find((a) => a.id === message.artifactId);
                              if (artifact) {
                                const versionIndex = (message.artifactVersion ?? 1) - 1;
                                openArtifact(artifact, versionIndex);
                              }
                            }}
                            className="w-full p-3 bg-muted rounded-lg text-left transition-colors group"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-foreground font-medium text-sm truncate">
                                {currentChatArtifacts.find((a) => a.id === message.artifactId)?.title || "Document"}
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

          {/* ChatGPT-style input bar */}
          <ChatInputBox onSend={handleSend} />
        </div>

        {currentArtifact && (
          <div className="w-1/2 border-l border-border flex flex-col bg-background">
            <div className="p-4 flex-shrink-0 border-b border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <FileText className="w-5 h-5 text-foreground flex-shrink-0" />
                  <h3 className="font-semibold text-lg text-foreground truncate">{currentArtifact.title}</h3>
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
                      <ExportMenu artifact={currentArtifact} onExport={() => {}} />
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