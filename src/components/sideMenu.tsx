"use client";
import { useState } from "react";
import { Brain, PanelLeftClose, PanelLeftOpen, MessageCircle, History, Settings } from "lucide-react";


export default function SideMenu() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      className={`flex flex-col justify-between h-screen bg-neutral-800 border-r border-neutral-700 text-white transition-all duration-300 p-4`}
    >
      <div className="flex items-center justify-between mb-8">
        <div className={`flex items-center gap-2 font-bold text-xl transition-all duration-300 ${collapsed ? "justify-center w-full" : ""}`}>
          <Brain className="w-6 h-6" />
          {!collapsed && <span>Kinga</span>}
        </div>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="ml-2 p-1 rounded hover:bg-gray-800 focus:outline-none"
        >
          {collapsed ? (
            <PanelLeftOpen className="w-6 h-6" />
          ) : (
            <PanelLeftClose className="w-6 h-6" />
          )}
        </button>
      </div>

      <div className="flex flex-col gap-4 flex-1">
        <button className="flex items-center gap-3 px-2 py-2 rounded hover:bg-gray-800 transition-colors">
          <MessageCircle className="w-6 h-6" />
          {!collapsed && <span>New Chat</span>}
        </button>
        <button className="flex items-center gap-3 px-2 py-2 rounded hover:bg-gray-800 transition-colors">
          <History className="w-6 h-6" />
          {!collapsed && <span>History</span>}
        </button>
      </div>

      <div className="mb-2">
        <button className="flex items-center gap-3 px-2 py-2 rounded hover:bg-gray-800 transition-colors w-full">
          <Settings className="w-6 h-6" />
          {!collapsed && <span>Settings</span>}
        </button>
      </div>
    </div>
  );
}