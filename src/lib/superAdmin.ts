/** Comma-separated super-admin emails (client: VITE_SUPER_ADMIN_EMAILS). Prefer DB isSuperAdmin after bootstrap. */
export const parseSuperAdminEmails = (raw?: string) =>
  new Set(
    (raw || '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );

// NOTE: Do NOT export VITE_SUPER_ADMIN_EMAILS directly — it bakes admin email addresses into the
// public JS bundle. Super admin status is determined from the DB profile field `isSuperAdmin`.
// The server-side config/superAdmin.ts handles the SUPER_ADMIN_EMAILS env var securely.
export const isSuperAdminEmail = (_email?: string | null): boolean => false;
