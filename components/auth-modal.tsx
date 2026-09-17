/**
 * Sign in, create an account, or ask for a password reset.
 *
 * The account tab only appears when the deployment accepts sign-ups.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

"use client";

import { useState } from "react";
import Modal from "@/components/modal";
import { FourCornersLogo } from "@/components/four-corners-logo";
import { useAccess } from "@/components/access-provider";
import { useCapabilities } from "@/components/capabilities-provider";

type Mode = "signin" | "signup" | "reset";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** When false, modal cannot be dismissed (used as auth gate) */
  dismissible?: boolean;
}

const TITLES: Record<Mode, string> = {
  signin: "Sign In",
  signup: "Create Account",
  reset: "Reset Password",
};

const BLURBS: Record<Mode, string> = {
  signin: "Sign in to save your projects.",
  signup: "Create an account to start documenting your photographs.",
  reset: "Enter your email to receive a password reset link.",
};

export function AuthModal({
  isOpen,
  onClose,
  onSuccess,
  dismissible = true,
}: AuthModalProps) {
  const access = useAccess();
  const capabilities = useCapabilities();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>("signin");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  if (!isOpen) return null;

  const switchTo = (next: Mode) => {
    setMode(next);
    setMessage("");
    setSent(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      if (mode === "reset") {
        const result = await access.requestPasswordReset(email);
        if (!result.ok) {
          setMessage(result.error ?? "Could not send the reset link");
          return;
        }
        setSent(true);
        setMessage(
          capabilities.emailDelivery
            ? "Check your email for a password reset link."
            : "Reset link sent. This deployment logs it to the server console.",
        );
        return;
      }

      const result =
        mode === "signup"
          ? await access.signUp(email, password)
          : await access.signIn(email, password);

      if (!result.ok) {
        setMessage(result.error ?? "Authentication failed");
        return;
      }

      onSuccess();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={TITLES[mode]}
      maxWidth="md"
      dismissible={dismissible}
      showHeader={false}
    >
      <div className="px-4 sm:px-5 py-4">
        <div className="flex justify-center mb-6">
          <FourCornersLogo className="w-16 h-16" />
        </div>

        <p className="modal-text-muted text-sm mb-4 text-center">{BLURBS[mode]}</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="modal-text block text-sm font-medium mb-1" htmlFor="auth-email">
              Email
            </label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="modal-input w-full px-3 py-2 border rounded focus:outline-none focus:border-corner-backstory transition-colors"
            />
          </div>

          {mode !== "reset" && (
            <div>
              <label
                className="modal-text block text-sm font-medium mb-1"
                htmlFor="auth-password"
              >
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                className="modal-input w-full px-3 py-2 border rounded focus:outline-none focus:border-corner-backstory transition-colors"
              />
              {mode === "signup" && (
                <p className="modal-text-muted text-xs mt-1">At least 8 characters.</p>
              )}
            </div>
          )}

          {message && (
            <div
              className={`text-sm p-2 rounded ${
                sent ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
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
            {loading ? "Loading..." : TITLES[mode]}
          </button>
        </form>

        <div className="mt-4 text-center space-y-2">
          {mode === "signin" && (
            <>
              <button
                type="button"
                onClick={() => switchTo("reset")}
                className="modal-text-muted text-sm hover:text-corner-backstory transition-colors"
              >
                Forgot password?
              </button>
              {capabilities.auth.signUp && (
                <div>
                  <button
                    type="button"
                    onClick={() => switchTo("signup")}
                    className="text-sm text-corner-backstory hover:underline transition-colors"
                  >
                    Need an account? Create one
                  </button>
                </div>
              )}
            </>
          )}

          {mode !== "signin" && (
            <button
              type="button"
              onClick={() => switchTo("signin")}
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
