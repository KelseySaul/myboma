const SAVED_FOR_LATER_KEY = 'myboma_saved_for_later_v1';
const LIKED_KEY = (uid: string) => `myboma_liked_properties_${uid}`;
export const SAVED_LISTINGS_EVENT = 'myboma:saved-listings-changed';

function readIdSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((v): v is string => typeof v === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

function writeIdSet(key: string, ids: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify(Array.from(ids)));
  } catch {
    /* ignore storage quota errors */
  }
  window.dispatchEvent(new CustomEvent(SAVED_LISTINGS_EVENT));
}

/** Guest-friendly "Save for later" bookmarks — works without an account. */
export function getSavedForLaterIds(): Set<string> {
  return readIdSet(SAVED_FOR_LATER_KEY);
}

export function toggleSavedForLater(id: string): { saved: boolean; next: Set<string> } {
  const next = readIdSet(SAVED_FOR_LATER_KEY);
  let saved = false;
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
    saved = true;
  }
  writeIdSet(SAVED_FOR_LATER_KEY, next);
  return { saved, next };
}

/** Account-only Likes — strictly scoped to an authenticated user ID. */
export function getLikedPropertyIds(uid?: string | null): Set<string> {
  if (!uid) return new Set();
  return readIdSet(LIKED_KEY(uid));
}

export function toggleLikedProperty(uid: string, id: string): { liked: boolean; next: Set<string> } {
  const key = LIKED_KEY(uid);
  const next = readIdSet(key);
  let liked = false;
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
    liked = true;
  }
  writeIdSet(key, next);
  return { liked, next };
}
