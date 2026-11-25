import {useState, type KeyboardEvent, type MouseEvent} from 'react';
import { Bookmark, Heart, Home, MapPin } from 'lucide-react';
import { resolveMediaUrl } from '../../lib/fileUrl';
import { TYPE_LABELS, formatKes, type Listing } from './types';

interface ListingCardProps {
  listing: Listing;
  liked: boolean;
  saved: boolean;
  onToggleLike: (event: MouseEvent, id: string) => void;
  onToggleSave: (event: MouseEvent, id: string) => void;
  onOpen: (listing: Listing) => void;
}

export default function ListingCard({ listing, liked, saved, onToggleLike, onToggleSave, onOpen }: ListingCardProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const open = () => onOpen(listing);
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open();
    }
  };

  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={`${listing.title}, ${listing.location}, ${formatKes(listing.price)}`}
      onClick={open}
      onKeyDown={onKeyDown}
      className="group flex cursor-pointer flex-col rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 dark:focus-visible:ring-white"
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl bg-zinc-100 dark:bg-zinc-800 sm:aspect-[4/3]">
        {listing.images?.[0] && !imageFailed ? (
          <img
            src={resolveMediaUrl(listing.images[0])}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-300">
            <Home className="h-8 w-8" />
          </div>
        )}

        <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-semibold text-zinc-900 shadow-sm sm:left-3 sm:top-3 sm:px-2.5 sm:py-1 sm:text-[11px]">
          {TYPE_LABELS[listing.type] ?? listing.type}
        </span>

        {/* Dual action buttons: Save for later (no account needed) + Like (account required) */}
        <div className="absolute right-2 top-2 flex items-center gap-1.5 sm:right-3 sm:top-3">
          <button
            type="button"
            title={saved ? 'Saved for later' : 'Save for later (no account needed)'}
            aria-label={saved ? 'Remove from saved for later' : 'Save for later'}
            aria-pressed={saved}
            onClick={(event) => onToggleSave(event, listing.id)}
            onKeyDown={(event) => event.stopPropagation()}
            className={`flex h-8 w-8 items-center justify-center rounded-full shadow-sm backdrop-blur-md transition ${
              saved
                ? 'bg-white text-[#5B21B6]'
                : 'bg-black/35 text-white hover:bg-white hover:text-zinc-950'
            }`}
          >
            <Bookmark className="h-3.5 w-3.5" fill={saved ? 'currentColor' : 'none'} />
          </button>

          <button
            type="button"
            title={liked ? 'Liked' : 'Like (requires account)'}
            aria-label={liked ? 'Unlike house' : 'Like house'}
            aria-pressed={liked}
            onClick={(event) => onToggleLike(event, listing.id)}
            onKeyDown={(event) => event.stopPropagation()}
            className={`flex h-8 w-8 items-center justify-center rounded-full shadow-sm backdrop-blur-md transition ${
              liked
                ? 'bg-white text-rose-600'
                : 'bg-black/35 text-white hover:bg-white hover:text-rose-600'
            }`}
          >
            <Heart className="h-3.5 w-3.5" fill={liked ? 'currentColor' : 'none'} />
          </button>
        </div>
      </div>

      <div className="px-0.5 pt-2.5 sm:pt-3">
        <p className="text-sm font-bold tabular-nums text-zinc-950 dark:text-white sm:text-base">
          {formatKes(listing.price)}
          <span className="ml-1 text-xs font-normal text-zinc-500">/{listing.type === 'bnb' ? 'night' : 'mo'}</span>
        </p>
        <h3 className="mt-0.5 line-clamp-1 text-[13px] font-medium text-zinc-800 dark:text-zinc-200 sm:text-sm">{listing.title}</h3>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">{listing.location}</span>
        </p>
        {listing.amenities?.length > 0 && (
          <p className="mt-1.5 hidden line-clamp-1 text-xs text-zinc-400 sm:block">
            {listing.amenities.slice(0, 3).join(' · ')}
          </p>
        )}
      </div>
    </article>
  );
}
