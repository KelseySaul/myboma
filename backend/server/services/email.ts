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
  /** Small context label above the email title. */
  eyebrow?: string;
  heading: string;
  paragraphs: string[];
  /** A prominent one-line fact, used for account roles and other critical context. */
  callout?: {label: string; value: string};
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
  `<p style="margin:0 0 18px;font-family:${FONT};font-size:15px;line-height:24px;color:#52525b;">${escapeHtml(text).replace(/\n/g, '<br>')}</p>`;

export const renderEmail = (content: EmailContent): {html: string; text: string} => {
  const details = content.details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 28px;border:1px solid #e4e4e7;border-radius:12px;border-collapse:separate;background:#fafafa;">
${content.details
  .map(
    ([label, value], index) => `<tr>
<td style="padding:13px 16px;${index ? 'border-top:1px solid #e4e4e7;' : ''}font-family:${FONT};font-size:12px;line-height:18px;color:#71717a;width:38%;vertical-align:top;">${escapeHtml(label)}</td>
<td style="padding:13px 16px;${index ? 'border-top:1px solid #e4e4e7;' : ''}font-family:${FONT};font-size:14px;line-height:20px;color:#18181b;font-weight:600;vertical-align:top;">${escapeHtml(value).replace(/\n/g, '<br>')}</td>
</tr>`,
  )
  .join('\n')}
</table>`
    : '';

  const callout = content.callout
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 24px;border:1px solid #d4d4d8;border-radius:12px;border-collapse:separate;background:#f4f4f5;">
<tr><td style="padding:16px 18px;">
<div style="margin:0 0 5px;font-family:${FONT};font-size:11px;line-height:16px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#71717a;">${escapeHtml(content.callout.label)}</div>
<div style="font-family:${HEADING_FONT};font-size:18px;line-height:24px;font-weight:700;color:#09090b;">${escapeHtml(content.callout.value)}</div>
</td></tr>
</table>`
    : '';

  const button = content.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:10px 0 28px;"><tr><td style="border-radius:12px;background:#18181b;">
<a href="${escapeHtml(content.button.url)}" style="display:inline-block;padding:14px 24px;font-family:${FONT};font-size:14px;line-height:20px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">${escapeHtml(content.button.label)}</a>
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
${content.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(content.preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
<tr><td align="center" style="padding:36px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;">
<tr><td style="background:#18181b;border-radius:18px 18px 0 0;padding:22px 30px;">
<a href="${SITE_URL}" style="font-family:${HEADING_FONT};font-size:22px;font-weight:800;letter-spacing:-0.7px;color:#ffffff;text-decoration:none;">myboma</a>
<span style="padding-left:10px;font-family:${FONT};font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#a1a1aa;white-space:nowrap;">Property management</span>
</td></tr>
<tr><td style="background:#ffffff;border-radius:0 0 18px 18px;padding:36px 30px 14px;">
${content.eyebrow ? `<p style="margin:0 0 10px;font-family:${FONT};font-size:11px;line-height:16px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#71717a;">${escapeHtml(content.eyebrow)}</p>` : ''}
<h1 style="margin:0 0 18px;font-family:${HEADING_FONT};font-size:26px;line-height:34px;font-weight:700;letter-spacing:-0.35px;color:#09090b;">${escapeHtml(content.heading)}</h1>
${content.paragraphs.map(paragraphHtml).join('\n')}
${callout}
${details}
${button}
${(content.closing ?? []).map(paragraphHtml).join('\n')}
</td></tr>
<tr><td style="padding:22px 14px 0;font-family:${FONT};font-size:12px;line-height:19px;color:#71717a;text-align:center;">
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
    ...(content.eyebrow ? [content.eyebrow, ''] : []),
    ...content.paragraphs.flatMap((p) => [p, '']),
    ...(content.callout ? [`${content.callout.label}: ${content.callout.value}`, ''] : []),
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
      preheader: `You've been invited as ${roleWithArticle}. Set up your account before ${expires}.`,
      eyebrow: 'Account invitation',
      heading: "You're invited to MyBoma",
      paragraphs: [
        `${input.inviterName} invited you to join their MyBoma workspace.`,
        'Set a password to activate your account and get started.',
      ],
      callout: {label: 'Your invited role', value: role},
      details: [
        ['Invited by', input.inviterName],
        ['Invitation expires', expires],
      ],
      button: {label: 'Set up your account', url: input.url},
      closing: [
        'This personal link works once. Do not forward it.',
        "If you weren't expecting this, ignore this email. No account is created until the link is used.",
      ],
      footerNote: 'You received this because someone invited this email address to MyBoma.',
    },
  };
};
