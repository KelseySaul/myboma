import {useState, type KeyboardEvent, type MouseEvent} from 'react';
import { Heart, Home, MapPin } from 'lucide-react';
import { TYPE_LABELS, formatKes, type Listing } from './types';

interface ListingCardProps {
  listing: Listing;
  liked: boolean;
  onToggleLike: (event: MouseEvent, id: string) => void;
  onOpen: (listing: Listing) => void;
}

export default function ListingCard({ listing, liked, onToggleLike, onOpen }: ListingCardProps) {
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
            src={listing.images[0]}
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

        <button
          type="button"
          aria-label={liked ? 'Remove from saved' : 'Save'}
          aria-pressed={liked}
          onClick={(event) => onToggleLike(event, listing.id)}
          onKeyDown={(event) => event.stopPropagation()}
          className={`absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full shadow-sm backdrop-blur-md transition sm:right-3 sm:top-3 ${
            liked ? 'bg-white text-zinc-950' : 'bg-black/35 text-white hover:bg-white hover:text-zinc-950'
          }`}
        >
          <Heart className="h-4 w-4" fill={liked ? 'currentColor' : 'none'} />
        </button>
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
