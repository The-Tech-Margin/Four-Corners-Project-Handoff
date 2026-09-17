/**
 * Resend email transport — minimal REST wrapper.
 *
 * Fail-soft: a missing API key or a failed send logs to console and returns
 * `{ ok: false }` rather than throwing. Callers (invite creation, etc.) should
 * still succeed even if email delivery is degraded; admins can manually
 * resend from /admin/invites.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

export interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
  /** Optional plaintext fallback. Resend generates one automatically if omitted. */
  text?: string;
  /** Override the default reply-to. */
  replyTo?: string;
}

export interface SendEmailResult {
  ok: boolean;
  id?: string;
  error?: string;
}

const RESEND_API = "https://api.resend.com/emails";

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;

  // Dev / unconfigured: log instead of sending so local flows still work.
  if (!apiKey || !from) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[email] RESEND_API_KEY/RESEND_FROM_EMAIL missing in production — email not sent",
      );
      return { ok: false, error: "email transport not configured" };
    }
    console.log(
      `[email:dev] would send to=${args.to} subject="${args.subject}"\n` +
        `${args.html.slice(0, 200)}${args.html.length > 200 ? "..." : ""}`,
    );
    return { ok: true, id: "dev-noop" };
  }

  try {
    const res = await fetch(RESEND_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: [args.to],
        subject: args.subject,
        html: args.html,
        text: args.text,
        reply_to: args.replyTo,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[email] Resend ${res.status}:`, body);
      return { ok: false, error: `Resend returned ${res.status}` };
    }

    const data = (await res.json()) as { id?: string };
    return { ok: true, id: data.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Send failed";
    console.error("[email] Send failed:", msg);
    return { ok: false, error: msg };
  }
}
