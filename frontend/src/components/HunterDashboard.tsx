import { useState, useEffect, type MouseEvent } from 'react';
import { toast } from 'sonner';
import { UserProfile } from '../App';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Pagination, usePagination } from '@/components/ui/pagination';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faHome, faBuilding, faHotel, faBookmark, faHeart } from '@fortawesome/free-solid-svg-icons';
import { Loader2 } from 'lucide-react';
import { useAvailableProperties } from '../lib/queries';
import {
  getLikedPropertyIds,
  getSavedForLaterIds,
  SAVED_LISTINGS_EVENT,
  toggleLikedProperty,
  toggleSavedForLater,
} from '../lib/savedListings';
import ListingCard from './listings/ListingCard';
import ListingDialog from './listings/ListingDialog';
import type { Listing } from './listings/types';
import { searchListings } from '../../../shared/listingSearch';

const PROPERTY_FILTERS = [
  { id: 'all', label: 'All', icon: faHome },
  { id: 'residential', label: 'Homes', icon: faHome },
  { id: 'commercial', label: 'Commercial', icon: faBuilding },
  { id: 'bnb', label: 'Short stays', icon: faHotel },
] as const;

export default function HunterDashboard({
  profile,
  onLoginRequired,
  activeTab,
  setActiveTab,
  variant = 'default',
  externalSearchTerm,
  onExternalSearchChange,
}: {
  profile: UserProfile | null;
  onLoginRequired?: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  variant?: 'default' | 'embedded';
  externalSearchTerm?: string;
  onExternalSearchChange?: (v: string) => void;
}) {
  const { data: availableProperties, isPending: loading, error: propertiesError } = useAvailableProperties();
  const properties = (availableProperties ?? []) as Listing[];
  useEffect(() => {
    if (propertiesError) console.error('Failed to load available properties:', propertiesError);
  }, [propertiesError]);

  const [_internalSearchTerm, _setInternalSearchTerm] = useState('');
  const searchTerm = externalSearchTerm !== undefined ? externalSearchTerm : _internalSearchTerm;
  const setSearchTerm = onExternalSearchChange !== undefined ? onExternalSearchChange : _setInternalSearchTerm;
  const filterType = activeTab === 'dashboard' || activeTab === 'all' || !activeTab ? 'all' : activeTab;
  const setFilterType = setActiveTab;
  const [selected, setSelected] = useState<Listing | null>(null);

  const [savedIds, setSavedIds] = useState<Set<string>>(() => getSavedForLaterIds());
  const [likedIds, setLikedIds] = useState<Set<string>>(() => getLikedPropertyIds(profile?.uid));

  useEffect(() => {
    setLikedIds(getLikedPropertyIds(profile?.uid));
  }, [profile?.uid]);

  useEffect(() => {
    const sync = () => {
      setSavedIds(getSavedForLaterIds());
      setLikedIds(getLikedPropertyIds(profile?.uid));
    };
    window.addEventListener(SAVED_LISTINGS_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(SAVED_LISTINGS_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [profile?.uid]);

  const handleToggleSave = (e: MouseEvent, id: string) => {
    e.stopPropagation();
    const { saved, next } = toggleSavedForLater(id);
    setSavedIds(next);
    toast.success(saved ? 'Saved for later — no account needed' : 'Removed from saved');
  };

  const handleToggleLike = (e: MouseEvent, id: string) => {
    e.stopPropagation();
    if (!profile) {
      toast.info('Sign in or create an account to like houses. Use the bookmark icon to save for later without an account.');
      onLoginRequired?.();
      return;
    }
    const { liked, next } = toggleLikedProperty(profile.uid, id);
    setLikedIds(next);
    toast.success(liked ? 'Added to your liked houses' : 'Removed from liked houses');
  };

  const ofType = properties.filter((p) => {
    if (filterType === 'all') return true;
    if (filterType === 'saved') return savedIds.has(p.id);
    if (filterType === 'liked') return likedIds.has(p.id);
    return p.type === filterType;
  });

  const filteredProperties = searchTerm.trim()
    ? searchListings(ofType, searchTerm).map((result) => result.listing)
    : [...ofType].sort(
        (a, b) =>
          Number(likedIds.has(b.id)) - Number(likedIds.has(a.id)) ||
          Number(savedIds.has(b.id)) - Number(savedIds.has(a.id)),
      );

  const listingsPager = usePagination(filteredProperties, 12);

  const searchInput = (
    <div data-tour="hunter-search" className="relative group w-full">
      <FontAwesomeIcon
        icon={faSearch}
        className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 group-focus-within:text-slate-900 dark:group-focus-within:text-white transition-colors"
      />
      <Input
        placeholder="Search by area, bedrooms, or budget"
        className="h-10 pl-9 sm:pl-10 pr-4 rounded-xl text-xs font-medium"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />
    </div>
  );

  const filterChips = (
    <div data-tour="hunter-filters" className="no-scrollbar flex gap-1.5 overflow-x-auto pb-0.5">
      {PROPERTY_FILTERS.map((f) => (
        <button
          key={f.id}
          type="button"
          onClick={() => setFilterType(f.id)}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
            filterType === f.id
              ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950'
              : 'border border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-950 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300'
          }`}
        >
          <FontAwesomeIcon icon={f.icon} className="h-3 w-3" />
          {f.label}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setFilterType('saved')}
        className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
          filterType === 'saved'
            ? 'bg-[#5B21B6] text-white'
            : 'border border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-950 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300'
        }`}
      >
        <FontAwesomeIcon icon={faBookmark} className="h-3 w-3" />
        Saved{savedIds.size > 0 ? ` (${savedIds.size})` : ''}
      </button>
      {profile && (
        <button
          type="button"
          onClick={() => setFilterType('liked')}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
            filterType === 'liked'
              ? 'bg-rose-600 text-white'
              : 'border border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-950 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300'
          }`}
        >
          <FontAwesomeIcon icon={faHeart} className="h-3 w-3" />
          Liked{likedIds.size > 0 ? ` (${likedIds.size})` : ''}
        </button>
      )}
    </div>
  );

  return (
    <div className={`db w-full min-w-0 animate-in fade-in duration-300 ${variant === 'embedded' ? 'pb-8' : 'pb-24 sm:pb-8'}`}>
      {variant === 'embedded' ? (
        <div className="listing-sticky-bar sticky z-20 -mx-2 bg-white/95 px-3 py-3 backdrop-blur-md dark:bg-zinc-950/95 sm:-mx-0 sm:top-0 sm:rounded-2xl sm:border sm:border-zinc-200/80 sm:px-4 sm:py-3.5 dark:sm:border-zinc-800">
          {searchInput}
          <div className="mt-2.5">{filterChips}</div>
          <p className="mt-2 text-xs font-medium text-zinc-400">
            {loading
              ? 'Loading homes…'
              : `${filteredProperties.length} ${filteredProperties.length === 1 ? 'place' : 'places'}${
                  filterType === 'saved' ? ' saved for later' : filterType === 'liked' ? ' liked' : ''
                }`}
          </p>
        </div>
      ) : (
        <div className="border-b border-zinc-200/80 bg-white px-4 py-4 dark:border-white/[0.08] dark:bg-[#181922] sm:px-6 sm:py-6 md:px-8">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                {filteredProperties.length} {filteredProperties.length === 1 ? 'place' : 'places'} available
              </p>
              <h1 className="text-xl font-bold tracking-tight text-zinc-950 dark:text-white sm:text-2xl md:text-3xl">
                Find a place
              </h1>
            </div>
            <div className="w-full shrink-0 md:w-80">{searchInput}</div>
          </div>
          <div className="mt-3">{filterChips}</div>
        </div>
      )}

      <div data-tour="hunter-grid" className={`mt-4 sm:mt-6 ${variant === 'embedded' ? 'px-1 sm:px-4' : 'px-3 sm:px-6 md:px-8'}`}>
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
            <p className="text-xs font-medium text-zinc-400">Loading homes…</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:gap-x-5 sm:gap-y-8 lg:grid-cols-3 xl:grid-cols-4">
              {listingsPager.pageItems.map((property) => (
                <ListingCard
                  key={property.id}
                  listing={property}
                  liked={likedIds.has(property.id)}
                  saved={savedIds.has(property.id)}
                  onToggleLike={handleToggleLike}
                  onToggleSave={handleToggleSave}
                  onOpen={setSelected}
                />
              ))}
            </div>
            <div className="mt-6">
              <Pagination
                page={listingsPager.page}
                pageCount={listingsPager.pageCount}
                total={listingsPager.total}
                pageSize={listingsPager.pageSize}
                onPageChange={listingsPager.setPage}
                label="listings"
              />
            </div>
          </>
        )}

        {filteredProperties.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-100 text-zinc-400 dark:bg-zinc-800">
              <FontAwesomeIcon icon={filterType === 'saved' ? faBookmark : filterType === 'liked' ? faHeart : faSearch} className="h-4 w-4" />
            </div>
            {filterType === 'saved' ? (
              <>
                <h3 className="mb-1 text-base font-bold text-zinc-950 dark:text-white">No saved houses yet</h3>
                <p className="max-w-xs text-xs text-zinc-500">Tap the bookmark icon on any listing to save it for later — no account needed.</p>
                <Button variant="outline" size="sm" className="mt-4 rounded-xl text-xs font-semibold" onClick={() => setFilterType('all')}>
                  Browse all homes
                </Button>
              </>
            ) : filterType === 'liked' ? (
              <>
                <h3 className="mb-1 text-base font-bold text-zinc-950 dark:text-white">No liked houses yet</h3>
                <p className="max-w-xs text-xs text-zinc-500">Tap the heart icon on any listing to add it to your favorites.</p>
                <Button variant="outline" size="sm" className="mt-4 rounded-xl text-xs font-semibold" onClick={() => setFilterType('all')}>
                  Browse all homes
                </Button>
              </>
            ) : searchTerm || filterType !== 'all' ? (
              <>
                <h3 className="mb-1 text-base font-bold text-zinc-950 dark:text-white">Nothing matches your search</h3>
                <p className="max-w-xs text-xs text-zinc-500">Try another area or clear the filters.</p>
                <Button variant="outline" size="sm" className="mt-4 rounded-xl text-xs font-semibold" onClick={() => { setSearchTerm(''); setFilterType('all'); }}>
                  Clear filters
                </Button>
              </>
            ) : (
              <>
                <h3 className="mb-1 text-base font-bold text-zinc-950 dark:text-white">No listings yet</h3>
                <p className="max-w-xs text-xs text-zinc-500">New homes and spaces appear here as soon as landlords publish them.</p>
              </>
            )}
          </div>
        )}
      </div>

      <ListingDialog
        listing={selected}
        onClose={() => setSelected(null)}
        liked={selected ? likedIds.has(selected.id) : false}
        saved={selected ? savedIds.has(selected.id) : false}
        onToggleLike={handleToggleLike}
        onToggleSave={handleToggleSave}
        prefill={profile ? { name: profile.displayName, email: profile.email, phone: profile.phone } : undefined}
      />

      {/* Mobile Bottom Navigation Bar for signed-in hunters */}
      {profile && variant !== 'embedded' && (
        <nav className="sm:hidden mobile-bottom-nav fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-200/80 bg-white/95 backdrop-blur-md dark:border-white/[0.08] dark:bg-[#181922]/95">
          <div className="flex h-15 items-center justify-around px-1">
            {[
              ...PROPERTY_FILTERS,
              { id: 'saved', label: 'Saved', icon: faBookmark },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                data-tour={`nav-${f.id}`}
                onClick={() => {
                  setFilterType(f.id);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={`flex h-full flex-1 flex-col items-center justify-center gap-0.5 rounded-xl transition-colors ${
                  filterType === f.id
                    ? 'font-semibold text-[#5B21B6] dark:text-violet-300'
                    : 'text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                }`}
              >
                <span className={`flex h-7 w-9 items-center justify-center rounded-lg transition ${filterType === f.id ? 'bg-violet-600/10 dark:bg-violet-500/20' : ''}`}>
                  <FontAwesomeIcon icon={f.icon} className="text-xs" />
                </span>
                <span className="text-[10px] font-medium">{f.label}</span>
              </button>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
