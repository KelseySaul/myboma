import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../supabase';
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

  useEffect(() => {
    let isActive = true;
    let propSub: any = null;

    const fetchAndSubscribe = async () => {
      const { data: props } = await supabase
        .from('properties')
        .select('*')
        .eq('status', 'available')
        .order('createdAt', { ascending: false });
      if (!isActive) return;

      if (props) setProperties(props);
      setLoading(false);

      propSub = supabase
        .channel(`public-properties-available-${Date.now()}-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'properties', filter: 'status=eq.available' }, (payload) => {
          if (!isActive) return;
          if (payload.eventType === 'INSERT') {
            setProperties(prev => [...prev, payload.new as Property]);
          } else if (payload.eventType === 'UPDATE') {
            setProperties(prev => prev.map(p => p.id === payload.new.id ? payload.new as Property : p));
          } else if (payload.eventType === 'DELETE') {
            setProperties(prev => prev.filter(p => p.id !== payload.old.id));
          }
        })
        .subscribe();
    };

    fetchAndSubscribe();

    return () => {
      isActive = false;
      if (propSub) supabase.removeChannel(propSub);
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

      const bookingData = {
        hunterId: profile.uid,
        propertyId: property.id,
        landlordId: property.landlordId,
        platformId: property.platformId,
        startDate: property.type === 'bnb' ? bookingDates.checkIn : new Date().toISOString().split('T')[0],
        endDate: property.type === 'bnb' ? bookingDates.checkOut : new Date(Date.now() + 86400000).toISOString().split('T')[0],
        totalPrice: totalPrice,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      const { error } = await supabase.from('bookings').insert([bookingData]);

      if (error) throw error;

      logAudit('BOOKING_CREATE', 'booking', property.id, { status: 'pending', totalPrice });

      const { data: landlordRow } = await supabase
        .from('users')
        .select('email')
        .eq('uid', property.landlordId)
        .maybeSingle();

      if (landlordRow?.email) {
        await supabase.from('notifications').insert([
          {
            recipientEmail: landlordRow.email.toLowerCase(),
            platformId: property.platformId,
            type: 'booking',
            title: 'New booking request',
            message: `${profile.displayName || profile.email} requested ${property.title}. Total KES ${totalPrice.toLocaleString()}. Confirm after payment.`,
            propertyId: property.id,
            read: false,
          },
        ]);
      }

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
      const fetchLandlord = async () => {
        try {
          const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('uid', landlordId)
            .single();
          
          if (data) {
            setLandlord(data);
          }
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
      <FontAwesomeIcon icon={faSearch} className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 group-focus-within:text-zinc-900 transition-colors" />
      <Input
        placeholder="Search location or title..."
        className="h-10 pl-9 sm:pl-10 pr-4 rounded-xl border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 focus:ring-1 focus:ring-zinc-400 font-bold text-sm"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
      />
    </div>
  );

  const filterChips = (
    <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {PROPERTY_FILTERS.map((f) => (
        <button
          key={f.id}
          type="button"
          onClick={() => setFilterType(f.id)}
          className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-wide transition-all ${
            filterType === f.id
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/25'
              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
          }`}
        >
          <FontAwesomeIcon icon={f.icon} className="h-3 w-3" />
          {f.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className={`db animate-in fade-in duration-700 ${variant === 'embedded' ? 'pb-8' : 'pb-24 sm:pb-8'}`}>
      {variant === 'embedded' ? (
        <div className="listing-sticky-bar sticky z-20 -mx-2 sm:-mx-0 border-b border-zinc-100 bg-white/95 px-3 py-3 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95 sm:rounded-2xl sm:border sm:shadow-sm sm:top-0">
          {searchInput}
          <div className="mt-3">{filterChips}</div>
          <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-zinc-400">
            {loading ? 'Loading listings...' : `${filteredProperties.length} properties`}
          </p>
        </div>
      ) : (
        <div className="hero">
          <div className="hero-meta">
            <span className="lvl-badge">Public Directory</span>
            <div className="status-dot">
              <span className="status-pulse"></span>
              Scan complete
            </div>
          </div>
          <div className="hero-row">
            <div>
              <h1 className="hero-title">Find Your Space</h1>
              <p className="hero-sub">Explore residential, commercial, or luxury short stays.</p>
            </div>
            <div className="hero-actions">{searchInput}</div>
          </div>
          <div className="mt-4 px-0 sm:px-0">{filterChips}</div>
        </div>
      )}

      <div className={`mt-3 sm:mt-6 ${variant === 'embedded' ? 'px-1 sm:px-4' : 'px-3 sm:px-6'}`}>
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <FontAwesomeIcon icon={faSpinner} className="h-10 w-10 animate-spin text-zinc-400" />
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Scanning Network...</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:gap-4 md:gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredProperties.map((property) => (
              <Card key={property.id} className="overflow-hidden border border-zinc-100/80 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 cursor-pointer transition-all hover:shadow-lg sm:hover:-translate-y-0.5 group rounded-xl sm:rounded-2xl sm:shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:border-none">
                <div className="aspect-square sm:aspect-video w-full bg-zinc-100 dark:bg-zinc-800 relative overflow-hidden">
                  {property.images?.[0] ? (
                    <img 
                      src={property.images[0]} 
                      alt={property.title} 
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105 sm:group-hover:scale-110"
                      referrerPolicy="no-referrer"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-zinc-400">
                      <FontAwesomeIcon icon={faHome} className="h-8 w-8 sm:h-12 sm:w-12 opacity-10" />
                    </div>
                  )}
                  <div className="absolute top-1.5 left-1.5 sm:top-3 sm:left-3 flex gap-2">
                     <Badge className="bg-white/90 dark:bg-black/90 text-zinc-900 dark:text-white border-none px-1.5 py-0 sm:px-2 sm:py-0.5 rounded-md sm:rounded-lg font-black text-[7px] sm:text-[8px] uppercase tracking-widest backdrop-blur-md shadow-lg">
                        {property.type}
                     </Badge>
                  </div>
                  <div className="absolute top-1.5 right-1.5 sm:top-3 sm:right-3 flex gap-2">
                    <button
                      onClick={(e) => toggleLike(e, property.id)}
                      className={`flex items-center justify-center h-7 w-7 sm:h-9 sm:w-9 rounded-full backdrop-blur-md transition-all shadow-lg ${
                        likedPropertyIds.has(property.id)
                          ? 'bg-white text-rose-500 scale-110'
                          : 'bg-black/30 text-white hover:bg-white/90 hover:text-rose-500'
                      }`}
                    >
                      <FontAwesomeIcon icon={faHeart} className="h-3 w-3 sm:h-4 sm:w-4" />
                    </button>
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-70 sm:opacity-60" />
                  <div className="absolute bottom-1.5 left-1.5 right-1.5 sm:bottom-3 sm:left-3 sm:right-3">
                     <p className="text-white text-xs sm:text-xl font-black tabular-nums leading-tight">
                       <span className="sm:hidden">KES {(property.price >= 1000 ? `${Math.round(property.price / 1000)}k` : property.price.toLocaleString())}</span>
                       <span className="hidden sm:inline">KES {property.price.toLocaleString()}</span>
                       <span className="text-[8px] sm:text-[10px] font-bold text-white/70 ml-0.5 sm:ml-1.5">/{property.type === 'bnb' ? 'nt' : 'mo'}</span>
                     </p>
                  </div>
                </div>
                <CardHeader className="p-2 pb-0 sm:p-4 sm:pb-2">
                  <CardTitle className="text-[11px] sm:text-base font-black text-zinc-900 dark:text-white group-hover:text-zinc-600 transition-colors line-clamp-2 sm:line-clamp-1 leading-snug">{property.title}</CardTitle>
                  <div className="flex items-center gap-1 text-[9px] sm:text-[10px] text-zinc-400 font-bold mt-0.5 line-clamp-1">
                    <FontAwesomeIcon icon={faMapMarkerAlt} className="shrink-0 text-zinc-400 text-[8px] sm:text-[10px]" />
                    <span className="truncate">{property.location}</span>
                  </div>
                </CardHeader>
                <CardContent className="hidden sm:block px-4 pb-4 pt-0">
                  <p className="line-clamp-1 text-xs font-medium text-zinc-500 leading-relaxed mb-3">{property.description}</p>
                  <div className="flex flex-wrap gap-1.5">
                     {property.amenities?.slice(0, 2).map((a, i) => (
                        <Badge key={i} variant="outline" className="border-zinc-100 dark:border-zinc-800 text-[8px] font-black uppercase tracking-widest text-zinc-400 px-1.5 py-0">{a}</Badge>
                     ))}
                     {property.amenities?.length > 2 && (
                        <Badge variant="outline" className="border-none bg-zinc-50 dark:bg-zinc-800 text-[8px] font-black uppercase tracking-widest px-1.5 py-0">+{property.amenities.length - 2}</Badge>
                     )}
                  </div>
                </CardContent>
                <CardFooter className="p-2 pt-1 sm:px-4 sm:pb-4 sm:pt-0">
                  <Dialog>
                    <DialogTrigger render={
                      <Button className="w-full h-8 sm:h-10 rounded-lg sm:rounded-xl bg-zinc-950 dark:bg-white text-white dark:text-zinc-900 font-black text-[10px] sm:text-xs hover:bg-zinc-800 active:scale-[0.98] transition-all">
                        <span className="sm:hidden">View</span>
                        <span className="hidden sm:inline">Reserve Asset</span>
                      </Button>
                    } />
                    <DialogContent className="sm:max-w-3xl rounded-[2rem] border-none shadow-2xl p-0 overflow-hidden bg-white dark:bg-zinc-900 max-h-[90dvh] overflow-y-auto">
                      <div className="grid md:grid-cols-2">
                         <div className="p-6 md:p-8 space-y-5 md:space-y-6">
                            <DialogHeader>
                               <div className="flex items-center gap-3 mb-2">
                                  <Badge className="bg-zinc-900 text-white border-none font-black text-[9px] uppercase tracking-widest px-3 py-1">{property.type}</Badge>
                                  <div className="flex items-center gap-1 text-amber-500">
                                     <FontAwesomeIcon icon={faStar} className="h-3 w-3" />
                                     <span className="text-xs font-black">4.9</span>
                                  </div>
                               </div>
                               <DialogTitle className="text-2xl font-black leading-tight">{property.title}</DialogTitle>
                               <DialogDescription className="flex items-center gap-1.5 font-bold text-zinc-500 mt-1">
                                 <FontAwesomeIcon icon={faMapMarkerAlt} className="text-rose-500" />
                                 {property.location}
                               </DialogDescription>
                            </DialogHeader>
                            
                            <div className="space-y-5">
                               <div>
                                  <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">Pricing Model</h4>
                                  <p className="text-3xl font-black text-zinc-900 dark:text-white tabular-nums">
                                    KES {property.price.toLocaleString()} 
                                    <span className="text-xs font-bold text-zinc-400 ml-2">/ {property.type === 'bnb' ? 'night' : 'month'}</span>
                                  </p>
                               </div>
                               
                               {property.type === 'bnb' && <BNBBookingForm property={property} />}
                               
                               <div>
                                  <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-3">Core Amenities</h4>
                                  <div className="grid grid-cols-2 gap-3">
                                     {property.amenities?.map((a, i) => (
                                        <div key={i} className="flex items-center gap-2 text-sm font-bold text-zinc-600 dark:text-zinc-400">
                                           <FontAwesomeIcon icon={getAmenityIcon(a)} className="h-3.5 w-3.5 text-emerald-500" />
                                           {a}
                                        </div>
                                     ))}
                                  </div>
                               </div>
                               
                               <LandlordContactInfo landlordId={property.landlordId} />
                            </div>
                            
                            <div className="pt-4">
                               {property.type === 'bnb' ? (
                                 <Button onClick={() => handleBook(property)} className="w-full h-14 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-lg gap-3 shadow-xl shadow-blue-200 dark:shadow-none" disabled={paying}>
                                   {paying ? <FontAwesomeIcon icon={faSpinner} className="h-5 w-5 animate-spin" /> : <FontAwesomeIcon icon={faWallet} className="h-5 w-5" />}
                                   {paying ? "Processing Transaction..." : "Secure Booking"}
                                 </Button>
                               ) : (
                                 <Button
                                   className="w-full h-14 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-black text-lg gap-3 shadow-xl"
                                   onClick={() => {
                                     if (!profile) {
                                       toast.info("Sign in to request a viewing.");
                                       onLoginRequired?.();
                                       return;
                                     }
                                     window.open(`mailto:${profile.email}?subject=Interest in ${property.title}`);
                                   }}
                                 >
                                   <FontAwesomeIcon icon={faEnvelope} className="h-5 w-5" />
                                   Request Viewing
                                 </Button>
                               )}
                            </div>
                         </div>
                         <div className="bg-zinc-50 dark:bg-zinc-800 p-6 flex flex-col justify-start space-y-4 md:space-y-6">
                            <PropertyGallery images={property.images} title={property.title} />
                            <div className="p-5 rounded-2xl bg-white dark:bg-zinc-900 shadow-sm border border-zinc-100 dark:border-zinc-800">
                               <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-3">Property Intelligence</h4>
                               <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 leading-relaxed italic">"{property.description}"</p>
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
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="h-24 w-24 rounded-[2.5rem] bg-zinc-50 dark:bg-zinc-900 flex items-center justify-center text-zinc-200 mb-8 border border-zinc-100 dark:border-zinc-800">
              <FontAwesomeIcon icon={faSearch} className="h-10 w-10" />
            </div>
            <h3 className="text-2xl font-black text-zinc-900 dark:text-white mb-2">Zero Assets Found</h3>
            <p className="text-zinc-500 font-medium max-w-xs">We couldn't find any spaces matching your current parameters.</p>
            <Button variant="link" className="mt-4 font-black text-zinc-400 uppercase tracking-widest text-[10px]" onClick={() => {setSearchTerm(''); setFilterType('all');}}>Reset Search Index</Button>
          </div>
        )}
      </div>

      {/* Mobile Bottom Navigation Bar */}
      {profile && variant !== 'embedded' && (
        <nav className="sm:hidden mobile-bottom-nav fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-zinc-100 shadow-[0_-4px_24px_rgba(0,0,0,0.06)]">
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
                    ? 'text-indigo-600'
                    : 'text-zinc-400 hover:text-zinc-700'
                }`}
              >
                <div className={`flex items-center justify-center h-7 w-7 rounded-xl transition-all ${
                  filterType === f.id ? 'bg-indigo-50' : ''
                }`}>
                  <FontAwesomeIcon icon={f.icon} className={`text-sm ${filterType === f.id ? 'text-indigo-600' : ''}`} />
                </div>
                <span className={`text-[9px] font-black uppercase tracking-wide leading-none ${
                  filterType === f.id ? 'text-indigo-600' : 'text-zinc-400'
                }`}>{f.label}</span>
              </button>
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}
