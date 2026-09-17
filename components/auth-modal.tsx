"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Modal from "@/components/modal";
import { FourCornersLogo } from "@/components/four-corners-logo";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** When false, modal cannot be dismissed (used as auth gate) */
  dismissible?: boolean;
}

export function AuthModal({
  isOpen,
  onClose,
  onSuccess,
  dismissible = true,
}: AuthModalProps) {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"signin" | "reset">("signin");
  const [message, setMessage] = useState("");

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      if (!supabase) {
        setMessage("Supabase is not configured");
        return;
      }

      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password`,
        });

        if (error) throw error;
        setMessage("Check your email for password reset instructions!");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        // Close modal - user stays on the current page (editor)
        onSuccess();
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "";
      if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
        setMessage(
          "Unable to reach the server. Check your internet connection and try again.",
        );
      } else {
        setMessage(msg || "Authentication failed");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === "signin" ? "Sign In" : "Reset Password"}
      maxWidth="md"
      dismissible={dismissible}
      showHeader={false}
    >
      <div className="px-4 sm:px-5 py-4">
        {/* Four Corners Logo */}
        <div className="flex justify-center mb-6">
          <FourCornersLogo className="w-16 h-16" />
        </div>

        <p className="modal-text-muted text-sm mb-4 text-center">
          {mode === "reset"
            ? "Enter your email to receive password reset instructions."
            : "Sign in to save your projects to the cloud."}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="modal-text block text-sm font-medium mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="modal-input w-full px-3 py-2 border rounded focus:outline-none focus:border-corner-backstory transition-colors"
            />
          </div>

          {mode === "signin" && (
            <div>
              <label className="modal-text block text-sm font-medium mb-1">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="modal-input w-full px-3 py-2 border rounded focus:outline-none focus:border-corner-backstory transition-colors"
              />
            </div>
          )}

          {message && (
            <div
              className={`text-sm p-2 rounded ${
                message.includes("Check your email")
                  ? "bg-green-500/20 text-green-400"
                  : "bg-red-500/20 text-red-400"
              }`}
            >
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="modal-button-primary w-full px-4 py-2 font-medium rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading
              ? "Loading..."
              : mode === "signin"
                ? "Sign In"
                : "Send Reset Link"}
          </button>
        </form>

        <div className="mt-4 text-center space-y-2">
          {mode === "signin" ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setMode("reset");
                  setMessage("");
                }}
                className="modal-text-muted text-sm hover:text-corner-backstory transition-colors"
              >
                Forgot password?
              </button>
              <div>
                <Link
                  href="/join"
                  className="text-sm text-corner-backstory hover:underline transition-colors"
                >
                  Need an account? Request access
                </Link>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setMode("signin");
                setMessage("");
              }}
              className="text-sm text-corner-backstory hover:underline transition-colors"
            >
              Back to sign in
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
