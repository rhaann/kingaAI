"use client";

import SideMenu from "@/components/sideMenu";
import ModelSelector from "@/components/modelSelector";
import { ExportMenu, ExportFormat } from "@/components/exportMenu";
import { GoogleDriveConnection } from "@/components/googleDriveConnection";
import Textarea from "react-textarea-autosize";
import { Send, User, Bot, FileText, Copy, Edit3, History } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useChats } from "@/hooks/useChats";
import { Message, Artifact, ModelConfig } from "@/types/types";
import { AVAILABLE_MODELS } from "../config/modelConfig";
import { exportToPDF } from "@/services/pdfExport";

export function ChatApplication() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [currentArtifact, setCurrentArtifact] = useState<Artifact | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ModelConfig>(AVAILABLE_MODELS[2]);
  const [currentVersionIndex, setCurrentVersionIndex] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const {
    chats,
    currentChatId,
    createNewChat,
    deleteChat,
    updateCurrentChatModel,
    saveMessagesToCurrentChat,
    saveArtifactToCurrentChat,
    getCurrentChatModel,
    loadChat,
  } = useChats();

  const openArtifact = (artifact: Artifact) => {
    setCurrentArtifact(artifact);
    setCurrentVersionIndex(artifact.versions.length - 1);
  };

  const closeArtifact = () => {
    setCurrentArtifact(null);
  };

  useEffect(() => {
    if (currentChatId) {
      const currentModel = getCurrentChatModel();
      setSelectedModel(currentModel);
    } else {
      setMessages([]);
      closeArtifact();
      setArtifacts([]);
    }
  }, [currentChatId, getCurrentChatModel]);

  // --- THIS IS THE FUNCTION THAT WAS BROKEN ---
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };
  // --- END OF FIX ---

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
    const chat = loadChat(chatId);
    if (chat) {
      setMessages(chat.messages);
      closeArtifact();
      const fullModelConfig = AVAILABLE_MODELS.find(m => m.id === chat.modelConfig.id) || AVAILABLE_MODELS[2];
      setSelectedModel(fullModelConfig);
      setArtifacts(chat.artifacts || []);
    }
  };

  const handleModelChange = (model: ModelConfig) => {
    setSelectedModel(model);
    if (currentChatId) {
      updateCurrentChatModel(model);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const downloadDocument = (artifact: Artifact) => {
    const latestVersion = artifact.versions[currentVersionIndex];
    if (!latestVersion) return;
    const blob = new Blob([latestVersion.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${artifact.title.replace(/\s+/g, '_')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExport = (format: ExportFormat, artifact: Artifact) => {
    const latestVersion = artifact.versions[currentVersionIndex];
    if (!latestVersion) return;
    switch (format) {
      case 'google-drive': break;
      case 'pdf': exportToPDF({ title: artifact.title, content: latestVersion.content, fontSize: 10, margin: 25, preserveFormatting: false }); break;
      case 'word': alert('Word export coming soon!'); break;
      case 'markdown': exportAsMarkdown(artifact); break;
      case 'text': downloadDocument(artifact); break;
      case 'email': copyForEmail(artifact); break;
    }
  };

  const exportAsMarkdown = (artifact: Artifact) => {
    const latestVersion = artifact.versions[currentVersionIndex];
    if (!latestVersion) return;
    const markdownContent = `# ${artifact.title}\n\n${latestVersion.content}`;
    const blob = new Blob([markdownContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${artifact.title.replace(/\s+/g, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyForEmail = (artifact: Artifact) => {
    const latestVersion = artifact.versions[currentVersionIndex];
    if (!latestVersion) return;
    const emailContent = `Subject: ${artifact.title}\n\n${latestVersion.content}`;
    navigator.clipboard.writeText(emailContent);
  };

  const updateArtifactContent = (content: string) => {
    if (currentArtifact) {
      const newVersion = { content, createdAt: Date.now() };
      const updatedArtifact = {
        ...currentArtifact,
        versions: [...currentArtifact.versions.slice(0, currentVersionIndex + 1), newVersion],
        updatedAt: Date.now(),
      };
      setCurrentArtifact(updatedArtifact);
      setCurrentVersionIndex(updatedArtifact.versions.length - 1);
      saveArtifactToCurrentChat(updatedArtifact);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const messageContent = input.trim();
    if (!messageContent) return;

    let chatId = currentChatId;
    if (!chatId) {
      chatId = await createNewChat(selectedModel);
    }

    const userMessage: Message = { id: crypto.randomUUID(), role: "user", content: messageContent };
    
    const conversationHistoryForAPI = messages.slice(-10).map(({ role, content }) => ({ role: role === 'ai' ? 'assistant' : 'user', content }));
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput("");
    
    const thinkingMessageId = crypto.randomUUID();
    setMessages(prev => [...prev, { id: thinkingMessageId, role: "ai", content: "..." }]);

    try {
      const latestContent = currentArtifact ? currentArtifact.versions[currentVersionIndex].content : undefined;
      const requestBody = {
        message: userMessage.content,
        modelConfig: selectedModel,
        conversationHistory: conversationHistoryForAPI,
        documentContext: latestContent,
        currentArtifactId: currentArtifact?.id,
        currentArtifactTitle: currentArtifact?.title,
      };
      
      const res = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody) });
      if (!res.ok) throw new Error(await res.text());
      const { result } = await res.json();

      let aiMessage: Message = { id: thinkingMessageId, role: "ai", content: result.output || "No response" };
      
      if (result.artifact) {
        const artifact: Artifact = result.artifact;
        saveArtifactToCurrentChat(artifact);
        openArtifact(artifact);
        aiMessage.artifactId = artifact.id;
        aiMessage.content = result.output;
      }
      
      const finalMessages = [...updatedMessages, aiMessage];
      setMessages(finalMessages);
      saveMessagesToCurrentChat(finalMessages);

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "An error occurred.";
      setMessages(prev => prev.map(msg => msg.id === thinkingMessageId ? { ...msg, content: errorMessage } : msg));
    }
  };

  return (
    <div className="flex h-screen bg-gray-900">
      <SideMenu chats={chats} currentChatId={currentChatId} onNewChat={handleNewChat} onSelectChat={handleSelectChat} onDeleteChat={deleteChat} />
      <div className="flex-1 flex">
        <div className={`${currentArtifact ? 'w-1/2' : 'w-full'} flex flex-col bg-gray-900 transition-all duration-300`}>
          <div className="bg-gray-900 p-4">
            <div className="flex justify-center items-center gap-4">
              <ModelSelector selectedModel={selectedModel} onModelChange={handleModelChange} disabled={false} />
              <GoogleDriveConnection />
            </div>
          </div>
          <div ref={chatContainerRef} className="flex-1 overflow-y-auto">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-6"><h1 className="text-2xl font-semibold text-white mb-3">How can I help you today?</h1><p className="text-gray-400 text-lg">Ask anything</p></div>
            ) : (
              <div className="max-w-5xl mx-auto px-6 py-6">{messages.map((message) => (<div key={message.id} className={`flex gap-4 mb-6 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>{message.role === "ai" && <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0 mt-1"><Bot className="w-4 h-4 text-white" /></div>}<div className={`max-w-[85%] ${message.role === 'user' ? 'order-1' : ''}`}><div className={`p-4 rounded-2xl ${message.role === 'user' ? 'bg-blue-600 text-white ml-auto' : 'bg-gray-800 text-white border border-gray-700'}`}>{message.content === "..." ? <div className="flex items-center space-x-1"><div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div><div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div><div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div></div> : <div className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}{message.artifactId && <div className="mt-4 pt-3 border-t border-gray-600"><button onClick={() => { const artifact = artifacts.find(a => a.id === message.artifactId); if (artifact) openArtifact(artifact); }} className="w-full p-3 bg-gray-750 hover:bg-gray-700 border border-gray-600 rounded-lg text-left transition-colors group"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center"><FileText className="w-4 h-4 text-white" /></div><div><div className="text-white font-medium text-sm">{artifacts.find(a => a.id === message.artifactId)?.title || 'Document'}</div><div className="text-gray-400 text-xs">Click to view and edit</div></div></div><div className="text-gray-400 group-hover:text-gray-300 transition-colors"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></div></div></button></div>}</div>}</div></div>{message.role === "user" && <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center flex-shrink-0 mt-1 order-2"><User className="w-4 h-4 text-white" /></div>}</div>))}<div ref={messagesEndRef} /></div>
            )}
          </div>
          <div className="bg-gray-900 p-4"><div className="max-w-5xl mx-auto"><form onSubmit={handleSubmit}><div className="relative"><Textarea value={input} onChange={handleInputChange} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(e as any); } }} placeholder="Send a message..." className="w-full p-4 pr-14 bg-gray-800 border border-gray-600 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white placeholder:text-gray-400" minRows={1} maxRows={6} /><button type="submit" disabled={!input.trim()} className="absolute bottom-3 right-3 w-8 h-8 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg flex items-center justify-center transition-colors"><Send className="w-4 h-4" /></button></div></form></div></div>
        </div>
        {currentArtifact && (
          <div className="w-1/2 bg-white border-l border-gray-300 flex flex-col">
            <div className="border-b border-gray-200 p-4 bg-gray-50">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-gray-600" />
                  <h3 className="font-medium text-gray-900">{currentArtifact.title}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setIsEditing(!isEditing)} className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-1"><Edit3 className="w-3 h-3" />{isEditing ? 'Save' : 'Edit'}</button>
                  <button onClick={() => copyToClipboard(currentArtifact.versions[currentVersionIndex]?.content || '')} className="px-3 py-1.5 text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors flex items-center gap-1"><Copy className="w-3 h-3" />Copy</button>
                  <ExportMenu artifact={currentArtifact} onExport={handleExport} />
                  <button onClick={closeArtifact} className="px-3 py-1.5 text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors">Close</button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-gray-500" />
                <span className="text-xs font-medium text-gray-500">Versions:</span>
                <div className="flex items-center gap-1">
                  {currentArtifact.versions.map((version, index) => (
                    <button
                      key={version.createdAt}
                      onClick={() => setCurrentVersionIndex(index)}
                      className={`px-2.5 py-0.5 text-xs rounded-full transition-colors ${
                        index === currentVersionIndex
                          ? 'bg-blue-600 text-white font-semibold'
                          : 'bg-gray-200 hover:bg-gray-300 text-gray-600'
                      }`}
                    >
                      V{index + 1}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {isEditing ? (
                <textarea
                  value={currentArtifact.versions[currentVersionIndex]?.content || ''}
                  onChange={(e) => { /* Manual editing with versioning is complex, disable for now */ }}
                  className="w-full h-full p-4 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                  placeholder="Edit your document..."
                />
              ) : (
                <div className="prose prose-sm max-w-none">
                  <pre className="whitespace-pre-wrap text-gray-900 font-sans text-sm leading-relaxed">
                    {currentArtifact.versions[currentVersionIndex]?.content || ''}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}