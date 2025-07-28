"use client";

import { useAuth } from "@/context/authContext";
import { LoginPage } from "@/components/loginPage";
import { ChatApplication } from "@/components/chatApplication";

// This is the main export for the page. It decides what to show.
export default function Home() {
  const { user, loading } = useAuth();

  // While Firebase is checking the auth state, show a loading screen
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-blue-500"></div>
      </div>
    );
  }

  // If loading is done and there's no user, show the login page
  if (!user) {
    return <LoginPage />;
  }

  // If loading is done and there IS a user, show the main app
  return <ChatApplication />;
}