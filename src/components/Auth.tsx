// src/components/Auth.tsx
"use client";

import { useState } from "react";
import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  AuthError,
} from "firebase/auth";
import { auth } from "@/services/firebase";
import { useAuth } from "@/context/authContext";
import { LogOut, Mail, KeyRound } from "lucide-react";
import Image from "next/image";
import { FaGoogle } from "react-icons/fa";

// Helper function to create user-friendly error messages
const getAuthErrorMessage = (errorCode: string): string => {
  switch (errorCode) {
    case "auth/email-already-in-use":
      return "This email address is already in use.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/weak-password":
      return "Password should be at least 6 characters.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential": // New error code for invalid credentials
      return "Invalid email or password.";
    default:
      console.error("Unhandled Auth Error:", errorCode); // Log unhandled errors
      return "An unexpected error occurred. Please try again.";
  }
};

export function Auth() {
  const { user, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- Handlers with full implementation ---

  const handleGoogleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Error signing in with Google", error);
      setError("Failed to sign in with Google.");
    }
  };

  const handleEmailSignUp = async () => {
    if (!email || !password) {
      setError("Please enter both email and password.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      // AuthContext will handle the redirect upon successful creation
    } catch (err) {
      const authError = err as AuthError;
      setError(getAuthErrorMessage(authError.code));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEmailSignIn = async () => {
    if (!email || !password) {
      setError("Please enter both email and password.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // AuthContext will handle the redirect upon successful sign-in
    } catch (err) {
      const authError = err as AuthError;
      setError(getAuthErrorMessage(authError.code));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error signing out", error);
    }
  };

  // --- Render Logic ---

  if (loading) {
    return (
      <div className="flex items-center justify-center p-2">
        <div className="w-8 h-8 border-2 border-dashed rounded-full animate-spin border-gray-500"></div>
      </div>
    );
  }

  if (user) {
    return (
      <div className="flex items-center justify-between p-2 hover:bg-gray-700 rounded-lg">
        <div className="flex items-center gap-3">
          {user.photoURL ? (
            <Image src={user.photoURL} alt={user.displayName || "User"} width={32} height={32} className="rounded-full" />
          ) : (
            <div className="w-8 h-8 bg-gray-600 rounded-full flex items-center justify-center text-white font-bold">
              {user.email?.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="text-sm font-medium text-white truncate">{user.displayName || user.email}</span>
        </div>
        <button onClick={handleSignOut} title="Sign Out" className="p-2 text-gray-400 hover:text-white hover:bg-gray-600 rounded-md transition-colors">
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      <div className="space-y-3">
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="w-full pl-10 pr-3 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="relative">
          <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className="w-full pl-10 pr-3 py-2 bg-neutral-700 border border-neutral-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      {error && <p className="text-red-400 text-sm text-center">{error}</p>}

      <div className="flex gap-3">
        <button onClick={handleEmailSignIn} disabled={isSubmitting} className="w-full flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:bg-blue-800 font-semibold">
          {isSubmitting ? "Signing In..." : "Sign In"}
        </button>
        <button onClick={handleEmailSignUp} disabled={isSubmitting} className="w-full flex-1 py-2 px-4 bg-transparent border border-neutral-500 text-neutral-300 hover:bg-neutral-700 rounded-md transition-colors disabled:bg-transparent font-semibold">
          {isSubmitting ? "Signing Up..." : "Sign Up"}
        </button>
      </div>

      <div className="flex items-center">
        <div className="flex-grow border-t border-neutral-600"></div>
        <span className="flex-shrink mx-4 text-neutral-400 text-sm">OR</span>
        <div className="flex-grow border-t border-neutral-600"></div>
      </div>

      <button onClick={handleGoogleSignIn} className="w-full flex items-center justify-center gap-3 p-3 text-sm font-medium text-white bg-transparent border border-neutral-600 hover:bg-neutral-700 rounded-lg transition-colors">
        <FaGoogle className="w-4 h-4" />
        <span>Sign in with Google</span>
      </button>
    </div>
  );
}