"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    // Check if we have a valid session from the email link
    const checkSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setError(
          "Invalid or expired reset link. Please request a new password reset."
        );
      }
    };
    checkSession();
  }, [supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password,
        data: { has_password: true },
      });

      if (error) throw error;

      setMessage("Password updated successfully! Redirecting to home...");
      setTimeout(() => {
        router.push("/");
      }, 2000);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to update password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="bg-surface rounded-xl sm:rounded-2xl w-full max-w-md border border-border overflow-hidden">
        <div className="px-4 sm:px-5 py-4 border-b border-border">
          <h1 className="text-lg font-medium text-gray-200">Reset Password</h1>
        </div>

        <div className="px-4 sm:px-5 py-4">
          <p className="text-gray-400 text-sm mb-4">
            Enter your new password below.
          </p>

          {error && (
            <div className="mb-4 text-sm p-2 rounded bg-red-500/20 text-red-400">
              {error}
            </div>
          )}

          {message && (
            <div className="mb-4 text-sm p-2 rounded bg-green-500/20 text-green-400">
              {message}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                New Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                disabled={!!error || !!message}
                className="w-full px-3 py-2 bg-surface-alt border border-border rounded text-gray-100 focus:outline-none focus:border-corner-backstory disabled:opacity-50"
                placeholder="Enter new password"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Confirm Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                disabled={!!error || !!message}
                className="w-full px-3 py-2 bg-surface-alt border border-border rounded text-gray-100 focus:outline-none focus:border-corner-backstory disabled:opacity-50"
                placeholder="Confirm new password"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !!error || !!message}
              className="w-full px-4 py-2 bg-corner-backstory text-gray-900 font-medium rounded hover:bg-corner-backstory/80 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Updating..." : "Update Password"}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              onClick={() => router.push("/")}
              className="text-sm text-corner-backstory hover:underline"
            >
              Back to Home
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
