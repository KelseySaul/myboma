/**
 * Listing search used by the navbar search and the listings filter.
 *
 * A query is split into words. Words that describe a property type ("office", "bnb"),
 * a price cap ("under 50k") or bedrooms ("2br", "3 bedroom") become filters; every other
 * word must match the listing's location, title, amenities or description. Matching
 * accepts whole words, word prefixes ("kili" -> Kilimani) and one typo in longer words.
 */

export type SearchableType = 'residential' | 'commercial' | 'bnb';

export interface SearchableListing {
  id: string;
  title: string;
  location: string;
  description?: string | null;
  amenities?: string[] | null;
  type: SearchableType;
  price: number | string;
}

export interface ParsedQuery {
  terms: string[];
  type: SearchableType | null;
  maxPrice: number | null;
  bedrooms: number | null;
}

const TYPE_WORDS: Record<string, SearchableType> = {
  office: 'commercial',
  offices: 'commercial',
  commercial: 'commercial',
  shop: 'commercial',
  shops: 'commercial',
  warehouse: 'commercial',
  bnb: 'bnb',
  airbnb: 'bnb',
  holiday: 'bnb',
  vacation: 'bnb',
};

/** Words that carry no meaning for matching ("a house in Kilimani"). */
const STOP_WORDS = new Set(['a', 'an', 'the', 'in', 'at', 'near', 'for', 'to', 'of', 'and', 'with', 'rent', 'rental', 'to-let', 'house', 'houses', 'home', 'homes']);

/** Spelling variants people use for the same thing. */
const SYNONYMS: Record<string, string[]> = {
  bedsitter: ['bedsitter', 'studio', 'single'],
  studio: ['studio', 'bedsitter'],
  apartment: ['apartment', 'flat'],
  flat: ['flat', 'apartment'],
  maisonette: ['maisonette', 'townhouse'],
  bungalow: ['bungalow'],
  wifi: ['wifi', 'wi-fi', 'internet'],
  parking: ['parking', 'garage'],
  pool: ['pool', 'swimming'],
};

export const normalize = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/wi-fi/g, 'wifi')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const parseAmount = (raw: string): number | null => {
  const match = /^(\d+(?:\.\d+)?)(k|m)?$/.exec(raw);
  if (!match) return null;
  const base = Number(match[1]);
  return match[2] === 'k' ? base * 1_000 : match[2] === 'm' ? base * 1_000_000 : base;
};

export function parseQuery(query: string): ParsedQuery {
  // "kes 50,000" / "50,000" -> "50000" before normalising strips the comma.
  const words = normalize(query.replace(/(\d),(?=\d{3})/g, '$1')).split(' ').filter(Boolean);
  const parsed: ParsedQuery = { terms: [], type: null, maxPrice: null, bedrooms: null };

  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    const next = words[i + 1];

    if ((word === 'under' || word === 'below' || word === 'max' || word === 'upto') && next) {
      const amount = parseAmount(next === 'kes' || next === 'ksh' ? words[i + 2] ?? '' : next);
      if (amount !== null) {
        parsed.maxPrice = amount;
        i += next === 'kes' || next === 'ksh' ? 2 : 1;
        continue;
      }
    }
    if (word === 'kes' || word === 'ksh') continue;

    const bedroomInline = /^(\d)(?:br|bed|beds|bedroom|bedrooms)$/.exec(word);
    if (bedroomInline) {
      parsed.bedrooms = Number(bedroomInline[1]);
      continue;
    }
    if (/^\d$/.test(word) && next && /^(br|bed|beds|bedroom|bedrooms|bedroomed)$/.test(next)) {
      parsed.bedrooms = Number(word);
      i += 1;
      continue;
    }

    if (word === 'short' && next === 'stay' || word === 'short' && next === 'stays') {
      parsed.type = 'bnb';
      i += 1;
      continue;
    }
    if (TYPE_WORDS[word]) {
      parsed.type = TYPE_WORDS[word];
      continue;
    }
    if (STOP_WORDS.has(word)) continue;

    parsed.terms.push(word);
  }
  return parsed;
}

/** Levenshtein distance capped at 2 (enough to tell "one typo" from "different word"). */
function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 1) return 2;
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      rowMin = Math.min(rowMin, current[j]);
    }
    if (rowMin > 1) return 2;
    previous = current;
  }
  return previous[b.length];
}

/** 3 = exact word, 2 = word starts with the term, 1 = one typo, 0 = no match. */
function matchWord(term: string, word: string): number {
  if (word === term) return 3;
  if (term.length >= 2 && word.startsWith(term)) return 2;
  if (term.length >= 5 && editDistance(term, word) <= 1) return 1;
  return 0;
}

const FIELD_WEIGHTS = { location: 5, title: 4, amenities: 2, description: 1 } as const;
type Field = keyof typeof FIELD_WEIGHTS;

function fieldWords(listing: SearchableListing): Record<Field, string[]> {
  return {
    location: normalize(listing.location).split(' '),
    title: normalize(listing.title).split(' '),
    amenities: normalize((listing.amenities ?? []).join(' ')).split(' '),
    description: normalize(listing.description ?? '').split(' '),
  };
}

const bedroomsOf = (listing: SearchableListing): number | null => {
  const text = normalize(`${listing.title} ${listing.description ?? ''}`);
  const match = /\b(\d)\s?(?:br|bed|beds|bedroom|bedrooms|bedroomed)\b/.exec(text);
  return match ? Number(match[1]) : null;
};

/** Best score for one search term across all fields, or 0 if the term is not found. */
function scoreTerm(term: string, words: Record<Field, string[]>): number {
  const variants = SYNONYMS[term] ?? [term];
  let best = 0;
  for (const variant of variants) {
    for (const field of Object.keys(FIELD_WEIGHTS) as Field[]) {
      for (const word of words[field]) {
        const quality = matchWord(variant, word);
        if (quality) best = Math.max(best, quality * FIELD_WEIGHTS[field]);
      }
    }
  }
  return best;
}

export interface SearchResult<T> {
  listing: T;
  score: number;
}

export function searchListings<T extends SearchableListing>(listings: T[], query: string): SearchResult<T>[] {
  const parsed = parseQuery(query);
  const results: SearchResult<T>[] = [];

  for (const listing of listings) {
    if (parsed.type && listing.type !== parsed.type) continue;
    if (parsed.maxPrice !== null && Number(listing.price) > parsed.maxPrice) continue;
    if (parsed.bedrooms !== null && bedroomsOf(listing) !== parsed.bedrooms) continue;

    const words = fieldWords(listing);
    let score = 1;
    let matchedAll = true;
    for (const term of parsed.terms) {
      const termScore = scoreTerm(term, words);
      if (!termScore) {
        matchedAll = false;
        break;
      }
      score += termScore;
    }
    if (matchedAll) results.push({ listing, score });
  }

  return results.sort((a, b) => b.score - a.score || Number(a.listing.price) - Number(b.listing.price));
}

/** Distinct locations that match the query, for "areas" suggestions. */
export function matchingLocations(listings: SearchableListing[], query: string, limit = 4): string[] {
  const { terms } = parseQuery(query);
  if (!terms.length) return [];
  const seen = new Map<string, number>();
  for (const listing of listings) {
    const words = normalize(listing.location).split(' ');
    const ok = terms.every((term) => words.some((word) => matchWord(term, word)));
    if (ok) seen.set(listing.location, (seen.get(listing.location) ?? 0) + 1);
  }
  return [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([location]) => location);
}
