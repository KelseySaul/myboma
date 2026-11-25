import nodemailer from 'nodemailer';
import {Resend} from 'resend';

/**
 * Outgoing email. Resend is used when RESEND_API_KEY is set; otherwise the SMTP transport
 * (SMTP_HOST/SMTP_USER/SMTP_PASS) is used; with neither, email is skipped with a warning.
 * Every message goes out as branded HTML (with the MyBoma logo, visual hierarchy, and
 * unmistakable primary action button) plus a clean plain-text alternative.
 */

const OFFICIAL_SITE_URL = 'https://myboma.kelseysaul.dev';
const configuredSiteUrl = process.env.APP_BASE_URL?.trim();
// Stored links created while Render was the public host must point users back to the
// official site. Local development URLs remain untouched.
const SITE_URL = (configuredSiteUrl && !/(^|\/\/)myboma\.onrender\.com\/?$/i.test(configuredSiteUrl)
  ? configuredSiteUrl
  : OFFICIAL_SITE_URL
).replace(/\/$/, '');
// Always load the brand logo from the public HTTPS origin so email clients can render it
// even when a message is generated from localhost during development.
const EMAIL_LOGO_URL = `${OFFICIAL_SITE_URL}/bomalog-white.png`;
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

export type EmailTone = 'brand' | 'success' | 'warning' | 'danger' | 'info';

export type EmailContent = {
  /** Short line shown by inboxes next to the subject. */
  preheader?: string;
  /** Small context badge above the email title. */
  eyebrow?: string;
  /** Visual accent theme matching the message urgency/status. */
  tone?: EmailTone;
  heading: string;
  paragraphs: string[];
  /** A prominent highlighted card (e.g. invited role, amount due, payment confirmed). */
  callout?: {label: string; value: string; sublabel?: string};
  /** Label/value rows rendered in a clean summary card (e.g. receipt or enquiry details). */
  details?: Array<[label: string, value: string]>;
  /** Numbered step-by-step instructions so recipients immediately know what to do next. */
  steps?: string[];
  /** Primary high-contrast action button with automatic fallback copy-link underneath. */
  button?: {label: string; url: string; hint?: string};
  /** Paragraphs shown after the button / details. */
  closing?: string[];
  /** Why the recipient got this email (and how to stop it, where relevant). */
  footerNote?: string;
};

const FONT = "'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const HEADING_FONT = "'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const TONE_PALETTE: Record<
  EmailTone,
  {
    pillBg: string;
    pillText: string;
    pillBorder: string;
    calloutBg: string;
    calloutBorder: string;
    calloutBar: string;
    calloutValue: string;
    btnBg: string;
    btnShadow: string;
  }
> = {
  brand: {
    pillBg: '#F3EEFF',
    pillText: '#5B21B6',
    pillBorder: '#DDD6FE',
    calloutBg: '#FAF8FF',
    calloutBorder: '#E5DEFA',
    calloutBar: '#6D28D9',
    calloutValue: '#2E1065',
    btnBg: '#5B21B6',
    btnShadow: '0 6px 18px rgba(91,33,182,0.28)',
  },
  success: {
    pillBg: '#ECFDF5',
    pillText: '#047857',
    pillBorder: '#A7F3D0',
    calloutBg: '#F2FCF7',
    calloutBorder: '#C7F2DF',
    calloutBar: '#059669',
    calloutValue: '#064E3B',
    btnBg: '#5B21B6',
    btnShadow: '0 6px 18px rgba(91,33,182,0.26)',
  },
  warning: {
    pillBg: '#FFFBEB',
    pillText: '#B45309',
    pillBorder: '#FDE68A',
    calloutBg: '#FFFDF4',
    calloutBorder: '#FDE8B0',
    calloutBar: '#D97706',
    calloutValue: '#78350F',
    btnBg: '#5B21B6',
    btnShadow: '0 6px 18px rgba(91,33,182,0.28)',
  },
  danger: {
    pillBg: '#FFF1F2',
    pillText: '#BE123C',
    pillBorder: '#FECDD3',
    calloutBg: '#FFF7F8',
    calloutBorder: '#FCD4DA',
    calloutBar: '#E11D48',
    calloutValue: '#881337',
    btnBg: '#BE123C',
    btnShadow: '0 6px 18px rgba(190,18,60,0.26)',
  },
  info: {
    pillBg: '#EFF6FF',
    pillText: '#1D4ED8',
    pillBorder: '#BFDBFE',
    calloutBg: '#F7FAFF',
    calloutBorder: '#D5E5FD',
    calloutBar: '#2563EB',
    calloutValue: '#1E3A8A',
    btnBg: '#5B21B6',
    btnShadow: '0 6px 18px rgba(91,33,182,0.26)',
  },
};

const paragraphHtml = (text: string) =>
  `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:24px;color:#3F3F46;">${escapeHtml(text).replace(/\n/g, '<br>')}</p>`;

const closingHtml = (text: string) =>
  `<p style="margin:0 0 12px;font-family:${FONT};font-size:13px;line-height:20px;color:#71717A;">${escapeHtml(text).replace(/\n/g, '<br>')}</p>`;

export const renderEmail = (content: EmailContent): {html: string; text: string} => {
  const palette = TONE_PALETTE[content.tone ?? 'brand'];
  const headerTag = content.eyebrow || 'MyBoma';

  const callout = content.callout
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 22px;border:1px solid ${palette.calloutBorder};border-left:4px solid ${palette.calloutBar};border-radius:12px;border-collapse:separate;background:${palette.calloutBg};">
<tr><td style="padding:16px 20px;">
<div style="margin:0 0 4px;font-family:${FONT};font-size:11px;line-height:16px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#6B7280;">${escapeHtml(content.callout.label)}</div>
<div style="font-family:${HEADING_FONT};font-size:22px;line-height:28px;font-weight:800;letter-spacing:-0.3px;color:${palette.calloutValue};">${escapeHtml(content.callout.value)}</div>
${content.callout.sublabel ? `<div style="margin-top:4px;font-family:${FONT};font-size:13px;line-height:18px;color:#52525B;">${escapeHtml(content.callout.sublabel)}</div>` : ''}
</td></tr>
</table>`
    : '';

  const details = content.details?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 24px;border:1px solid #EAE5F5;border-radius:14px;border-collapse:separate;background:#FAF8FF;">
${content.details
  .map(
    ([label, value], index) => `<tr>
<td style="padding:13px 18px;${index ? 'border-top:1px solid #ECE7F6;' : ''}font-family:${FONT};font-size:12px;line-height:18px;font-weight:600;color:#6B7280;width:38%;vertical-align:top;">${escapeHtml(label)}</td>
<td style="padding:13px 18px;${index ? 'border-top:1px solid #ECE7F6;' : ''}font-family:${FONT};font-size:14px;line-height:20px;color:#18181B;font-weight:600;vertical-align:top;">${escapeHtml(value).replace(/\n/g, '<br>')}</td>
</tr>`,
  )
  .join('\n')}
</table>`
    : '';

  const steps = content.steps?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 24px;border:1px solid #EFEBF8;border-radius:14px;border-collapse:separate;background:#FFFFFF;">
<tr><td style="padding:16px 18px 8px;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#6D28D9;">What to do next</td></tr>
${content.steps
  .map(
    (step, idx) => `<tr><td style="padding:6px 18px ${idx === content.steps!.length - 1 ? '16px' : '6px'};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td width="28" valign="top" style="padding-top:1px;">
<span style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;border-radius:999px;background:#F3EEFF;color:#5B21B6;font-family:${FONT};font-size:12px;font-weight:700;">${idx + 1}</span>
</td>
<td style="font-family:${FONT};font-size:14px;line-height:21px;color:#27272A;">${escapeHtml(step)}</td>
</tr></table>
</td></tr>`,
  )
  .join('\n')}
</table>`
    : '';

  const button = content.button
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;">
${content.button.hint ? `<tr><td style="padding:0 0 10px;font-family:${FONT};font-size:13px;line-height:19px;font-weight:600;color:#3F3F46;">${escapeHtml(content.button.hint)}</td></tr>` : ''}
<tr><td>
<table role="presentation" cellpadding="0" cellspacing="0">
<tr><td align="center" style="border-radius:12px;background:${palette.btnBg};box-shadow:${palette.btnShadow};">
<a href="${escapeHtml(content.button.url)}" target="_blank" style="display:inline-block;padding:15px 28px;font-family:${FONT};font-size:15px;line-height:20px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:12px;letter-spacing:-0.1px;">${escapeHtml(content.button.label)}&nbsp;&rarr;</a>
</td></tr>
</table>
</td></tr>
<tr><td style="padding:12px 0 0;font-family:${FONT};font-size:12px;line-height:18px;color:#71717A;word-break:break-all;">
Button not opening? Copy or tap this link:<br>
<a href="${escapeHtml(content.button.url)}" target="_blank" style="color:#5B21B6;text-decoration:underline;">${escapeHtml(content.button.url)}</a>
</td></tr>
</table>`
    : '';

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${escapeHtml(content.heading)}</title>
</head>
<body style="margin:0;padding:0;background:#F4F2FA;-webkit-font-smoothing:antialiased;">
${content.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(content.preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F2FA;">
<tr><td align="center" style="padding:32px 14px 40px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;border-radius:20px;overflow:hidden;border:1px solid #E5DFF5;background:#FFFFFF;box-shadow:0 10px 30px rgba(27,21,48,0.07);">
<tr><td style="background:#1B1530;background-image:linear-gradient(135deg,#17112B 0%,#351B6B 58%,#5B21B6 100%);padding:24px 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr>
<td valign="middle">
<a href="${SITE_URL}" target="_blank" style="text-decoration:none;display:inline-block;">
<table role="presentation" cellpadding="0" cellspacing="0">
<tr>
<td valign="middle" style="width:42px;height:42px;border-radius:12px;background:rgba(255,255,255,0.14);border:1px solid rgba(255,255,255,0.22);text-align:center;">
<img src="${EMAIL_LOGO_URL}" alt="MyBoma" width="26" height="26" style="display:block;margin:0 auto;border:0;outline:none;text-decoration:none;">
</td>
<td valign="middle" style="padding-left:12px;">
<div style="font-family:${HEADING_FONT};font-size:20px;line-height:22px;font-weight:800;letter-spacing:-0.5px;color:#FFFFFF;">MyBoma</div>
<div style="font-family:${FONT};font-size:11px;line-height:15px;font-weight:500;color:#DDD6FE;">Property Management &amp; Rentals</div>
</td>
</tr>
</table>
</a>
</td>
<td align="right" valign="middle">
<span style="display:inline-block;padding:5px 11px;border-radius:999px;background:rgba(255,255,255,0.14);border:1px solid rgba(255,255,255,0.22);font-family:${FONT};font-size:10px;line-height:14px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#F5F3FF;white-space:nowrap;">${escapeHtml(headerTag)}</span>
</td>
</tr>
</table>
</td></tr>
<tr><td style="background:#FFFFFF;padding:32px 28px 20px;">
${content.eyebrow ? `<div style="margin:0 0 14px;"><span style="display:inline-block;padding:4px 11px;border-radius:999px;background:${palette.pillBg};border:1px solid ${palette.pillBorder};font-family:${FONT};font-size:11px;line-height:16px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:${palette.pillText};">${escapeHtml(content.eyebrow)}</span></div>` : ''}
<h1 style="margin:0 0 16px;font-family:${HEADING_FONT};font-size:25px;line-height:33px;font-weight:800;letter-spacing:-0.4px;color:#111118;">${escapeHtml(content.heading)}</h1>
${content.paragraphs.map(paragraphHtml).join('\n')}
${callout}
${details}
${steps}
${button}
${content.closing?.length ? `<div style="margin-top:8px;padding-top:16px;border-top:1px solid #F1EEF9;">${content.closing.map(closingHtml).join('\n')}</div>` : ''}
</td></tr>
<tr><td style="background:#FAF9FE;border-top:1px solid #EEE9FA;padding:20px 28px;font-family:${FONT};font-size:12px;line-height:19px;color:#71717A;text-align:center;">
${content.footerNote ? `<div style="margin-bottom:8px;color:#52525B;">${escapeHtml(content.footerNote)}</div>` : ''}
<div>
<a href="${SITE_URL}" target="_blank" style="color:#5B21B6;font-weight:600;text-decoration:none;">Open MyBoma</a>
&nbsp;&middot;&nbsp;
<a href="mailto:${SUPPORT_EMAIL}" style="color:#52525B;text-decoration:none;">${SUPPORT_EMAIL}</a>
</div>
<div style="margin-top:6px;font-size:11px;color:#A1A1AA;">MyBoma &middot; Smart property management &amp; rentals across Kenya</div>
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
    ...(content.callout
      ? [`${content.callout.label}: ${content.callout.value}${content.callout.sublabel ? ` (${content.callout.sublabel})` : ''}`, '']
      : []),
    ...(content.details?.length ? [...content.details.map(([label, value]) => `${label}: ${value}`), ''] : []),
    ...(content.steps?.length ? ['What to do next:', ...content.steps.map((s, i) => `${i + 1}. ${s}`), ''] : []),
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
  renderEmail({
    heading: subject,
    paragraphs: text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean),
    button: {label: 'Open MyBoma', url: SITE_URL},
  });

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
      tone: 'brand',
      heading: "You're invited to MyBoma",
      paragraphs: [
        `${input.inviterName} invited you to join their MyBoma workspace as ${roleWithArticle}.`,
      ],
      callout: {label: 'Your invited role', value: role},
      details: [
        ['Invited by', input.inviterName],
        ['Account email', input.to],
        ['Invitation expires', expires],
      ],
      steps: [
        'Click the "Set up your account" button below.',
        'Create a password to activate your account.',
        `Sign straight into your ${role} dashboard on MyBoma.`,
      ],
      button: {
        label: 'Set up your account',
        url: input.url,
        hint: 'Click the purple button below to accept your invitation:',
      },
      closing: [
        'This personal link works once and expires automatically. Do not forward it.',
        "If you weren't expecting this invitation, you can safely ignore this email.",
      ],
      footerNote: 'You received this because someone invited this email address to MyBoma.',
    },
  };
};
