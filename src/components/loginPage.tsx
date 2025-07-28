"use client";

import { Auth } from "./Auth";
import { Brain } from "lucide-react";

export function LoginPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
      {/* The main card container */}
      <div className="w-full max-w-md p-8 space-y-6 bg-neutral-800 border border-neutral-700 rounded-xl shadow-lg">
        <div className="flex flex-col items-center gap-2">
          <Brain className="w-10 h-10 text-blue-500" />
          <h1 className="text-2xl font-bold">Welcome to Kinga</h1>
          <p className="text-neutral-400">Please sign in to continue</p>
        </div>
        <Auth />
      </div>
    </div>
  );
}