"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { FourCornersLogo } from "@/components/four-corners-logo";
import { createClient } from "@/lib/supabase/client";

interface InviteSummary {
  email: string;
  full_name: string;
  organization: string | null;
}

function AcceptInviteInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const supabase = createClient();

  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [invite, setInvite] = useState<InviteSummary | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMsg("Missing invite token.");
      return;
    }
    fetch(`/api/invites/lookup?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          setStatus("error");
          setErrorMsg(data.error ?? "Invite is not valid.");
          return;
        }
        setInvite(data as InviteSummary);
        setStatus("ready");
      })
      .catch(() => {
        setStatus("error");
        setErrorMsg("Unable to load invite.");
      });
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (password.length < 8) {
      setFormError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setFormError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(data.error ?? "Failed to set up your account.");
        return;
      }
      if (!supabase) {
        setFormError("Auth client unavailable. Try signing in manually.");
        return;
      }
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: data.email,
        password,
      });
      if (signInErr) {
        setFormError(
          "Account created, but auto sign-in failed. Try the sign-in page.",
        );
        return;
      }
      router.push("/");
    } catch {
      setFormError("Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "loading") {
    return (
      <Shell>
        <p
          className="text-center text-sm"
          style={{ color: "var(--fc-text-muted)" }}
        >
          Loading invite…
        </p>
      </Shell>
    );
  }

  if (status === "error") {
    return (
      <Shell>
        <h1
          className="text-center text-lg font-medium mb-2"
          style={{ color: "var(--fc-text)" }}
        >
          Invite unavailable
        </h1>
        <p
          className="text-center text-sm mb-6"
          style={{ color: "var(--fc-text-muted)" }}
        >
          {errorMsg}
        </p>
        <Link
          href="/join"
          className="block text-center text-sm hover:underline"
          style={{ color: "var(--fc-accent)" }}
        >
          Request access →
        </Link>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1
        className="text-center text-xl font-medium mb-1"
        style={{ color: "var(--fc-text)" }}
      >
        Welcome, {invite?.full_name.split(" ")[0]}
      </h1>
      <p
        className="text-center text-sm mb-6"
        style={{ color: "var(--fc-text-muted)" }}
      >
        Set a password to finish creating your account.
      </p>

      <dl
        className="mb-5 text-sm rounded-md p-3 space-y-1"
        style={{
          background: "var(--fc-wash)",
          border: "1px solid var(--fc-border)",
        }}
      >
        <Row label="Email" value={invite?.email ?? ""} />
        <Row label="Name" value={invite?.full_name ?? ""} />
        {invite?.organization && (
          <Row label="Organization" value={invite.organization} />
        )}
      </dl>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            className="block text-sm font-medium mb-1"
            style={{ color: "var(--fc-text)" }}
          >
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className="modal-input w-full px-3 py-2 border rounded focus:outline-none focus:border-corner-backstory transition-colors"
          />
        </div>
        <div>
          <label
            className="block text-sm font-medium mb-1"
            style={{ color: "var(--fc-text)" }}
          >
            Confirm password
          </label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className="modal-input w-full px-3 py-2 border rounded focus:outline-none focus:border-corner-backstory transition-colors"
          />
        </div>

        {formError && (
          <div className="text-sm p-2 rounded bg-red-500/20 text-red-400">
            {formError}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="modal-button-primary w-full px-4 py-2 font-medium rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? "Setting up..." : "Create my account"}
        </button>
      </form>
    </Shell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <dt
        className="w-24 text-xs uppercase tracking-wider"
        style={{ color: "var(--fc-text-muted)" }}
      >
        {label}
      </dt>
      <dd style={{ color: "var(--fc-text)" }}>{value}</dd>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "var(--fc-bg)" }}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden"
        style={{
          background: "var(--fc-surface)",
          border: "1px solid var(--fc-border)",
        }}
      >
        <div className="px-6 py-8">
          <div className="flex justify-center mb-6">
            <FourCornersLogo className="w-16 h-16" />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={null}>
      <AcceptInviteInner />
    </Suspense>
  );
}
