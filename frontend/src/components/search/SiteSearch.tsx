import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { MapPin, Search, X } from 'lucide-react';
import { matchingLocations, searchListings } from '../../../../shared/listingSearch';
import { useAvailableProperties } from '../../lib/queries';
import ListingDialog from '../listings/ListingDialog';
import { formatKes, priceUnit, TYPE_LABELS, type Listing } from '../listings/types';

const SUGGESTIONS = ['Kilimani', 'Westlands', '2 bedroom', 'Bedsitter under 15k', 'Office', 'Short stay'];
const MAX_RESULTS = 8;

/** Ask the landing page to show the full filtered list (it listens for this event). */
export const SEARCH_EVENT = 'myboma:search';

export function showAllResults(query: string) {
  if (window.location.pathname === '/') {
    window.dispatchEvent(new CustomEvent(SEARCH_EVENT, { detail: query }));
  } else {
    window.location.href = `/?q=${encodeURIComponent(query)}#homes`;
  }
}

interface SiteSearchProps {
  open: boolean;
  onClose: () => void;
}

export default function SiteSearch({ open, onClose }: SiteSearchProps) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [selected, setSelected] = useState<Listing | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { data, isPending } = useAvailableProperties();
  const listings = (Array.isArray(data) ? data : []) as Listing[];

  const results = useMemo(() => (query.trim() ? searchListings(listings, query) : []), [listings, query]);
  const areas = useMemo(() => matchingLocations(listings, query), [listings, query]);
  const visible = results.slice(0, MAX_RESULTS);

  useEffect(() => {
    if (!open) return;
    setActive(0);
    const timer = setTimeout(() => inputRef.current?.focus(), 30);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => setActive(0), [query]);

  const openListing = (listing: Listing) => {
    setSelected(listing);
  };

  const submitAll = (value = query) => {
    if (!value.trim()) return;
    onClose();
    showAllResults(value.trim());
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') onClose();
    else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, Math.max(visible.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (visible[active]) openListing(visible[active].listing);
      else submitAll();
    }
  };

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-[60] flex justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200 sm:items-start sm:px-4 sm:pt-24" onClick={onClose}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Search homes"
            onClick={(event) => event.stopPropagation()}
            className="flex h-full w-full flex-col bg-white animate-in slide-in-from-top-4 duration-300 sm:h-auto sm:max-h-[70vh] sm:max-w-2xl sm:rounded-3xl sm:shadow-2xl"
          >
            <div className="flex items-center gap-3 border-b border-zinc-200 px-4 py-3 pt-[calc(0.75rem+var(--sat,0px))] sm:pt-3">
              <Search className="h-5 w-5 shrink-0 text-zinc-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search an area, building or type of home"
                aria-label="Search homes"
                className="h-11 w-full bg-transparent text-base text-zinc-950 placeholder:text-zinc-400 focus:outline-none"
              />
              <button type="button" onClick={onClose} aria-label="Close search" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-950">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain p-2">
              {!query.trim() && (
                <div className="p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Try</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {SUGGESTIONS.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => setQuery(suggestion)}
                        className="rounded-full border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 transition hover:border-zinc-950 hover:text-zinc-950"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {query.trim() && areas.length > 0 && (
                <div className="px-2 pb-1 pt-2">
                  <p className="px-1 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Areas</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {areas.map((area) => (
                      <button
                        key={area}
                        type="button"
                        onClick={() => submitAll(area.split(',')[0])}
                        className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1.5 text-sm text-zinc-800 transition hover:bg-zinc-950 hover:text-white"
                      >
                        <MapPin className="h-3.5 w-3.5" />
                        {area}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {query.trim() && (
                <ul className="mt-2" role="listbox" aria-label="Matching homes">
                  {visible.map(({ listing }, index) => (
                    <li key={listing.id} role="option" aria-selected={index === active}>
                      <button
                        type="button"
                        onMouseEnter={() => setActive(index)}
                        onClick={() => openListing(listing)}
                        className={`flex w-full items-center gap-3 rounded-2xl p-2 text-left transition ${index === active ? 'bg-zinc-100' : ''}`}
                      >
                        <span className="h-14 w-20 shrink-0 overflow-hidden rounded-xl bg-zinc-100">
                          {listing.images?.[0] && (
                            <img src={listing.images[0]} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-zinc-950">{listing.title}</span>
                          <span className="block truncate text-xs text-zinc-500">
                            {listing.location} · {TYPE_LABELS[listing.type]}
                          </span>
                        </span>
                        <span className="shrink-0 text-right text-sm font-semibold tabular-nums text-zinc-950">
                          {formatKes(listing.price)}
                          <span className="block text-xs font-normal text-zinc-500">/{priceUnit(listing.type)}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {query.trim() && !isPending && results.length === 0 && (
                <p className="px-4 py-10 text-center text-sm text-zinc-500">
                  No homes match "{query.trim()}". Try an area name like Kilimani or Westlands.
                </p>
              )}
              {isPending && listings.length === 0 && <p className="px-4 py-10 text-center text-sm text-zinc-500">Loading homes…</p>}
            </div>

            {results.length > 0 && (
              <div className="border-t border-zinc-200 p-3">
                <button
                  type="button"
                  onClick={() => submitAll()}
                  className="h-11 w-full rounded-xl bg-zinc-950 text-sm font-semibold text-white transition hover:bg-zinc-800"
                >
                  Show all {results.length} {results.length === 1 ? 'result' : 'results'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      <ListingDialog listing={selected} onClose={() => setSelected(null)} />
    </>
  );
}
