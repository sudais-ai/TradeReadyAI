/**
 * HTML + plain-text email templates for authentication flows.
 *
 * Kept dependency-free so they render in every email client and so a
 * broken design system can never silently break a transactional email.
 */

export interface PasswordResetEmail {
  html: string;
  text: string;
  subject: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildPasswordResetEmail(args: {
  resetUrl: string;
  expiresInMinutes?: number;
  recipientName?: string | null;
}): PasswordResetEmail {
  const expiresInMinutes = args.expiresInMinutes ?? 60;
  const safeUrl = escapeHtml(args.resetUrl);
  const greeting = args.recipientName
    ? `Hi ${escapeHtml(args.recipientName)},`
    : "Hello,";

  const subject = "Reset your TradeReady AI password";

  const text = [
    greeting,
    "",
    "We received a request to reset the password for your TradeReady AI account.",
    "",
    "Open the link below to choose a new password:",
    args.resetUrl,
    "",
    `This link expires in ${expiresInMinutes} minutes and can only be used once.`,
    "",
    "If you didn't request a password reset, you can safely ignore this email — your password will remain unchanged.",
    "",
    "— TradeReady AI",
  ].join("\n");

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${subject}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.08);">
            <tr>
              <td style="background:linear-gradient(135deg,#5b6fd1 0%,#7c8de8 100%);padding:28px 32px;">
                <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.01em;">TradeReady AI</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 16px 0;font-size:15px;line-height:1.5;color:#334155;">${greeting}</p>
                <p style="margin:0 0 16px 0;font-size:15px;line-height:1.5;color:#334155;">
                  We received a request to reset the password for your TradeReady AI account.
                </p>
                <p style="margin:0 0 24px 0;font-size:15px;line-height:1.5;color:#334155;">
                  Click the button below to choose a new password:
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">
                  <tr>
                    <td align="center" bgcolor="#5b6fd1" style="border-radius:8px;">
                      <a href="${safeUrl}" target="_blank" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;background-color:#5b6fd1;">
                        Reset your password
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 8px 0;font-size:13px;line-height:1.5;color:#64748b;">
                  Or copy and paste this link into your browser:
                </p>
                <p style="margin:0 0 24px 0;font-size:13px;line-height:1.5;color:#5b6fd1;word-break:break-all;">
                  <a href="${safeUrl}" style="color:#5b6fd1;text-decoration:underline;">${safeUrl}</a>
                </p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;border-left:3px solid #cbd5e1;border-radius:4px;margin:0 0 24px 0;">
                  <tr>
                    <td style="padding:12px 16px;">
                      <p style="margin:0;font-size:13px;line-height:1.5;color:#475569;">
                        <strong>Security notice:</strong> This link expires in ${expiresInMinutes} minutes and can only be used once. If you didn't request a password reset, you can safely ignore this email — your password will remain unchanged.
                      </p>
                    </td>
                  </tr>
                </table>
                <p style="margin:0;font-size:13px;line-height:1.5;color:#94a3b8;">
                  — TradeReady AI
                </p>
              </td>
            </tr>
            <tr>
              <td style="background-color:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;">
                <p style="margin:0;font-size:11px;line-height:1.5;color:#94a3b8;text-align:center;">
                  This is a transactional email related to your TradeReady AI account.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
}

/**
 * Phase 12: "your password was changed" notification.
 *
 * Sent AFTER a successful password change (either via the
 * /api/account/change-password flow or the /api/auth/reset-password
 * flow). The change has already happened by the time this fires, so
 * this is purely a security-notice email — the user can be told "if
 * this wasn't you, secure your account." There is no link that can
 * be used to undo the change; we link to /account where they can
 * review the change details and re-set the password.
 */
export function buildPasswordChangedEmail(args: {
  recipientName?: string | null;
  changedAt: Date;
  ip?: string | null;
  isReset?: boolean;
}): PasswordResetEmail {
  const greeting = args.recipientName
    ? `Hi ${escapeHtml(args.recipientName)},`
    : "Hello,";
  const subject = "Your TradeReady AI password was changed";

  // Format the timestamp in a way that doesn't depend on the runtime
  // locale. We use ISO and trim the milliseconds.
  const whenIso = args.changedAt.toISOString().replace(/\.\d{3}Z$/, "Z");
  const whenHuman = args.changedAt.toUTCString();

  const ipLine = args.ip
    ? `Requested from IP: ${escapeHtml(args.ip)}\n`
    : "";

  const action = args.isReset
    ? "Your password was reset using a one-time link."
    : "Your password was changed.";

  const text = [
    greeting,
    "",
    action,
    "",
    `When: ${whenHuman} (${whenIso})`,
    ipLine,
    "If this was you, no action is needed.",
    "",
    "If you didn't make this change, sign in immediately and reset your password. You can review your account activity at /account.",
    "",
    "— TradeReady AI",
  ]
    .filter((l) => l !== ipLine || args.ip)
    .join("\n");

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${subject}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.08);">
            <tr>
              <td style="background:linear-gradient(135deg,#5b6fd1 0%,#7c8de8 100%);padding:28px 32px;">
                <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.01em;">TradeReady AI</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 16px 0;font-size:15px;line-height:1.5;color:#334155;">${greeting}</p>
                <p style="margin:0 0 16px 0;font-size:15px;line-height:1.5;color:#334155;">${escapeHtml(action)}</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;border-left:3px solid #cbd5e1;border-radius:4px;margin:0 0 24px 0;">
                  <tr>
                    <td style="padding:12px 16px;">
                      <p style="margin:0 0 4px 0;font-size:13px;line-height:1.5;color:#475569;"><strong>When:</strong> ${escapeHtml(whenHuman)}</p>
                      ${args.ip ? `<p style="margin:0;font-size:13px;line-height:1.5;color:#475569;"><strong>From IP:</strong> ${escapeHtml(args.ip)}</p>` : ""}
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 8px 0;font-size:15px;line-height:1.5;color:#334155;">If this was you, no action is needed.</p>
                <p style="margin:0 0 24px 0;font-size:15px;line-height:1.5;color:#334155;">If you didn't make this change, sign in immediately and reset your password. You can review your account activity from your account page:</p>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">
                  <tr>
                    <td align="center" bgcolor="#5b6fd1" style="border-radius:8px;">
                      <a href="/account" target="_blank" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;background-color:#5b6fd1;">
                        Open account settings
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0;font-size:13px;line-height:1.5;color:#94a3b8;">— TradeReady AI</p>
              </td>
            </tr>
            <tr>
              <td style="background-color:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;">
                <p style="margin:0;font-size:11px;line-height:1.5;color:#94a3b8;text-align:center;">
                  This is a transactional email related to your TradeReady AI account.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
}

export function buildVerificationEmail(args: {
  verifyUrl: string;
  expiresInHours?: number;
  recipientName?: string | null;
}): PasswordResetEmail {
  const expiresInHours = args.expiresInHours ?? 24;
  const safeUrl = escapeHtml(args.verifyUrl);
  const greeting = args.recipientName
    ? `Hi ${escapeHtml(args.recipientName)},`
    : "Hello,";

  const subject = "Verify your TradeReady AI email";

  const text = [
    greeting,
    "",
    "Welcome to TradeReady AI! Please confirm your email address by opening the link below:",
    args.verifyUrl,
    "",
    `This link expires in ${expiresInHours} hours and can only be used once.`,
    "",
    "If you didn't create a TradeReady AI account, you can safely ignore this email.",
    "",
    "— TradeReady AI",
  ].join("\n");

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${subject}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.08);">
            <tr>
              <td style="background:linear-gradient(135deg,#5b6fd1 0%,#7c8de8 100%);padding:28px 32px;">
                <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.01em;">TradeReady AI</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 16px 0;font-size:15px;line-height:1.5;color:#334155;">${greeting}</p>
                <p style="margin:0 0 16px 0;font-size:15px;line-height:1.5;color:#334155;">
                  Welcome to TradeReady AI. Please confirm your email address to finish setting up your account.
                </p>
                <p style="margin:0 0 24px 0;font-size:15px;line-height:1.5;color:#334155;">
                  Click the button below to verify your email:
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px 0;">
                  <tr>
                    <td align="center" bgcolor="#5b6fd1" style="border-radius:8px;">
                      <a href="${safeUrl}" target="_blank" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;background-color:#5b6fd1;">
                        Verify your email
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 8px 0;font-size:13px;line-height:1.5;color:#64748b;">
                  Or copy and paste this link into your browser:
                </p>
                <p style="margin:0 0 24px 0;font-size:13px;line-height:1.5;color:#5b6fd1;word-break:break-all;">
                  <a href="${safeUrl}" style="color:#5b6fd1;text-decoration:underline;">${safeUrl}</a>
                </p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f8fafc;border-left:3px solid #cbd5e1;border-radius:4px;margin:0 0 24px 0;">
                  <tr>
                    <td style="padding:12px 16px;">
                      <p style="margin:0;font-size:13px;line-height:1.5;color:#475569;">
                        <strong>Security notice:</strong> This link expires in ${expiresInHours} hours and can only be used once. If you didn't create a TradeReady AI account, you can safely ignore this email.
                      </p>
                    </td>
                  </tr>
                </table>
                <p style="margin:0;font-size:13px;line-height:1.5;color:#94a3b8;">
                  — TradeReady AI
                </p>
              </td>
            </tr>
            <tr>
              <td style="background-color:#f8fafc;padding:16px 32px;border-top:1px solid #e2e8f0;">
                <p style="margin:0;font-size:11px;line-height:1.5;color:#94a3b8;text-align:center;">
                  This is a transactional email related to your TradeReady AI account.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
}
