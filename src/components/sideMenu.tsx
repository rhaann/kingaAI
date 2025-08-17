// src/components/sideMenu.tsx
"use client";
import { useState, useEffect } from "react";
import Image from "next/image";
import { useTheme } from "next-themes";
import { Settings, Trash2, Menu, Plus, Sun, Moon } from "lucide-react";
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
  const { theme, setTheme } = useTheme();
  
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <aside className={`flex flex-col h-screen bg-background border-r border-border transition-all duration-300 ${collapsed ? 'w-20' : 'w-80'}`}>
      <div className="flex-shrink-0 p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className={`flex items-center gap-3 overflow-hidden transition-all duration-300 ${collapsed ? 'w-0' : 'w-full'}`}>
            <div className="w-8 h-8 flex-shrink-0">
              <Image src="/logoDark.svg" alt="Actual Insight Logo" width={32} height={32} className="block dark:hidden" />
              <Image src="/logoLight.svg" alt="Actual Insight Logo" width={32} height={32} className="hidden dark:block" />
            </div>
            <span className="text-foreground font-semibold text-lg whitespace-nowrap">actual insight</span>
          </div>
          <button onClick={() => setCollapsed(!collapsed)} className="text-foreground hover:bg-secondary p-2 rounded-md transition-colors">
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="p-4">
        <button 
          onClick={onNewChat}
          className={`flex w-full items-center gap-3 px-4 py-2.5 rounded-full font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors ${collapsed ? 'justify-center' : ''}`}
        >
          <Plus className="w-5 h-5 flex-shrink-0" strokeWidth={2.5} />
          {!collapsed && <span className="whitespace-nowrap">New Chat</span>}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4">
        {!collapsed && (
          <div className="mb-3">
            <h3 className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">CHAT HISTORY</h3>
          </div>
        )}
        <div className="space-y-1">
          {chats.map((chat) => (
            <div
              key={chat.id}
              title={chat.title}
              className={`group relative flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                currentChatId === chat.id 
                  ? 'bg-secondary text-primary' 
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
              onClick={() => onSelectChat(chat.id)}
            >
              <span className={`text-sm truncate flex-1 ${collapsed ? 'opacity-0' : ''}`}>
                {chat.title}
              </span>
              
              {!collapsed && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`Are you sure you want to delete "${chat.title}"?`)) {
                      onDeleteChat(chat.id);
                    }
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-destructive/20 hover:text-destructive rounded-md ml-2 flex-shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="p-4 border-t border-border flex-shrink-0">
        <Auth collapsed={collapsed} />
        <button 
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className={`flex items-center gap-3 px-3 py-2 rounded-md text-foreground hover:bg-secondary hover:text-foreground transition-colors w-full mt-2 ${collapsed ? 'justify-center' : ''}`}
        >
          {mounted && (
            <>
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </>
          )}
          
        </button>
        
      </div>
    </aside>
  );
}