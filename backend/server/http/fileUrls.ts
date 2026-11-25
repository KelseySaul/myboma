export type FileUrlRequestLike = {
  protocol?: string;
  baseUrl?: string;
  clientKind?: string;
  get?: (name: string) => string | string[] | undefined;
};

const INTERNAL_FILE_PATH_RE = /^\/api(?:\/(?:web|mobile))?\/files\/.+/;

/**
 * Normalizes a stored media URL so images uploaded under a previous host/port (e.g.
 * http://localhost:4173/api/files/..., Render URLs, or preview domains) always load
 * reliably on the current host.
 *
 * - Web requests receive clean relative paths (`/api/files/...` or `${req.baseUrl}/files/...`),
 *   so same-origin proxies (Vite dev server, Vercel, custom domains) always resolve them.
 * - Mobile requests receive an absolute URL on the request's current host.
 * - External URLs (e.g. Unsplash) pass through untouched.
 */
export const normalizeStoredFileUrl = (req: FileUrlRequestLike, value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  const isMobile = req.clientKind === 'mobile';
  const toFinal = (pathname: string, search = '') => {
    const cleanPath = pathname.startsWith('/api/web/files/') || pathname.startsWith('/api/mobile/files/')
      ? `${req.baseUrl || '/api/web'}${pathname.replace(/^\/api\/(?:web|mobile)/, '')}`
      : pathname;
    if (!isMobile) return `${cleanPath}${search}`;
    const rawHost = req.get?.('host');
    const host = Array.isArray(rawHost) ? rawHost[0] : rawHost;
    if (!host) return `${cleanPath}${search}`;
    return `${req.protocol || 'https'}://${host}${cleanPath}${search}`;
  };

  if (INTERNAL_FILE_PATH_RE.test(trimmed)) {
    const qIdx = trimmed.indexOf('?');
    return qIdx >= 0 ? toFinal(trimmed.slice(0, qIdx), trimmed.slice(qIdx)) : toFinal(trimmed);
  }

  try {
    const parsed = new URL(trimmed);
    if (INTERNAL_FILE_PATH_RE.test(parsed.pathname)) {
      return toFinal(parsed.pathname, parsed.search);
    }
    return trimmed;
  } catch {
    return trimmed;
  }
};

export const normalizeMediaArray = (
  req: FileUrlRequestLike,
  values?: string[] | null,
): string[] => {
  if (!Array.isArray(values)) return [];
  return values.map((entry) => normalizeStoredFileUrl(req, entry));
};
