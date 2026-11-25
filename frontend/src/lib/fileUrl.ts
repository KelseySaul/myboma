const INTERNAL_FILE_PATH_RE = /^\/api(?:\/(?:web|mobile))?\/files\/.+/;

const apiBase = () => (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

/**
 * Resolves any stored media URL so images always render cleanly across localhost,
 * Vite dev proxy, Vercel preview URLs, production domains, and Capacitor native apps.
 *
 * - Converts legacy/mismatched `http://localhost:4173/api/files/...` or Render URLs into
 *   the active API origin (or same-origin relative path on web).
 * - Leaves external URLs (Unsplash, CDN), `blob:`, and `data:` URLs untouched.
 */
export const resolveMediaUrl = (value?: string | null): string => {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('blob:') || trimmed.startsWith('data:')) return trimmed;

  const base = apiBase();
  if (INTERNAL_FILE_PATH_RE.test(trimmed)) {
    return `${base}${trimmed}`;
  }

  try {
    const parsed = new URL(trimmed);
    if (INTERNAL_FILE_PATH_RE.test(parsed.pathname)) {
      return `${base}${parsed.pathname}${parsed.search}`;
    }
    return trimmed;
  } catch {
    return trimmed;
  }
};
