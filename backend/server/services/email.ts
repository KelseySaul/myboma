import nodemailer from 'nodemailer';
import {Resend} from 'resend';

/**
 * Outgoing email. Resend is used when RESEND_API_KEY is set; otherwise the SMTP transport
 * (SMTP_HOST/SMTP_USER/SMTP_PASS) is used; with neither, email is skipped with a warning.
 * Messages are deliberately plain: a small logo, short text, one clear button and a
 * plain-text alternative. No banners, badges or gradients.
 */

const OFFICIAL_SITE_URL = 'https://myboma.org';
const configuredSiteUrl = process.env.APP_BASE_URL?.trim();
// Links must point users at the official site even if APP_BASE_URL names Render's own
// hostname. Local development URLs remain untouched.
const SITE_URL = (configuredSiteUrl && !/(^|\/\/)myboma\.onrender\.com\/?$/i.test(configuredSiteUrl)
  ? configuredSiteUrl
  : OFFICIAL_SITE_URL
).replace(/\/$/, '');
// Always the public HTTPS origin so email clients can load it (dark mark for a white page).
const EMAIL_LOGO_URL = `${OFFICIAL_SITE_URL}/bomalog.png`;
export const SUPPORT_EMAIL = 'support@myboma.org';
// myboma.org is the verified Resend sending domain, so support@myboma.org is both the
// authenticated sender and the reply-to/contact address.
export const SUPPORT_FROM = 'MyBoma Support <support@myboma.org>';

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
  /** One key fact shown in bold on its own line (an amount, a role). */
  callout?: {label: string; value: string; sublabel?: string};
  /** Label/value pairs, shown as a simple list. */
  details?: Array<[label: string, value: string]>;
  button?: {label: string; url: string; /** ignored by the plain layout */ hint?: string};
  /** Short lines after the button. */
  closing?: string[];
  /** Why the recipient got this email. */
  footerNote?: string;
  /** Accepted for backwards compatibility; the plain layout does not use these. */
  eyebrow?: string;
  tone?: 'brand' | 'success' | 'warning' | 'danger' | 'info';
  steps?: string[];
};

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const INK = '#1a1a1a';
const MUTED = '#6b6b6b';
const LINE = '#e6e6e6';

const p = (text: string, color = INK, size = 15) =>
  `<p style="margin:0 0 14px;font-family:${FONT};font-size:${size}px;line-height:23px;color:${color};">${escapeHtml(text).replace(/\n/g, '<br>')}</p>`;

export const renderEmail = (content: EmailContent): {html: string; text: string} => {
  const callout = content.callout
    ? `<p style="margin:4px 0 18px;font-family:${FONT};font-size:15px;line-height:23px;color:${INK};">${escapeHtml(content.callout.label)}: <strong>${escapeHtml(content.callout.value)}</strong>${content.callout.sublabel ? `<br><span style="color:${MUTED};font-size:13px;">${escapeHtml(content.callout.sublabel)}</span>` : ''}</p>`
    : '';

  const details = content.details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;border-top:1px solid ${LINE};">
${content.details
  .map(
    ([label, value]) => `<tr>
<td style="padding:9px 0;border-bottom:1px solid ${LINE};font-family:${FONT};font-size:13px;line-height:19px;color:${MUTED};width:34%;vertical-align:top;">${escapeHtml(label)}</td>
<td style="padding:9px 0;border-bottom:1px solid ${LINE};font-family:${FONT};font-size:14px;line-height:19px;color:${INK};vertical-align:top;">${escapeHtml(value).replace(/\n/g, '<br>')}</td>
</tr>`,
  )
  .join('\n')}
</table>`
    : '';

  const button = content.button
    ? `<p style="margin:6px 0 20px;"><a href="${escapeHtml(content.button.url)}" target="_blank" style="display:inline-block;padding:11px 22px;background:${INK};color:#ffffff;font-family:${FONT};font-size:14px;font-weight:600;line-height:20px;text-decoration:none;border-radius:6px;">${escapeHtml(content.button.label)}</a></p>
<p style="margin:0 0 20px;font-family:${FONT};font-size:12px;line-height:18px;color:${MUTED};word-break:break-all;">Or paste this link into your browser:<br><a href="${escapeHtml(content.button.url)}" style="color:${MUTED};">${escapeHtml(content.button.url)}</a></p>`
    : '';

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${escapeHtml(content.heading)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;">
${content.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(content.preheader)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;">
<tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${LINE};border-radius:8px;">
<tr><td style="padding:24px 28px 8px;">
<a href="${SITE_URL}" target="_blank" style="text-decoration:none;">
<img src="${EMAIL_LOGO_URL}" alt="" width="28" height="28" style="vertical-align:middle;border:0;">
<span style="vertical-align:middle;padding-left:8px;font-family:${FONT};font-size:17px;font-weight:700;color:${INK};">MyBoma</span>
</a>
</td></tr>
<tr><td style="padding:12px 28px 8px;">
<h1 style="margin:0 0 16px;font-family:${FONT};font-size:20px;line-height:28px;font-weight:700;color:${INK};">${escapeHtml(content.heading)}</h1>
${content.paragraphs.map((t) => p(t)).join('\n')}
${callout}
${details}
${button}
${(content.closing ?? []).map((t) => p(t, MUTED, 13)).join('\n')}
</td></tr>
<tr><td style="padding:14px 28px 22px;border-top:1px solid ${LINE};font-family:${FONT};font-size:12px;line-height:18px;color:${MUTED};">
${content.footerNote ? `${escapeHtml(content.footerNote)}<br>` : ''}Questions? Reply to this email or write to <a href="mailto:${SUPPORT_EMAIL}" style="color:${MUTED};">${SUPPORT_EMAIL}</a>.
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    content.heading,
    '',
    ...content.paragraphs.flatMap((t) => [t, '']),
    ...(content.callout ? [`${content.callout.label}: ${content.callout.value}${content.callout.sublabel ? ` (${content.callout.sublabel})` : ''}`, ''] : []),
    ...(content.details?.length ? [...content.details.map(([label, value]) => `${label}: ${value}`), ''] : []),
    ...(content.button ? [`${content.button.label}: ${content.button.url}`, ''] : []),
    ...(content.closing ?? []).flatMap((t) => [t, '']),
    '--',
    'MyBoma',
    `${SITE_URL} | ${SUPPORT_EMAIL}`,
    ...(content.footerNote ? [content.footerNote] : []),
  ].join('\n');

  return {html, text};
};

/** Wraps a legacy plain-text body in the layout (blank lines split paragraphs). */
export const renderPlainText = (subject: string, text: string) =>
  renderEmail({heading: subject, paragraphs: text.split(/\n{2,}/).map((t) => t.trim()).filter(Boolean)});

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

/* Invitations ------------------------------------------------------------- */

const ROLE_LABELS: Record<string, string> = {
  tenant: 'Tenant',
  landlord: 'Landlord',
  caretaker: 'Caretaker',
  admin: 'Administrator',
  hunter: 'House hunter',
};

/** The email sent with a single-use account setup link. */
export const buildInviteEmail = (input: {to: string; inviterName: string; role: string; url: string; expiresAt: Date}): SendEmailInput => {
  const expires = input.expiresAt.toLocaleDateString('en-KE', {day: 'numeric', month: 'long', year: 'numeric'});
  const role = ROLE_LABELS[input.role] ?? 'Member';
  const roleWithArticle = `${role === 'Administrator' ? 'an' : 'a'} ${role}`;
  return {
    to: input.to,
    subject: `${input.inviterName} invited you to MyBoma as ${roleWithArticle}`,
    template: {
      preheader: `Set up your account before ${expires}.`,
      heading: `${input.inviterName} invited you to MyBoma`,
      paragraphs: [
        `${input.inviterName} added you to MyBoma as ${roleWithArticle}. Choose a password to activate your account.`,
      ],
      callout: {label: 'Your role', value: role},
      details: [
        ['Account email', input.to],
        ['Link expires', expires],
      ],
      button: {label: 'Set up your account', url: input.url},
      closing: [
        'The link works once, so please do not forward it. If you were not expecting this invitation, you can ignore this email.',
      ],
      footerNote: 'Sent because someone invited this address to MyBoma.',
    },
  };
};
