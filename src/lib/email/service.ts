import nodemailer, { Transporter } from "nodemailer";
import fs from "fs";
import path from "path";

/**
 * Email service for TradeReady AI.
 *
 * Provider selection (in order of precedence):
 *   1. Gmail SMTP via GMAIL_USER + GMAIL_APP_PASSWORD env vars
 *   2. Generic SMTP via SMTP_HOST + SMTP_PORT + SMTP_USER + SMTP_PASSWORD
 *   3. Dev fallback: writes the full email to .emails/dev/<timestamp>.eml
 *      and logs a clickable link. Used when no real provider is configured.
 *
 * The dev fallback lets the full password-reset flow be tested end-to-end
 * in a local environment without leaking real credentials into a mailbox.
 */

interface EmailConfig {
  from: string;
  transporter: Transporter;
  isDev: boolean;
}

let cached: EmailConfig | null = null;

function loadConfig(): EmailConfig {
  if (cached) return cached;

  // Gmail SMTP — preferred when configured.
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
    cached = {
      from: process.env.EMAIL_FROM || process.env.GMAIL_USER,
      transporter,
      isDev: false,
    };
    return cached;
  }

  // Generic SMTP — used for any other SMTP provider.
  if (
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASSWORD
  ) {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });
    cached = {
      from: process.env.EMAIL_FROM || process.env.SMTP_USER,
      transporter,
      isDev: false,
    };
    return cached;
  }

  // Prevent dev fallback in production
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD are required in production. " +
      "Dev fallback is strictly disabled in production environments."
    );
  }

  // Dev fallback — JSON transport writes to an in-memory object. We also
  // persist the raw .eml to disk so the reset link can be picked up by
  // a dev tool or copied from the console.
  const transporter = nodemailer.createTransport({
    jsonTransport: true,
  });
  cached = {
    from: process.env.EMAIL_FROM || "noreply@tradeready.ai",
    transporter,
    isDev: true,
  };
  return cached;
}

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  previewUrl?: string;
  error?: string;
}

/**
 * Send an email using the configured provider. In dev mode, the raw email
 * is written to `.emails/dev/` and the full message is returned so the
 * caller can surface the reset link without parsing an inbox.
 */
export async function sendEmail(
  opts: SendEmailOptions
): Promise<SendEmailResult> {
  const config = loadConfig();
  try {
    const info = await config.transporter.sendMail({
      from: config.from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text ?? stripHtml(opts.html),
      html: opts.html,
    });

    if (config.isDev) {
      // Persist the raw email so a developer can open it or extract the
      // reset link. The directory is gitignored.
      const dir = path.join(process.cwd(), ".emails", "dev");
      fs.mkdirSync(dir, { recursive: true });
      const filename = `${Date.now()}-${opts.to.replace(/[^a-z0-9]/gi, "_")}.eml`;
      const filePath = path.join(dir, filename);
      const content = JSON.stringify(
        {
          from: config.from,
          to: opts.to,
          subject: opts.subject,
          text: opts.text ?? stripHtml(opts.html),
          html: opts.html,
        },
        null,
        2
      );
      fs.writeFileSync(filePath, content, "utf8");
      console.log(`[email:dev] wrote ${filePath}`);
      console.log(`[email:dev] subject: ${opts.subject}`);
    }

    return {
      success: true,
      messageId: info.messageId,
      previewUrl: nodemailer.getTestMessageUrl?.(info) || undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown email error";
    console.error(`[email] send failed to ${opts.to}: ${message}`);
    return { success: false, error: message };
  }
}

/**
 * Returns true when no real SMTP provider is configured. The forgot-password
 * route uses this to decide whether to surface a "dev link" in the response
 * (for local testing) vs. a generic "check your inbox" message.
 */
export function isEmailDevMode(): boolean {
  return loadConfig().isDev;
}

/**
 * Convert an HTML body to a plain-text fallback suitable for email clients
 * that don't render HTML. We do a best-effort tag strip + whitespace collapse.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
