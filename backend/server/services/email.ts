import nodemailer from 'nodemailer';
import {Resend} from 'resend';

/**
 * Outgoing email. Resend is used when RESEND_API_KEY is set; otherwise the SMTP transport
 * (SMTP_HOST/SMTP_USER/SMTP_PASS) is used; with neither, email is skipped with a warning.
 * Every message goes out as branded HTML plus a plain-text alternative.
 */

const OFFICIAL_SITE_URL = 'https://myboma.kelseysaul.dev';
const configuredSiteUrl = process.env.APP_BASE_URL?.trim();
// Stored links created while Render was the public host must point users back to the
// official site. Local development URLs remain untouched.
const SITE_URL = (configuredSiteUrl && !/(^|\/\/)myboma\.onrender\.com\/?$/i.test(configuredSiteUrl)
  ? configuredSiteUrl
  : OFFICIAL_SITE_URL
).replace(/\/$/, '');
export const SUPPORT_EMAIL = 'support@myboma.com';
// Resend verifies myboma.kelseysaul.dev. It cannot send from support@myboma.com
// until that separate root domain is also verified, so support@myboma.com remains
// the reply-to/contact address while the authenticated sender uses the subdomain.
export const SUPPORT_FROM = 'MyBoma Support <support@myboma.kelseysaul.dev>';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

/**
 * Keep one recognizable, verified identity for every Resend message. SMTP can still
 * use its own configured sender as a fallback when Resend is intentionally absent.
 */
export const emailFrom = () =>
  resend
    ? process.env.RESEND_FROM || SUPPORT_FROM
    : process.env.EMAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || SUPPORT_FROM;

export const smtpTransport =
  process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {user: process.env.SMTP_USER, pass: process.env.SMTP_PASS},
      })
    : null;

export const isEmailConfigured = () => Boolean(resend || smtpTransport);

/* Template ---------------------------------------------------------------- */

export const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export type EmailContent = {
  /** Short line shown by inboxes next to the subject. */
  preheader?: string;
  heading: string;
  paragraphs: string[];
  /** Label/value rows rendered as a small table (e.g. receipt or enquiry details). */
  details?: Array<[label: string, value: string]>;
  button?: {label: string; url: string};
  /** Paragraphs shown after the button / details. */
  closing?: string[];
  /** Why the recipient got this email (and how to stop it, where relevant). */
  footerNote?: string;
};

const FONT = "Poppins,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const HEADING_FONT = "Montserrat,Poppins,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const paragraphHtml = (text: string) =>
  `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:24px;color:#3f3f46;">${escapeHtml(text).replace(/\n/g, '<br>')}</p>`;

export const renderEmail = (content: EmailContent): {html: string; text: string} => {
  const details = content.details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;border:1px solid #e4e4e7;border-radius:10px;border-collapse:separate;">
${content.details
  .map(
    ([label, value], index) => `<tr>
<td style="padding:12px 16px;${index ? 'border-top:1px solid #e4e4e7;' : ''}font-family:${FONT};font-size:13px;color:#71717a;width:38%;vertical-align:top;">${escapeHtml(label)}</td>
<td style="padding:12px 16px;${index ? 'border-top:1px solid #e4e4e7;' : ''}font-family:${FONT};font-size:14px;color:#09090b;font-weight:600;vertical-align:top;">${escapeHtml(value).replace(/\n/g, '<br>')}</td>
</tr>`,
  )
  .join('\n')}
</table>`
    : '';

  const button = content.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;"><tr><td style="border-radius:10px;background:#09090b;">
<a href="${escapeHtml(content.button.url)}" style="display:inline-block;padding:13px 24px;font-family:${FONT};font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">${escapeHtml(content.button.label)}</a>
</td></tr></table>`
    : '';

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${escapeHtml(content.heading)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;">
${content.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(content.preheader)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td style="background:#09090b;border-radius:14px 14px 0 0;padding:20px 28px;">
<a href="${SITE_URL}" style="font-family:${HEADING_FONT};font-size:20px;font-weight:800;letter-spacing:-0.5px;color:#ffffff;text-decoration:none;">myboma</a>
</td></tr>
<tr><td style="background:#ffffff;border-radius:0 0 14px 14px;padding:32px 28px 12px;">
<h1 style="margin:0 0 16px;font-family:${HEADING_FONT};font-size:22px;line-height:30px;font-weight:700;color:#09090b;">${escapeHtml(content.heading)}</h1>
${content.paragraphs.map(paragraphHtml).join('\n')}
${details}
${button}
${(content.closing ?? []).map(paragraphHtml).join('\n')}
</td></tr>
<tr><td style="padding:20px 8px 0;font-family:${FONT};font-size:12px;line-height:19px;color:#71717a;text-align:center;">
${content.footerNote ? `${escapeHtml(content.footerNote)}<br>` : ''}
Questions? Email <a href="mailto:${SUPPORT_EMAIL}" style="color:#09090b;">${SUPPORT_EMAIL}</a><br>
<a href="${SITE_URL}" style="color:#71717a;">${SITE_URL.replace(/^https?:\/\//, '')}</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    content.heading,
    '',
    ...content.paragraphs.flatMap((p) => [p, '']),
    ...(content.details?.length ? [...content.details.map(([label, value]) => `${label}: ${value}`), ''] : []),
    ...(content.button ? [`${content.button.label}: ${content.button.url}`, ''] : []),
    ...(content.closing ?? []).flatMap((p) => [p, '']),
    '--',
    'MyBoma',
    `${SITE_URL} | ${SUPPORT_EMAIL}`,
    ...(content.footerNote ? [content.footerNote] : []),
  ].join('\n');

  return {html, text};
};

/** Wraps a legacy plain-text body in the branded layout (blank lines split paragraphs). */
export const renderPlainText = (subject: string, text: string) =>
  renderEmail({heading: subject, paragraphs: text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)});

/* Delivery ---------------------------------------------------------------- */

export type SendEmailInput = {
  to?: string | null;
  subject: string;
  /** Plain-text body. Optional when `template` is given. */
  text?: string;
  html?: string;
  template?: EmailContent;
  replyTo?: string;
};

export const sendEmail = async ({to, subject, text, html, template, replyTo}: SendEmailInput) => {
  if (!to) return;
  if (!resend && !smtpTransport) {
    console.warn(`[email] No email provider configured; skipped "${subject}" to ${to}`);
    return;
  }

  const rendered = template ? renderEmail(template) : html ? null : renderPlainText(subject, text ?? '');
  const message = {
    from: emailFrom(),
    to,
    subject,
    html: html ?? rendered!.html,
    text: text ?? rendered?.text ?? '',
    replyTo: replyTo || SUPPORT_EMAIL,
  };

  if (resend) {
    const {error} = await resend.emails.send(message);
    if (error) throw new Error(`Resend: ${error.message}`);
    return;
  }
  await smtpTransport!.sendMail(message);
};
