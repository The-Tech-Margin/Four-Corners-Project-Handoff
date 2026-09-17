/**
 * Email templates — plain HTML strings with inline styles (email clients drop
 * <style> blocks and CSS variables inconsistently). Visual language matches
 * the in-app cyan/charcoal theme.
 *
 * @author TheTechMargin
 * @copyright 2025 TheTechMargin
 */

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function shell(args: {
  title: string;
  preview: string;
  body: string;
}): string {
  const { title, preview, body } = args;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark light">
  <meta name="supported-color-schemes" content="dark light">
  <title>${escape(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#1a1a1a;font-family:'Geist',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#f5f5f5;-webkit-font-smoothing:antialiased;">
  <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;font-size:1px;line-height:1px;">${escape(preview)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#1a1a1a;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">
          <tr>
            <td style="padding:0 0 24px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding-right:10px;vertical-align:middle;">
                    <div style="width:28px;height:28px;background-color:#09fff0;border-radius:4px;"></div>
                  </td>
                  <td style="vertical-align:middle;">
                    <span style="font-size:16px;font-weight:600;color:#f5f5f5;letter-spacing:-0.01em;">Four Corners</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#242424;border:1px solid #2d2d2d;border-radius:4px;padding:40px 32px;">
              ${body}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 8px 0 8px;text-align:center;">
              <p style="margin:0 0 8px 0;font-size:12px;line-height:1.5;color:#9a9a9a;">You're receiving this because you (or someone using your address) interacted with Four Corners.</p>
              <p style="margin:0;font-size:12px;line-height:1.5;color:#9a9a9a;">Four Corners — a digital implementation of Fred Ritchin's Four Corners Project<br>by <a href="https://www.thetechmargin.com" style="color:#9a9a9a;text-decoration:underline;">TheTechMargin</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

const H1_STYLE =
  "margin:0 0 16px 0;font-size:24px;font-weight:600;color:#f5f5f5;letter-spacing:-0.02em;line-height:1.3;";
const BODY_P_STYLE =
  "margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#d0d0d0;";
const MUTED_NOTE_STYLE =
  "margin:0 0 8px 0;font-size:13px;line-height:1.5;color:#9a9a9a;";
const DIVIDER_NOTE_STYLE =
  "margin:32px 0 0 0;font-size:13px;line-height:1.5;color:#9a9a9a;border-top:1px solid #2d2d2d;padding-top:24px;";

function ctaButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">
        <tr>
          <td style="border-radius:4px;background-color:#09fff0;">
            <a href="${escape(href)}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#0a0a0a;text-decoration:none;border-radius:4px;letter-spacing:-0.01em;">${escape(label)}</a>
          </td>
        </tr>
      </table>`;
}

export function inviteRequestReceivedEmail(args: {
  fullName: string;
}): { subject: string; html: string } {
  const subject = "We received your access request";
  const html = shell({
    title: subject,
    preview:
      "Thanks for asking to join Four Corners — we'll review your request shortly.",
    body: `
      <h1 style="${H1_STYLE}">We received your request</h1>
      <p style="${BODY_P_STYLE}">Hi ${escape(args.fullName)},</p>
      <p style="${BODY_P_STYLE}">Thanks for asking to join Four Corners. We've received your request and will review it shortly.</p>
      <p style="${BODY_P_STYLE}">If you're approved, you'll get a follow-up email with a link to finish setting up your account.</p>
      <p style="margin:24px 0 0 0;font-size:15px;line-height:1.6;color:#9a9a9a;">— The Four Corners team</p>
    `,
  });
  return { subject, html };
}

export function inviteApprovedEmail(args: {
  fullName: string;
  acceptUrl: string;
}): { subject: string; html: string } {
  const subject = "You're invited to Four Corners";
  const html = shell({
    title: subject,
    preview: "Your access has been approved — set up your account.",
    body: `
      <h1 style="${H1_STYLE}">You're invited</h1>
      <p style="${BODY_P_STYLE}">Hi ${escape(args.fullName)},</p>
      <p style="${BODY_P_STYLE}">Your access has been approved. Tap the button below to set a password and finish creating your account.</p>
      ${ctaButton(args.acceptUrl, "Set up my account")}
      <p style="${MUTED_NOTE_STYLE}">Or paste this URL into your browser:</p>
      <div style="font-family:'Geist Mono',ui-monospace,SFMono-Regular,Menlo,Monaco,monospace;font-size:12px;color:#09fff0;word-break:break-all;padding:12px 16px;background-color:#1a1a1a;border:1px solid #2d2d2d;border-radius:4px;">${escape(args.acceptUrl)}</div>
      <p style="${DIVIDER_NOTE_STYLE}">This link works once and expires in 7 days. If you didn't request access, you can safely ignore this email.</p>
    `,
  });
  return { subject, html };
}

export function inviteDeniedEmail(args: {
  fullName: string;
}): { subject: string; html: string } {
  const subject = "Your Four Corners access request";
  const html = shell({
    title: subject,
    preview: "An update on your Four Corners access request.",
    body: `
      <h1 style="${H1_STYLE}">Update on your request</h1>
      <p style="${BODY_P_STYLE}">Hi ${escape(args.fullName)},</p>
      <p style="${BODY_P_STYLE}">Thanks for your interest in Four Corners. After reviewing your request, we're not able to grant access at this time.</p>
      <p style="${BODY_P_STYLE}">If you think this was a mistake, feel free to reply to this email.</p>
      <p style="margin:24px 0 0 0;font-size:15px;line-height:1.6;color:#9a9a9a;">— The Four Corners team</p>
    `,
  });
  return { subject, html };
}

export function adminNewRequestEmail(args: {
  fullName: string;
  email: string;
  organization: string | null;
  adminUrl: string;
}): { subject: string; html: string } {
  const subject = `New access request: ${args.fullName}`;
  const html = shell({
    title: subject,
    preview: `${args.fullName} requested access to Four Corners.`,
    body: `
      <h1 style="${H1_STYLE}">New access request</h1>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;font-size:14px;line-height:1.6;">
        <tr><td style="padding:4px 16px 4px 0;color:#9a9a9a;">Name</td><td style="padding:4px 0;color:#f5f5f5;">${escape(args.fullName)}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#9a9a9a;">Email</td><td style="padding:4px 0;color:#f5f5f5;">${escape(args.email)}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#9a9a9a;">Organization</td><td style="padding:4px 0;color:#f5f5f5;">${escape(args.organization ?? "—")}</td></tr>
      </table>
      ${ctaButton(args.adminUrl, "Review in admin")}
    `,
  });
  return { subject, html };
}
