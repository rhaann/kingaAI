"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useTheme } from "next-themes";
import { Trash2, Menu, Plus, Sun, Moon, LineChart } from "lucide-react";
import { Chat } from "@/types/types";
import { Auth } from "./Auth";

// NEW: auth + firestore to read feature permission
import { auth, db } from "@/services/firebase";
import { doc, onSnapshot } from "firebase/firestore";

interface SideMenuProps {
  chats: Chat[];
  currentChatId: string | null;
  onNewChat: () => void;
  onSelectChat: (chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
}

// Helper: ensure string to avoid rendering objects
function asText(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

export default function SideMenu({
  chats,
  currentChatId,
  onNewChat,
  onSelectChat,
  onDeleteChat,
}: SideMenuProps) {
  const [collapsed, setCollapsed] = useState(false);
  const { theme, setTheme } = useTheme();

  // NEW: permission flag for Activity page
  const [canSeeActivity, setCanSeeActivity] = useState<boolean | null>(null);

  // mount flag for theme icon
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Subscribe to featurePermissions/activity for current user
  useEffect(() => {
    let unsubPerm: (() => void) | null = null;
    const unsubAuth = auth.onAuthStateChanged((u) => {
      if (unsubPerm) {
        unsubPerm();
        unsubPerm = null;
      }
      if (!u) {
        setCanSeeActivity(false);
        return;
      }
      const ref = doc(db, "users", u.uid, "featurePermissions", "activity");
      unsubPerm = onSnapshot(
        ref,
        (snap) => setCanSeeActivity(!!(snap.exists() && (snap.data() as any)?.enabled === true)),
        () => setCanSeeActivity(false)
      );
    });
    return () => {
      unsubAuth();
      if (unsubPerm) unsubPerm();
    };
  }, []);

  return (
    <aside
      className={`flex flex-col h-screen bg-background border-r border-border transition-all duration-300 ${
        collapsed ? "w-20" : "w-80"
      }`}
    >
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div
            className={`flex items-center gap-3 overflow-hidden transition-all duration-300 ${
              collapsed ? "w-0" : "w-full"
            }`}
          >
            <div className="w-8 h-8 flex-shrink-0">
              <Image
                src="/logoDark.svg"
                alt="Actual Insight Logo"
                width={32}
                height={32}
                className="block dark:hidden"
              />
              <Image
                src="/logoLight.svg"
                alt="Actual Insight Logo"
                width={32}
                height={32}
                className="hidden dark:block"
              />
            </div>
            <span className="text-foreground font-semibold text-lg whitespace-nowrap">
              actual insight
            </span>
          </div>

          <button
            onClick={() => setCollapsed((v) => !v)}
            className="text-foreground hover:bg-secondary p-2 rounded-md transition-colors"
            aria-label="Toggle sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* New chat */}
      <div className="p-4">
        <button
          onClick={onNewChat}
          className={`flex w-full items-center gap-3 px-4 py-2.5 rounded-full font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <Plus className="w-5 h-5 flex-shrink-0" strokeWidth={2.5} />
          {!collapsed && <span className="whitespace-nowrap">New Chat</span>}
        </button>


      </div>

      {/* Chats list */}
      <div className="flex-1 overflow-y-auto px-4">
        {!collapsed && (
          <div className="mb-3">
            <h3 className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
              CHAT HISTORY
            </h3>
          </div>
        )}

        <div className="space-y-1">
          {chats.map((chat) => {
            const isActive = currentChatId === chat.id;
            const title = asText(chat.title);

            return (
              <div
                key={chat.id}
                title={title}
                className={`group relative flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                  isActive
                    ? "bg-secondary text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
                onClick={() => onSelectChat(chat.id)}
              >
                <span className={`text-sm truncate flex-1 ${collapsed ? "opacity-0" : ""}`}>
                  {title || "Untitled"}
                </span>

                {!collapsed && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`Delete “${title || "this chat"}”?`)) {
                        onDeleteChat(chat.id);
                      }
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-destructive/20 hover:text-destructive rounded-md ml-2 flex-shrink-0"
                    aria-label="Delete chat"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer: auth + feature links */}
      <div className="p-4 border-t border-border flex-shrink-0">
        <Auth collapsed={collapsed} />

        {/* [ACTIVITY] show only if enabled for this user */}
        {canSeeActivity && (
          <Link
            href="/activity"
            className={`mt-2 w-full flex items-center gap-3 px-3 py-2 rounded-md
                        text-foreground hover:bg-secondary hover:text-foreground transition-colors
                        ${collapsed ? "justify-center" : ""}`}
            aria-label="Open Activity"
          >
            <LineChart className="w-5 h-5" />
            {!collapsed && <span>Activity</span>}
          </Link>
        )}

        {/* Theme toggle (kept as-is) */}
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className={`mt-2 w-full flex items-center gap-3 px-3 py-2 rounded-md text-foreground
                      hover:bg-secondary hover:text-foreground transition-colors
                      ${collapsed ? "justify-center" : ""}`}
          aria-label="Toggle theme"
        >
          {mounted && (theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />)}
          {!collapsed && <span className="sr-only">Toggle theme</span>}
        </button>
      </div>

    </aside>
  );
}
