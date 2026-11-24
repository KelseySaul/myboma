export const parseSuperAdminEmails = (raw?: string) =>
  new Set(
    (raw || '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );

export const SUPER_ADMIN_EMAILS = parseSuperAdminEmails(process.env.SUPER_ADMIN_EMAILS);

export const isSuperAdminEmail = (email?: string | null) =>
  email ? SUPER_ADMIN_EMAILS.has(email.toLowerCase()) : false;
