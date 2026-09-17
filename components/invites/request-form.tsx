"use client";

import { useState } from "react";
import Link from "next/link";

export function RequestAccessForm() {
  const [fullName, setFullName] = useState("");
  const [organization, setOrganization] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/invites/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          organization,
          email,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Unable to reach the server. Check your connection.");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="text-center space-y-4">
        <p style={{ color: "var(--fc-text-muted)" }}>
          Thank you, if approved, you should receive an email within the
          business day.
        </p>
        <Link
          href="/gallery"
          className="inline-block text-sm hover:underline"
          style={{ color: "var(--fc-accent)" }}
        >
          Explore the public gallery →
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p
        className="text-center text-sm mb-6"
        style={{ color: "var(--fc-text-muted)" }}
      >
        Four Corners is in private beta. Tell us your name, organization, and
        email. We&apos;ll review your request and follow up with you shortly.
      </p>

      <div>
        <label
          className="block text-sm font-medium mb-1"
          style={{ color: "var(--fc-text)" }}
        >
          Full name
        </label>
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          maxLength={120}
          autoComplete="name"
          className="modal-input w-full px-3 py-2 border rounded focus:outline-none focus:border-corner-backstory transition-colors"
        />
      </div>

      <div>
        <label
          className="block text-sm font-medium mb-1"
          style={{ color: "var(--fc-text)" }}
        >
          Organization or institution
          <span
            className="ml-1 text-xs"
            style={{ color: "var(--fc-text-muted)" }}
          >
            (optional)
          </span>
        </label>
        <input
          type="text"
          value={organization}
          onChange={(e) => setOrganization(e.target.value)}
          maxLength={160}
          autoComplete="organization"
          className="modal-input w-full px-3 py-2 border rounded focus:outline-none focus:border-corner-backstory transition-colors"
        />
      </div>

      <div>
        <label
          className="block text-sm font-medium mb-1"
          style={{ color: "var(--fc-text)" }}
        >
          Email
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          maxLength={254}
          autoComplete="email"
          className="modal-input w-full px-3 py-2 border rounded focus:outline-none focus:border-corner-backstory transition-colors"
        />
      </div>

      {error && (
        <div className="text-sm p-2 rounded bg-red-500/20 text-red-400">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="modal-button-primary w-full px-4 py-2 font-medium rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? "Sending..." : "Request access"}
      </button>

      <p
        className="text-xs text-center"
        style={{ color: "var(--fc-text-muted)" }}
      >
        Already have an account?{" "}
        <Link
          href="/gallery"
          className="hover:underline"
          style={{ color: "var(--fc-accent)" }}
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
