"use client";

import { Auth } from "./Auth";

export function LoginPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
      {/* The main card container */}
      <div className="w-full max-w-md p-8 space-y-6 bg-neutral-800 border border-neutral-700 rounded-xl shadow-lg">
        <div className="flex flex-col items-center gap-2">
          <img
            src="/logoLight.svg"
            alt="Kinga"
            width={40}
            height={40}
            className="w-10 h-10"
          />
          <h1 className="text-2xl font-bold">Welcome to Kinga</h1>
          <p className="text-neutral-400">Please sign in to continue</p>
        </div>
        <Auth />
      </div>
    </div>
  );
}