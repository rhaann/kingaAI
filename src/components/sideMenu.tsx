"use client";
import { useState } from "react";
import { Brain, PanelLeftClose, PanelLeftOpen, MessageCircle, History, Settings, Trash2 } from "lucide-react";
import { Chat } from "@/types/types";
import { Auth } from "./Auth"; 

interface SideMenuProps {
  chats: Chat[];
  currentChatId: string | null;
  onNewChat: () => void;
  onSelectChat: (chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
}

export default function SideMenu({ 
  chats, 
  currentChatId, 
  onNewChat, 
  onSelectChat, 
  onDeleteChat 
}: SideMenuProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [showHistory, setShowHistory] = useState(true);

  const getDateGroup = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffInDays === 0) return 'Today';
    if (diffInDays === 1) return 'Yesterday';
    if (diffInDays < 7) return 'Previous 7 days';
    if (diffInDays < 30) return 'Previous 30 days';
    return 'Older';
  };

  const groupedChats = chats.reduce((groups: { [key: string]: Chat[] }, chat) => {
    const group = getDateGroup(chat.updatedAt);
    if (!groups[group]) {
      groups[group] = [];
    }
    groups[group].push(chat);
    return groups;
  }, {});

  const dateOrder = ['Today', 'Yesterday', 'Previous 7 days', 'Previous 30 days', 'Older'];

  return (
    <div
      className={`flex flex-col h-screen bg-neutral-800 border-r border-neutral-700 text-white transition-all duration-300 ${
        collapsed ? 'w-16' : 'w-80'
      }`}
    >
      {/* Header */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-6">
          <div className={`flex items-center gap-2 font-bold text-xl transition-all duration-300 ${collapsed ? "justify-center w-full" : ""}`}>
            <Brain className="w-6 h-6" />
            {!collapsed && <span>Kinga</span>}
          </div>
          {!collapsed && (
            <button
              onClick={() => setCollapsed(true)}
              className="p-1 rounded hover:bg-gray-700 focus:outline-none"
            >
              <PanelLeftClose className="w-5 h-5" />
            </button>
          )}
        </div>

        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            className="w-full p-2 rounded hover:bg-gray-700 focus:outline-none mb-4"
          >
            <PanelLeftOpen className="w-5 h-5 mx-auto" />
          </button>
        )}

        {/* New Chat Button */}
        <button 
          onClick={onNewChat}
          className={`flex items-center gap-3 px-3 py-2 rounded hover:bg-gray-700 transition-colors w-full ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          <MessageCircle className="w-5 h-5" />
          {!collapsed && <span>New Chat</span>}
        </button>
      </div>

      {/* Chat History */}
      {!collapsed && (
        <div className="flex-1 overflow-hidden flex flex-col">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-3 px-4 py-3 hover:bg-gray-700 transition-colors text-sm text-gray-300 border-b border-gray-700"
          >
            <History className="w-4 h-4" />
            <span>Chats</span>
            <span className="ml-auto text-xs">{showHistory ? '−' : '+'}</span>
          </button>

          {showHistory && (
            <div className="flex-1 overflow-y-auto">
              {chats.length === 0 ? (
                <div className="text-gray-400 text-sm text-center py-8">
                  No chats yet
                </div>
              ) : (
                <div>
                  {dateOrder.map(dateGroup => {
                    const groupChats = groupedChats[dateGroup];
                    if (!groupChats || groupChats.length === 0) return null;

                    return (
                      <div key={dateGroup} className="mb-4">
                        <div className="px-4 py-2 text-xs text-gray-400 font-medium uppercase tracking-wider">
                          {dateGroup}
                        </div>
                        <div className="space-y-1 px-2">
                          {groupChats.map((chat) => (
                            <div
                              key={chat.id}
                              className={`group relative px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                                currentChatId === chat.id 
                                  ? 'bg-gray-700' 
                                  : 'hover:bg-gray-800'
                              }`}
                              onClick={() => onSelectChat(chat.id)}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm text-white truncate">
                                    {chat.title}
                                  </div>
                                </div>
                                
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteChat(chat.id);
                                  }}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-gray-600 rounded ml-2"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* User Profile & Settings */}
      <div className="p-4 border-t border-neutral-700 space-y-2">
        <Auth /> {/* <-- 2. ADD THE AUTH COMPONENT HERE */}
        <button className={`flex items-center gap-3 px-3 py-2 rounded hover:bg-gray-700 transition-colors w-full ${
          collapsed ? 'justify-center' : ''
        }`}>
          <Settings className="w-5 h-5" />
          {!collapsed && <span>Settings</span>}
        </button>
      </div>
    </div>
  );
}