import {randomBytes} from 'node:crypto';
import {z} from 'zod';
import type {SendEmailInput} from './services/email.ts';

export const DEFAULT_SUPPORT_EMAIL = 'support@myboma.org';

export const publicContactSchema = z
  .object({
    role: z.string().trim().min(2).max(80),
    topic: z.string().trim().min(2).max(120),
    detail: z.string().trim().min(2).max(160),
    urgency: z.string().trim().min(2).max(80),
    preferredContact: z.enum(['Email', 'Email & Phone call']).default('Email'),
    name: z.string().trim().min(2, 'Please enter your name.').max(120),
    email: z.string().trim().email('Please enter a valid email address.').max(320),
    phone: z.string().trim().max(40).optional().default(''),
    note: z.string().trim().max(1000).optional().default(''),
  })
  .strict();

export type PublicContactInput = z.infer<typeof publicContactSchema>;

export const generateSupportTicketRef = (): string => {
  const code = randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
  return `MB-SUP-${code}`;
};

export const buildContactEmails = (params: {
  input: PublicContactInput;
  ticketRef: string;
  supportEmail?: string;
  appUrl: string;
}): {toSupport: SendEmailInput; toSender: SendEmailInput} => {
  const {input, ticketRef, appUrl} = params;
  const supportEmail = (params.supportEmail || DEFAULT_SUPPORT_EMAIL).trim();
  const firstName = input.name.trim().split(/\s+/)[0] || input.name.trim();

  const sharedDetails: Array<[string, string]> = [
    ['Reference', ticketRef],
    ['Role', input.role],
    ['Topic', input.topic],
    ['Selected detail', input.detail],
    ['Priority', input.urgency],
    ['Preferred reply', input.preferredContact],
  ];

  const toSupport: SendEmailInput = {
    to: supportEmail,
    replyTo: input.email,
    subject: `[${ticketRef}] ${input.topic} — ${input.name}`,
    template: {
      preheader: `${input.name} (${input.role}) contacted MyBoma Support about ${input.topic}.`,
      heading: `New support enquiry (${ticketRef})`,
      paragraphs: [
        `${input.name} reached out through the MyBoma Contact Us page. Reply directly to this email to respond to ${input.email}.`,
      ],
      details: [
        ...sharedDetails,
        ['Name', input.name],
        ['Email', input.email],
        ...(input.phone ? [['Phone', input.phone] as [string, string]] : []),
        ...(input.note ? [['Additional note', input.note] as [string, string]] : []),
      ],
      button: {label: 'Open MyBoma', url: appUrl},
      footerNote: `Submitted via MyBoma Contact Us (${ticketRef}).`,
    },
  };

  const toSender: SendEmailInput = {
    to: input.email,
    replyTo: supportEmail,
    subject: `We received your enquiry (${ticketRef}) — MyBoma Support`,
    template: {
      preheader: `Our team received your enquiry (${ticketRef}) and will be in touch shortly.`,
      heading: 'We received your message',
      paragraphs: [
        `Hi ${firstName}, thanks for getting in touch with MyBoma. Our support team has received your enquiry and will get back to you shortly.`,
      ],
      details: [
        ...sharedDetails,
        ...(input.phone ? [['Phone', input.phone] as [string, string]] : []),
        ...(input.note ? [['Your note', input.note] as [string, string]] : []),
        ['Support email', supportEmail],
      ],
      button: {label: 'Visit MyBoma', url: appUrl},
      closing: [`Need to add more details? Reply directly to this email and quote reference ${ticketRef}.`],
      footerNote: `Sent to ${input.email} because you submitted an enquiry on MyBoma.`,
    },
  };

  return {toSupport, toSender};
};
