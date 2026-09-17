/**
 * Admin password gate.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

"use client";

import { useState } from "react";

export function AdminLogin({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        onSuccess();
      } else {
        const data = await res.json();
        setError(data.error || "Invalid password");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ background: "var(--fc-bg)", color: "var(--fc-text)" }}>
      <form onSubmit={handleSubmit} className="w-full max-w-sm p-6 rounded-lg"
        style={{ background: "var(--fc-surface)", border: "1px solid var(--fc-border)" }}>
        <h1 className="text-xl font-semibold mb-4">Admin Login</h1>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          className="w-full px-3 py-2 rounded mb-3 outline-none"
          style={{
            background: "var(--fc-bg)",
            color: "var(--fc-text)",
            border: "1px solid var(--fc-border)",
          }}
        />
        {error && (
          <p className="text-sm mb-3" style={{ color: "var(--fc-danger)" }}>
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading || !password}
          className="w-full py-2 rounded font-medium transition-colors disabled:opacity-50"
          style={{
            background: "var(--fc-accent)",
            color: "var(--fc-accent-on)",
          }}
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>
    </div>
  );
}
