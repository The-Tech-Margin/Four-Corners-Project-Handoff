/**
 * /auth/reset-password?token=… — set a new password from a reset link.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAccess } from "@/components/access-provider";
import { FourCornersLogo } from "@/components/four-corners-logo";

function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const { resetPassword } = useAccess();

  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    if (password !== confirmation) {
      setError("Those passwords do not match.");
      return;
    }

    setSaving(true);
    const result = await resetPassword(token, password);
    setSaving(false);

    if (!result.ok) {
      setError(result.error ?? "Could not set that password.");
      return;
    }
    router.push("/");
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-6">
          <FourCornersLogo className="w-16 h-16" />
        </div>
        <h1 className="text-lg font-medium text-center mb-4">Set a new password</h1>

        {!token ? (
          <p className="text-sm text-center" style={{ color: "var(--fc-text-muted)" }}>
            This link is missing its token. Request a new reset link from the sign-in dialog.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="new-password">
                New password
              </label>
              <input
                id="new-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className="modal-input w-full px-3 py-2 border rounded"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="confirm-password">
                Confirm password
              </label>
              <input
                id="confirm-password"
                type="password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className="modal-input w-full px-3 py-2 border rounded"
              />
            </div>

            {error && (
              <p className="text-sm p-2 rounded bg-red-500/20 text-red-400">{error}</p>
            )}

            <button
              type="submit"
              disabled={saving}
              className="modal-button-primary w-full px-4 py-2 font-medium rounded disabled:opacity-50"
            >
              {saving ? "Saving…" : "Set password"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
