import { useState, useEffect, useMemo } from 'react';
import { getAvailableProperties, getLandlordPublicContact, createBooking } from '../lib/api';
import { UserProfile } from '../App';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faSearch, 
  faMapMarkerAlt, 
  faHome, 
  faBuilding, 
  faHotel, 
  faCalendarAlt, 
  faChevronLeft, 
  faChevronRight, 
  faInfoCircle, 
  faUser, 
  faPhone, 
  faEnvelope, 
  faWallet, 
  faSpinner,
  faFilter,
  faBolt,
  faTag,
  faStar,
  faWifi,
  faSwimmingPool,
  faWater,
  faTint
} from '@fortawesome/free-solid-svg-icons';
import { logAudit } from '../lib/audit';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { differenceInDays, parseISO, format } from 'date-fns';
import { faHeart } from '@fortawesome/free-solid-svg-icons';

interface Property {
  id: string;
  landlordId: string;
  platformId?: string;
  title: string;
  description: string;
  type: 'residential' | 'commercial' | 'bnb';
  price: number;
  location: string;
  images: string[];
  status: 'available' | 'rented' | 'booked';
  amenities: string[];
  createdAt?: string;
}

const getAmenityIcon = (name: string) => {
  const lower = name.toLowerCase();
  if (lower.includes('wifi') || lower.includes('internet')) return faWifi;
  if (lower.includes('swim') || lower.includes('pool')) return faSwimmingPool;
  if (lower.includes('water')) return faTint;
  return faBolt;
};

const PROPERTY_FILTERS = [
  { id: 'all', label: 'All', icon: faHome },
  { id: 'residential', label: 'Homes', icon: faHome },
  { id: 'commercial', label: 'Commercial', icon: faBuilding },
  { id: 'bnb', label: 'BNB', icon: faHotel },
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
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [_internalSearchTerm, _setInternalSearchTerm] = useState('');
  const searchTerm = externalSearchTerm !== undefined ? externalSearchTerm : _internalSearchTerm;
  const setSearchTerm = onExternalSearchChange !== undefined ? onExternalSearchChange : _setInternalSearchTerm;
  // 'dashboard' and 'all' both show all properties
  const filterType = (activeTab === 'dashboard' || activeTab === 'all' || !activeTab) ? 'all' : activeTab;
  const setFilterType = setActiveTab;
  const [bookingDates, setBookingDates] = useState<{
    checkIn: string;
    checkOut: string;
  }>({
    checkIn: format(new Date(), 'yyyy-MM-dd'),
    checkOut: format(new Date(Date.now() + 86400000), 'yyyy-MM-dd'),
  });

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

  // Polls the public available-listings endpoint — replaces the old Supabase Realtime
  // subscription on properties where status=available.
  useEffect(() => {
    let isActive = true;

    const fetchProperties = async () => {
      try {
        const props = await getAvailableProperties();
        if (isActive) setProperties(props as Property[]);
      } catch (err) {
        console.error('Failed to load available properties:', err);
      } finally {
        if (isActive) setLoading(false);
      }
    };

    fetchProperties();
    const interval = setInterval(fetchProperties, 30000);

    return () => {
      isActive = false;
      clearInterval(interval);
    };
  }, []);

  const filteredProperties = properties
    .filter(p => 
      (p.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
       p.location.toLowerCase().includes(searchTerm.toLowerCase())) &&
      (filterType === 'all' || p.type === filterType)
    )
    .sort((a, b) => {
      const aLiked = likedPropertyIds.has(a.id);
      const bLiked = likedPropertyIds.has(b.id);
      if (aLiked && !bLiked) return -1;
      if (!aLiked && bLiked) return 1;
      return 0; // Already sorted by createdAt DESC from Supabase
    });

  const handleBook = async (property: Property) => {
    if (!profile) {
      toast.info("Sign in to make a secure booking.");
      onLoginRequired?.();
      return;
    }

    const totalPrice = property.type === 'bnb' 
      ? property.price * Math.max(1, differenceInDays(parseISO(bookingDates.checkOut), parseISO(bookingDates.checkIn)))
      : property.price;

    if (property.type === 'bnb') {
      const days = differenceInDays(parseISO(bookingDates.checkOut), parseISO(bookingDates.checkIn));
      if (days <= 0) {
        toast.error("Check-out date must be after check-in date");
        return;
      }
    }

    try {
      setPaying(true);

      // The server creates the booking and notifies the landlord in one step.
      await createBooking({
        propertyId: property.id,
        landlordId: property.landlordId,
        platformId: property.platformId,
        startDate: property.type === 'bnb' ? bookingDates.checkIn : new Date().toISOString().split('T')[0],
        endDate: property.type === 'bnb' ? bookingDates.checkOut : new Date(Date.now() + 86400000).toISOString().split('T')[0],
        totalPrice,
      });

      logAudit('BOOKING_CREATE', 'booking', property.id, { status: 'pending', totalPrice });
      toast.success('Booking request sent! The landlord will confirm after payment.');
    } catch (error) {
      console.error("Booking error:", error);
      toast.error("Failed to book property");
    } finally {
      setPaying(false);
    }
  };

  const BNBBookingForm = ({ property }: { property: Property }) => {
    const nights = useMemo(() => {
      const n = differenceInDays(parseISO(bookingDates.checkOut), parseISO(bookingDates.checkIn));
      return n > 0 ? n : 0;
    }, [bookingDates]);

    const totalPrice = nights * property.price;

    return (
      <div className="space-y-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 p-6 border border-zinc-100 dark:border-zinc-800">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Check-in</Label>
            <Input 
              className="h-12 rounded-xl bg-white dark:bg-zinc-900"
              type="date" 
              min={format(new Date(), 'yyyy-MM-dd')}
              value={bookingDates.checkIn}
              onChange={(e) => setBookingDates(prev => ({ ...prev, checkIn: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Check-out</Label>
            <Input 
              className="h-12 rounded-xl bg-white dark:bg-zinc-900"
              type="date" 
              min={bookingDates.checkIn}
              value={bookingDates.checkOut}
              onChange={(e) => setBookingDates(prev => ({ ...prev, checkOut: e.target.value }))}
            />
          </div>
        </div>
        
        {nights > 0 ? (
          <div className="pt-4 border-t border-zinc-200 dark:border-zinc-700">
            <div className="flex justify-between text-xs font-bold text-zinc-500">
              <span>KES {property.price.toLocaleString()} x {nights} nights</span>
              <span>KES {totalPrice.toLocaleString()}</span>
            </div>
            <div className="flex justify-between mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-700 font-black text-zinc-900 dark:text-white">
              <span className="uppercase tracking-widest text-[10px]">Grand Total</span>
              <span className="text-lg">KES {totalPrice.toLocaleString()}</span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-amber-600 bg-amber-50 dark:bg-amber-900/20 p-3 rounded-xl border border-amber-100 dark:border-amber-900/30">
            <FontAwesomeIcon icon={faInfoCircle} className="h-3 w-3" />
            Select valid dates for pricing
          </div>
        )}
      </div>
    );
  };

  const PropertyGallery = ({ images, title }: { images: string[], title: string }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [touchStartX, setTouchStartX] = useState<number | null>(null);
    const [touchEndX, setTouchEndX] = useState<number | null>(null);

    if (!images || images.length === 0) {
      return (
        <div className="flex h-full w-full items-center justify-center bg-zinc-100 dark:bg-zinc-800 text-zinc-400 rounded-2xl">
          <FontAwesomeIcon icon={faHome} className="h-12 w-12" />
        </div>
      );
    }

    const next = () => setCurrentIndex((prev) => (prev + 1) % images.length);
    const prev = () => setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);

    const minSwipeDistance = 50;

    const onTouchStart = (e: React.TouchEvent) => {
      setTouchEndX(null);
      setTouchStartX(e.targetTouches[0].clientX);
    };

    const onTouchMove = (e: React.TouchEvent) => {
      setTouchEndX(e.targetTouches[0].clientX);
    };

    const onTouchEnd = () => {
      if (!touchStartX || !touchEndX) return;
      const distance = touchStartX - touchEndX;
      const isLeftSwipe = distance > minSwipeDistance;
      const isRightSwipe = distance < -minSwipeDistance;
      if (isLeftSwipe) {
        next();
      } else if (isRightSwipe) {
        prev();
      }
    };

    return (
      <div 
        className="relative aspect-video w-full overflow-hidden rounded-2xl bg-zinc-100 dark:bg-zinc-800 group cursor-grab active:cursor-grabbing"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <img 
          src={images[currentIndex]} 
          alt={`${title} - ${currentIndex + 1}`} 
          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105 select-none"
          referrerPolicy="no-referrer"
          draggable="false"
        />
        
        {images.length > 1 && (
          <>
            <button 
              onClick={(e) => { e.stopPropagation(); prev(); }}
              className="absolute left-3 top-1/2 -translate-y-1/2 rounded-xl bg-white/80 dark:bg-black/80 hover:bg-white dark:hover:bg-black p-2.5 text-zinc-900 dark:text-white backdrop-blur-sm transition-all hover:scale-110 shadow-lg z-10"
            >
              <FontAwesomeIcon icon={faChevronLeft} className="h-4 w-4" />
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); next(); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-xl bg-white/80 dark:bg-black/80 hover:bg-white dark:hover:bg-black p-2.5 text-zinc-900 dark:text-white backdrop-blur-sm transition-all hover:scale-110 shadow-lg z-10"
            >
              <FontAwesomeIcon icon={faChevronRight} className="h-4 w-4" />
            </button>
            <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1.5 p-1.5 rounded-full bg-black/20 backdrop-blur-md z-10">
              {images.map((_, i) => (
                <div 
                  key={i} 
                  className={`h-1.5 rounded-full transition-all duration-300 ${i === currentIndex ? 'bg-white w-4' : 'bg-white/40 w-1.5'}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    );
  };

  const LandlordContactInfo = ({ landlordId }: { landlordId: string }) => {
    const [landlord, setLandlord] = useState<any>(null);
    const [fetching, setFetching] = useState(true);

    useEffect(() => {
      if (!profile) {
        setFetching(false);
        return;
      }
      const fetchLandlord = async () => {
        try {
          const data = await getLandlordPublicContact(landlordId);
          setLandlord(data);
        } catch (error) {
          console.error("Error fetching landlord:", error);
        } finally {
          setFetching(false);
        }
      };
      fetchLandlord();
    }, [landlordId]);

    if (fetching) return <div className="text-[10px] font-black uppercase tracking-widest text-zinc-400 animate-pulse">Establishing contact...</div>;
    if (!landlord) return <div className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Connection unavailable</div>;

    return (
      <div className="pt-6 border-t border-zinc-100 dark:border-zinc-800">
        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 mb-4">Verified Host</h4>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-900 dark:text-white shadow-sm">
              <FontAwesomeIcon icon={faUser} className="h-3.5 w-3.5" />
            </div>
            <span className="font-black text-sm">{landlord.displayName}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-900 dark:text-white shadow-sm">
              <FontAwesomeIcon icon={faPhone} className="h-3.5 w-3.5" />
            </div>
            <span className="font-bold text-sm text-blue-600">{landlord.phone || '+254 712 345678'}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-900 dark:text-white shadow-sm">
              <FontAwesomeIcon icon={faEnvelope} className="h-3.5 w-3.5" />
            </div>
            <span className="text-xs font-bold text-zinc-500 truncate">{landlord.email}</span>
          </div>
        </div>
      </div>
    );
  };
  const searchInput = (
    <div className="relative group w-full">
      <FontAwesomeIcon icon={faSearch} className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 group-focus-within:text-slate-900 dark:group-focus-within:text-white transition-colors" />
      <Input
        placeholder="Search location, building, or property title..."
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
          className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer ${
            filterType === f.id
              ? 'bg-[#00c569] text-white shadow-xs scale-[1.02]'
              : 'bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60'
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
        <div className="listing-sticky-bar sticky z-20 -mx-2 sm:-mx-0 border-b border-slate-200/80 bg-white/95 px-4 py-3.5 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/95 sm:rounded-2xl sm:border sm:shadow-xs sm:top-0">
          {searchInput}
          <div className="mt-2.5">{filterChips}</div>
          <p className="mt-2 text-xs font-semibold text-slate-400">
            {loading ? 'Scanning listings...' : `${filteredProperties.length} spaces available`}
          </p>
        </div>
      ) : (
        <div className="p-6 md:p-8 bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800/40">
                  <FontAwesomeIcon icon={faBuilding} className="h-2.5 w-2.5" />
                  Marketplace Network
                </span>
                <span className="text-xs text-slate-400 font-medium">·</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  {filteredProperties.length} verified listings
                </span>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                Find Your Space
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Explore verified residential apartments, commercial properties, and luxury short stays.
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
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <FontAwesomeIcon icon={faSpinner} className="h-6 w-6 animate-spin text-slate-400" />
            <p className="text-xs font-semibold text-slate-400">Loading properties...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredProperties.map((property) => (
              <Card key={property.id} className="overflow-hidden border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900 rounded-2xl shadow-xs hover:shadow-md transition-all flex flex-col group">
                <div className="aspect-video w-full bg-slate-100 dark:bg-slate-800 relative overflow-hidden">
                  {property.images?.[0] ? (
                    <img 
                      src={property.images[0]} 
                      alt={property.title} 
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      referrerPolicy="no-referrer"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-slate-400">
                      <FontAwesomeIcon icon={faHome} className="h-8 w-8 opacity-20" />
                    </div>
                  )}
                  <div className="absolute top-2.5 left-2.5">
                    <Badge variant={property.type === 'bnb' ? 'purple' : property.type === 'commercial' ? 'warning' : 'indigo'}>
                      {property.type}
                    </Badge>
                  </div>
                  <div className="absolute top-2.5 right-2.5">
                    <button
                      onClick={(e) => toggleLike(e, property.id)}
                      className={`flex items-center justify-center h-8 w-8 rounded-full backdrop-blur-md transition-all shadow-sm cursor-pointer ${
                        likedPropertyIds.has(property.id)
                          ? 'bg-white text-rose-500 scale-105'
                          : 'bg-black/40 text-white hover:bg-white hover:text-rose-500'
                      }`}
                    >
                      <FontAwesomeIcon icon={faHeart} className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-60 pointer-events-none" />
                  <div className="absolute bottom-2.5 left-3 right-3 pointer-events-none">
                    <p className="text-white text-base font-bold tabular-nums leading-tight">
                      KES {property.price.toLocaleString()}
                      <span className="text-[11px] font-normal opacity-80 ml-1">/{property.type === 'bnb' ? 'night' : 'mo'}</span>
                    </p>
                  </div>
                </div>

                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm font-bold text-slate-900 dark:text-white line-clamp-1 group-hover:text-blue-600 transition-colors">
                    {property.title}
                  </CardTitle>
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 font-normal mt-0.5 line-clamp-1">
                    <FontAwesomeIcon icon={faMapMarkerAlt} className="shrink-0 h-3 w-3 text-slate-400" />
                    <span className="truncate">{property.location}</span>
                  </div>
                </CardHeader>

                <CardContent className="px-4 pb-3 pt-0 flex-1">
                  <p className="line-clamp-2 text-xs text-slate-500 leading-relaxed mb-3">{property.description}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {property.amenities?.slice(0, 2).map((a, i) => (
                      <Badge key={i} variant="outline" className="text-[10px] font-medium text-slate-500 px-2 py-0">{a}</Badge>
                    ))}
                    {property.amenities?.length > 2 && (
                      <Badge variant="outline" className="text-[10px] font-medium text-slate-400 px-2 py-0">+{property.amenities.length - 2}</Badge>
                    )}
                  </div>
                </CardContent>

                <CardFooter className="p-4 pt-0 mt-auto">
                  <Dialog>
                    <DialogTrigger render={
                      <Button size="sm" className="w-full font-bold text-xs rounded-xl cursor-pointer">
                        Reserve / View Asset
                      </Button>
                    } />
                    <DialogContent className="sm:max-w-3xl rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xl p-0 overflow-hidden bg-white dark:bg-slate-900 max-h-[90dvh] overflow-y-auto">
                      <div className="grid md:grid-cols-2">
                        <div className="p-6 md:p-8 space-y-5">
                          <DialogHeader>
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant={property.type === 'bnb' ? 'purple' : property.type === 'commercial' ? 'warning' : 'indigo'}>{property.type}</Badge>
                              <div className="flex items-center gap-1 text-amber-500">
                                <FontAwesomeIcon icon={faStar} className="h-3 w-3" />
                                <span className="text-xs font-bold">4.9</span>
                              </div>
                            </div>
                            <DialogTitle className="text-xl font-bold text-slate-900 dark:text-white leading-tight">{property.title}</DialogTitle>
                            <DialogDescription className="flex items-center gap-1.5 text-xs text-slate-500 mt-1">
                              <FontAwesomeIcon icon={faMapMarkerAlt} className="text-rose-500 h-3 w-3" />
                              {property.location}
                            </DialogDescription>
                          </DialogHeader>
                          
                          <div className="space-y-4">
                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Pricing Model</span>
                              <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                                KES {property.price.toLocaleString()} 
                                <span className="text-xs font-normal text-slate-400 ml-1.5">/ {property.type === 'bnb' ? 'night' : 'month'}</span>
                              </p>
                            </div>
                            
                            {property.type === 'bnb' && <BNBBookingForm property={property} />}
                            
                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">Amenities</span>
                              <div className="grid grid-cols-2 gap-2">
                                {property.amenities?.map((a, i) => (
                                  <div key={i} className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                                    <FontAwesomeIcon icon={getAmenityIcon(a)} className="h-3 w-3 text-emerald-500" />
                                    {a}
                                  </div>
                                ))}
                              </div>
                            </div>
                            
                            <LandlordContactInfo landlordId={property.landlordId} />
                          </div>
                          
                          <div className="pt-2">
                            {property.type === 'bnb' ? (
                              <Button onClick={() => handleBook(property)} className="w-full h-11 rounded-xl font-bold text-xs gap-2" disabled={paying}>
                                {paying ? <FontAwesomeIcon icon={faSpinner} className="h-3.5 w-3.5 animate-spin" /> : <FontAwesomeIcon icon={faWallet} className="h-3.5 w-3.5" />}
                                {paying ? "Processing Reservation..." : "Secure Instant Booking"}
                              </Button>
                            ) : (
                              <Button
                                className="w-full h-11 rounded-xl font-bold text-xs gap-2"
                                onClick={() => {
                                  if (!profile) {
                                    toast.info("Sign in to request a viewing.");
                                    onLoginRequired?.();
                                    return;
                                  }
                                  window.open(`mailto:${profile.email}?subject=Interest in ${property.title}`);
                                }}
                              >
                                <FontAwesomeIcon icon={faEnvelope} className="h-3.5 w-3.5" />
                                Request Scheduled Viewing
                              </Button>
                            )}
                          </div>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800/40 p-6 flex flex-col justify-start space-y-4 border-l border-slate-100 dark:border-slate-800">
                          <PropertyGallery images={property.images} title={property.title} />
                          <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Property Description</span>
                            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed italic">"{property.description}"</p>
                          </div>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}

        {filteredProperties.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="h-12 w-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-4">
              <FontAwesomeIcon icon={faSearch} className="h-5 w-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">No Matching Spaces Found</h3>
            <p className="text-xs text-slate-500 max-w-xs">We couldn't find any active listings matching your current filter parameters.</p>
            <Button variant="outline" size="sm" className="mt-4 text-xs font-semibold rounded-xl" onClick={() => {setSearchTerm(''); setFilterType('all');}}>Reset Filters</Button>
          </div>
        )}
      </div>

      {/* Mobile Bottom Navigation Bar */}
      {profile && variant !== 'embedded' && (
        <nav className="sm:hidden mobile-bottom-nav fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-slate-900 border-t border-slate-200/80 dark:border-slate-800">
          <div className="flex items-center justify-around h-16 px-2">
            {PROPERTY_FILTERS.map(f => (
              <button
                key={f.id}
                onClick={() => {
                  setFilterType(f.id);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={`flex flex-col items-center justify-center gap-1 flex-1 h-full rounded-xl transition-all ${
                  filterType === f.id
                    ? 'text-slate-900 dark:text-white font-bold'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <FontAwesomeIcon icon={f.icon} className="text-sm" />
                <span className="text-[10px] font-semibold">{f.label}</span>
              </button>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
