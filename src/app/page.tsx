"use client";

import SideMenu from "@/components/sideMenu";
import Textarea from "react-textarea-autosize";
import { Send, User } from "lucide-react";
import { useState, useRef, useEffect } from "react";

type Message = {
  id: string;
  role: "user" | "ai";
  content: string;
};

export default function Home() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const messagesEndRef = useRef<HTMLDivElement>(null); 
  const chatContainerRef = useRef<HTMLDivElement>(null); 

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
      if (scrollHeight > clientHeight) { 
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]); 

  const sendMessageClient = async (message: string, currentSessionId?: string) => {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, sessionId: currentSessionId }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("Error fetching from /api/chat:", res.status, errorText);
      throw new Error(`API request failed: ${res.status} - ${errorText}`);
    }

    try {
      const data = await res.json();
      if (data && data.result && typeof data.result.output !== 'undefined') {
        return data.result.output;
      } else {
        console.error("Unexpected response structure from /api/chat:", data);
        throw new Error("AI response format is unexpected.");
      }
    } catch (jsonError) {
      console.error("Failed to parse JSON response from /api/chat:", jsonError);
      const rawResponse = await res.text(); 
      console.error("Raw response text:", rawResponse);
      throw new Error("Failed to parse server response. The response was not valid JSON.");
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessageContent = input;
    const userMessage: Message = {
      id: crypto.randomUUID(), 
      role: "user",
      content: userMessageContent,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");

    let currentSessionId = sessionId;
    if (!currentSessionId) {
      currentSessionId = crypto.randomUUID();
      setSessionId(currentSessionId);
    }

    const thinkingMessageId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: thinkingMessageId, role: "ai", content: "..." }, 
    ]);

    try {
      const aiResponseContent = await sendMessageClient(userMessageContent, currentSessionId);
      const contentToDisplay = typeof aiResponseContent === 'string'
        ? aiResponseContent
        : "Error: Received an unexpected response type from the AI.";

      setMessages((prev) =>
        prev.map(msg =>
          msg.id === thinkingMessageId
            ? { ...msg, content: contentToDisplay }
            : msg
        ).filter(msg => !(msg.id === thinkingMessageId && contentToDisplay.startsWith("Error:"))) 
      );
      if (!messages.find(msg => msg.id === thinkingMessageId && msg.content !== "...")) {
         setMessages((prev) => prev.filter(msg => msg.id !== thinkingMessageId)); 
         setMessages((prev) => [
           ...prev,
           { id: crypto.randomUUID(), role: "ai", content: contentToDisplay },
         ]);
      }


    } catch (err) {
      let errorMessage = "Oops! Something went wrong with the server.";
      if (err instanceof Error) {
        errorMessage = err.message;
      }
      setMessages((prev) =>
        prev.map(msg =>
          msg.id === thinkingMessageId
            ? { ...msg, content: errorMessage }
            : msg
        )
      );
      if (!messages.find(msg => msg.id === thinkingMessageId && msg.content !== "...")) {
         setMessages((prev) => prev.filter(msg => msg.id !== thinkingMessageId)); 
         setMessages((prev) => [
           ...prev,
           {
             role: "ai",
             content: errorMessage,
             id: crypto.randomUUID(),
           },
         ]);
      }
    }
  };

  return (
    <div className="flex h-screen bg-neutral-800"> 
      <SideMenu />
      <div className="flex-1 flex flex-col overflow-hidden"> 

        <div
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 custom-scrollbar" 
        >
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <h1 className="text-3xl font-bold text-white mb-4">What's on the agenda today?</h1>
              <p className="text-lg text-gray-300">Ask anything</p>
            </div>
          ) : (
            <div className="w-full max-w-3xl mx-auto space-y-5"> 
              {messages.map((message) => (
                <div key={message.id} className="w-full">
                  {message.role === "user" ? (
                    <div className="flex gap-x-2 justify-end"> 
                      <p className="text-white text-sm bg-blue-600 p-3 rounded-lg whitespace-pre-wrap max-w-[80%]">
                        {message.content}
                      </p>
                       <div className="w-10 h-10 bg-neutral-400 rounded-full flex items-center justify-center flex-shrink-0"> 
                        <User className="w-5 h-5 text-white" />
                      </div>
                    </div>
                  ) : (
                     <div className="flex gap-x-2"> 
                       {/* <div className="w-10 h-10 bg-neutral-700 border border-neutral-500 rounded-full flex items-center justify-center flex-shrink-0">
                        <Brain className="w-5 h-5 text-teal-400" />
                      </div> */}
                      <div className="text-white text-sm bg-neutral-800  p-3 rounded-lg whitespace-pre-wrap max-w-[80%]">
                      {/* <div className="text-white text-sm bg-neutral-700 border border-neutral-600 p-3 rounded-lg whitespace-pre-wrap max-w-[80%]"> */}
                        {message.content === "..." ? (
                          <div className="flex items-center space-x-1">
                            <span className="animate-pulse">.</span>
                            <span className="animate-pulse [animation-delay:0.2s]">.</span>
                            <span className="animate-pulse [animation-delay:0.4s]">.</span>
                          </div>
                        ) : (
                          message.content
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} className="h-0" />
            </div>
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="w-full max-w-3xl mx-auto p-3 md:p-4 backdrop-blur-sm flex items-center gap-2"
        >
          <Textarea
            tabIndex={0}
            value={input}
            required
            autoFocus
            spellCheck={false}
            onChange={handleInputChange}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e as any); 
              }
            }}
            placeholder="Ask anything..."
            className="w-full focus:outline-none placeholder:text-gray-400 text-sm text-white p-3 pr-16 rounded-md bg-neutral-600 resize-none"
            minRows={1}
            maxRows={5}
          />
          <button
            type="submit"
            disabled={!input.trim()} 
            className="bg-blue-900 hover:bg-blue-800 disabled:bg-neutral-500 text-white p-3 rounded-xl flex items-center justify-center"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}