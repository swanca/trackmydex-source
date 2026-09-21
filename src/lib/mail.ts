import nodemailer, { type Transporter } from 'nodemailer';
import { env, hasMailer } from './env';
import { logger } from './logger';

/**
 * Outbound mail.
 *
 * A single-user self-hosted instance should not need an SMTP server just to reset
 * a password, so when SMTP_URL is unset the message - including the action link -
 * is logged at info level and the operator copies it from the container logs.
 * That is a deliberate degradation, announced in the README, not a silent failure.
 */

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!hasMailer) return null;
  transporter ??= nodemailer.createTransport(env.SMTP_URL);
  return transporter;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendMail(message: MailMessage): Promise<void> {
  const transport = getTransporter();

  if (!transport) {
    logger.info('mail.not_configured', {
      to: message.to,
      subject: message.subject,
      body: message.text,
      hint: 'Set SMTP_URL to deliver this by e-mail instead of logging it.',
    });
    return;
  }

  try {
    await transport.sendMail({ from: env.SMTP_FROM, ...message });
    logger.info('mail.sent', { to: message.to, subject: message.subject });
  } catch (error) {
    logger.error('mail.failed', { to: message.to, subject: message.subject, error });
    throw error;
  }
}

/** Minimal, dark-themed transactional template matching the product. */
export function renderActionEmail(options: {
  heading: string;
  body: string;
  actionLabel: string;
  actionUrl: string;
  footer: string;
  icon?: string;
}): string {
  const { heading, body, actionLabel, actionUrl, footer, icon } = options;
  return `<!doctype html>
<html><body style="margin:0;padding:32px;background:#080b14;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#e7ebf5">
  <div style="max-width:480px;margin:0 auto;background:#0d1322;border:1px solid #1c2740;border-radius:20px;padding:32px">
    <p style="margin:0 0 4px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#7d8bb0">TrackMyDex</p>
    ${icon ? `<div style="margin:18px 0;width:48px;height:48px;border-radius:15px;background:#182240;text-align:center;line-height:48px;font-size:24px" role="img">${escapeHtml(icon)}</div>` : ''}
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#ffffff">${escapeHtml(heading)}</h1>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#aab4cf">${escapeHtml(body)}</p>
    <a href="${escapeAttribute(actionUrl)}" style="display:inline-block;padding:12px 22px;border-radius:12px;background:linear-gradient(135deg,#7c5cff,#3d8bff);color:#fff;text-decoration:none;font-weight:600;font-size:15px">${escapeHtml(actionLabel)}</a>
    <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#6b7799">${escapeHtml(footer)}</p>
  </div>
</body></html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/'/g, '&#39;');
}
