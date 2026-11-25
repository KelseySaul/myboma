import { useState, useEffect } from 'react';
import { UserProfile } from '../App';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Pagination, usePagination } from '@/components/ui/pagination';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faHome, faBuilding, faHotel } from '@fortawesome/free-solid-svg-icons';
import { Loader2 } from 'lucide-react';
import { useAvailableProperties } from '../lib/queries';
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
  // Polls the public available-listings endpoint (shared TanStack Query cache).
  const { data: availableProperties, isPending: loading, error: propertiesError } = useAvailableProperties();
  const properties = (availableProperties ?? []) as Listing[];
  useEffect(() => {
    if (propertiesError) console.error('Failed to load available properties:', propertiesError);
  }, [propertiesError]);
  const [_internalSearchTerm, _setInternalSearchTerm] = useState('');
  const searchTerm = externalSearchTerm !== undefined ? externalSearchTerm : _internalSearchTerm;
  const setSearchTerm = onExternalSearchChange !== undefined ? onExternalSearchChange : _setInternalSearchTerm;
  // 'dashboard' and 'all' both show all properties
  const filterType = (activeTab === 'dashboard' || activeTab === 'all' || !activeTab) ? 'all' : activeTab;
  const setFilterType = setActiveTab;
  const [selected, setSelected] = useState<Listing | null>(null);

  const [likedPropertyIds, setLikedPropertyIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('myboma_liked_properties');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });

  const toggleLike = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setLikedPropertyIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem('myboma_liked_properties', JSON.stringify(Array.from(next)));
      return next;
    });
  };


  // Same matching as the navbar search: areas, titles, amenities, typos, "2br", "under 50k".
  const ofType = properties.filter((p) => filterType === 'all' || p.type === filterType);
  const filteredProperties = searchTerm.trim()
    ? searchListings(ofType, searchTerm).map((result) => result.listing)
    : [...ofType].sort((a, b) => Number(likedPropertyIds.has(b.id)) - Number(likedPropertyIds.has(a.id)));
  const listingsPager = usePagination(filteredProperties, 12);

  const searchInput = (
    <div className="relative group w-full">
      <FontAwesomeIcon icon={faSearch} className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 group-focus-within:text-slate-900 dark:group-focus-within:text-white transition-colors" />
      <Input
        placeholder="Search by area or name"
        className="h-10 pl-9 sm:pl-10 pr-4 rounded-xl text-xs font-semibold"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />
    </div>
  );

  const filterChips = (
    <div className="flex gap-2 overflow-x-auto pb-0.5">
      {PROPERTY_FILTERS.map((f) => (
        <button
          key={f.id}
          type="button"
          onClick={() => setFilterType(f.id)}
          className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all cursor-pointer ${
            filterType === f.id
              ? 'bg-gradient-to-r from-violet-700 via-purple-600 to-fuchsia-600 text-white shadow-xs shadow-violet-700/25'
              : 'bg-white dark:bg-[#181922] border border-[#D5D2E3] dark:border-white/12 text-[#5D5A73] dark:text-slate-300 hover:border-violet-300 hover:bg-[#F8F7FC]'
          }`}
        >
          <FontAwesomeIcon icon={f.icon} className="h-3 w-3" />
          {f.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className={`db w-full min-w-0 animate-in fade-in duration-300 ${variant === 'embedded' ? 'pb-8' : 'pb-24 sm:pb-8'}`}>
      {variant === 'embedded' ? (
        <div className="listing-sticky-bar sticky z-20 -mx-2 bg-white/95 px-4 py-3.5 backdrop-blur-md dark:bg-zinc-950/95 sm:-mx-0 sm:top-0 sm:rounded-2xl sm:border sm:border-zinc-200/80 sm:shadow-xs dark:sm:border-zinc-800">
          {searchInput}
          <div className="mt-2.5">{filterChips}</div>
          <p className="mt-2 text-xs font-semibold text-slate-400">
            {loading ? 'Loading homes…' : `${filteredProperties.length} ${filteredProperties.length === 1 ? 'place' : 'places'}`}
          </p>
        </div>
      ) : (
        <div className="p-6 md:p-8 bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <p className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                {filteredProperties.length} {filteredProperties.length === 1 ? 'place' : 'places'} available
              </p>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                Find a place
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Homes, commercial spaces and short stays.
              </p>
            </div>
            <div className="w-full md:w-80 shrink-0">
              {searchInput}
            </div>
          </div>
          <div className="mt-4">{filterChips}</div>
        </div>
      )}

      <div className={`mt-6 ${variant === 'embedded' ? 'px-1 sm:px-4' : 'px-6 md:px-8'}`}>
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
            <p className="text-xs font-medium text-zinc-400">Loading homes…</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:gap-x-5 sm:gap-y-8 lg:grid-cols-3 xl:grid-cols-4">
              {listingsPager.pageItems.map((property) => (
                <ListingCard
                  key={property.id}
                  listing={property}
                  liked={likedPropertyIds.has(property.id)}
                  onToggleLike={toggleLike}
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
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="h-12 w-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-4">
              <FontAwesomeIcon icon={faSearch} className="h-5 w-5" />
            </div>
            {searchTerm || filterType !== 'all' ? (
              <>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">Nothing matches your search</h3>
                <p className="text-xs text-slate-500 max-w-xs">Try another area or clear the filters.</p>
                <Button variant="outline" size="sm" className="mt-4 text-xs font-semibold rounded-xl" onClick={() => {setSearchTerm(''); setFilterType('all');}}>Clear filters</Button>
              </>
            ) : (
              <>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">No listings yet</h3>
                <p className="text-xs text-slate-500 max-w-xs">New homes and spaces appear here as soon as landlords publish them. Check back soon.</p>
              </>
            )}
          </div>
        )}
      </div>

      <ListingDialog
        listing={selected}
        onClose={() => setSelected(null)}
        prefill={profile ? { name: profile.displayName, email: profile.email, phone: profile.phone } : undefined}
      />

      {/* Mobile Bottom Navigation Bar */}
      {profile && variant !== 'embedded' && (
        <nav className="sm:hidden mobile-bottom-nav fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#181922]/95 border-t border-[#221844]/[0.08] dark:border-white/[0.08] shadow-lg">
          <div className="flex items-center justify-around h-15 px-2">
            {PROPERTY_FILTERS.map(f => (
              <button
                key={f.id}
                onClick={() => {
                  setFilterType(f.id);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full rounded-xl transition-all ${
                  filterType === f.id
                    ? 'text-violet-700 dark:text-violet-300 font-bold'
                    : 'text-[#8A86A1] hover:text-[#161426]'
                }`}
              >
                <span className={`flex h-7 w-9 items-center justify-center rounded-xl transition ${filterType === f.id ? 'bg-violet-600/12 dark:bg-violet-500/20' : ''}`}>
                  <FontAwesomeIcon icon={f.icon} className="text-xs" />
                </span>
                <span className="text-[10px] font-semibold">{f.label}</span>
              </button>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
