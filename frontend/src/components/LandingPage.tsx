import { lazy, Suspense, useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { GetStarted, LandingHero, LandlordFeatures, ListingsSection } from './landing/LandingSections';
import { SEARCH_EVENT } from './search/SiteSearch';
import AuthDialog, { type AuthIntent } from './auth/AuthDialog';
import {unsubscribeFromWaitlist} from '../lib/waitlist';
import { Capacitor } from '@capacitor/core';
import { tenantConfig } from '../config/tenant';

const HunterDashboard = lazy(() => import('./HunterDashboard'));

const ListingsSkeleton = () => (
  <div className="grid grid-cols-2 gap-4 px-2 py-8 sm:grid-cols-3 lg:grid-cols-4">
    {[0, 1, 2, 3].map((i) => (
      <div key={i} className="space-y-2.5">
        <div className="aspect-[4/3] animate-pulse rounded-2xl bg-zinc-100" />
        <div className="h-4 w-3/4 animate-pulse rounded bg-zinc-100" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-zinc-100/70" />
      </div>
    ))}
  </div>
);

// Move PWA prompt to module level so it persists across renders
let _pwaPromptEvent: any = null;

interface LandingPageProps {
  isAuthOpen: boolean;
  setIsAuthOpen: (open: boolean) => void;
}

export default function LandingPage({ isAuthOpen, setIsAuthOpen }: LandingPageProps) {
  const isNative = Capacitor.isNativePlatform();
  const [propertyFilter, setPropertyFilter] = useState('all');
  const [listingSearch, setListingSearch] = useState('');
  const [mobileSearchTerm, setMobileSearchTerm] = useState('');
  const [pwaPrompt, setPwaPrompt] = useState<any>(null);
  const [pwaVisible, setPwaVisible] = useState(false);
  const pwaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      _pwaPromptEvent = e;
      setPwaPrompt(e);
      pwaTimerRef.current = setTimeout(() => setPwaVisible(true), 3000);
    };
    window.addEventListener('beforeinstallprompt', handler as EventListener);
    // If already captured from a previous mount
    if (_pwaPromptEvent) {
      setPwaPrompt(_pwaPromptEvent);
      pwaTimerRef.current = setTimeout(() => setPwaVisible(true), 3000);
    }
    return () => {
      window.removeEventListener('beforeinstallprompt', handler as EventListener);
      if (pwaTimerRef.current) clearTimeout(pwaTimerRef.current);
    };
  }, []);

  const handlePwaInstall = async () => {
    if (!pwaPrompt) return;
    pwaPrompt.prompt();
    const { outcome } = await pwaPrompt.userChoice;
    _pwaPromptEvent = null;
    setPwaVisible(false);
    setPwaPrompt(null);
    if (outcome === 'accepted') {
      toast.success(`${tenantConfig.appName} is installing on your device.`);
    }
  };

  const handlePwaInstallClick = async () => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      ('standalone' in window.navigator && Boolean((window.navigator as Navigator & {standalone?: boolean}).standalone));

    if (isStandalone) {
      toast.info(`${tenantConfig.appName} is already installed on this device.`);
      return;
    }

    if (pwaPrompt) {
      await handlePwaInstall();
      return;
    }

    toast.info(
      `Install ${tenantConfig.appName} from your browser menu. On iPhone, tap Share then 'Add to Home Screen'. On Android or desktop, choose 'Install App' or 'Add to Home Screen'.`,
      {duration: 7000},
    );
  };

  const handlePwaDismiss = () => {
    setPwaVisible(false);
    // Don't show again this session
    if (pwaTimerRef.current) clearTimeout(pwaTimerRef.current);
  };

  const [authIntent, setAuthIntent] = useState<AuthIntent>({ mode: 'signin' });

  useEffect(() => {
    const url = new URL(window.location.href);
    const unsubscribeToken = url.searchParams.get('unsubscribe');
    if (!unsubscribeToken) return;

    url.searchParams.delete('unsubscribe');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    void unsubscribeFromWaitlist({token: unsubscribeToken})
      .then(() => toast.success(`You have been unsubscribed from ${tenantConfig.appName} emails.`))
      .catch((error: Error) => toast.error(error.message));
  }, []);

  const openLandlordSignup = () => {
    setAuthIntent({ mode: 'signup', role: 'landlord' });
    setIsAuthOpen(true);
  };

  const openSignIn = () => {
    setAuthIntent({ mode: 'signin' });
    setIsAuthOpen(true);
  };

  const scrollToHomes = () => document.getElementById('homes')?.scrollIntoView({ behavior: 'smooth' });

  // Navbar search: "Show all results" filters the listings here (or arrives as ?q= from another page).
  useEffect(() => {
    const show = (query: string) => {
      setListingSearch(query);
      setPropertyFilter('all');
      requestAnimationFrame(() => scrollToHomes());
    };
    const initial = new URLSearchParams(window.location.search).get('q');
    if (initial) {
      show(initial);
      const url = new URL(window.location.href);
      url.searchParams.delete('q');
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    }
    const onSearch = (event: Event) => show(String((event as CustomEvent<string>).detail ?? ''));
    window.addEventListener(SEARCH_EVENT, onSearch);
    return () => window.removeEventListener(SEARCH_EVENT, onSearch);
  }, []);

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-white selection:bg-violet-200 selection:text-violet-950">
      {isNative ? (
        <section className="container mx-auto px-2 py-4 pt-safe sm:px-4">
          <Suspense fallback={<ListingsSkeleton />}>
            <HunterDashboard
              profile={null}
              onLoginRequired={() => setIsAuthOpen(true)}
              activeTab={propertyFilter}
              setActiveTab={setPropertyFilter}
              variant="embedded"
            />
          </Suspense>
        </section>
      ) : (
        <>
          <LandingHero
            onBrowse={scrollToHomes}
            onStartLandlord={() => openLandlordSignup()}
            onSearch={(query) => {
              setListingSearch(query);
              setPropertyFilter('all');
              requestAnimationFrame(() => scrollToHomes());
            }}
          />
          <ListingsSection activeType={propertyFilter} onTypeChange={setPropertyFilter}>
            <Suspense fallback={<ListingsSkeleton />}>
              <HunterDashboard
                profile={null}
                onLoginRequired={() => setIsAuthOpen(true)}
                activeTab={propertyFilter}
                setActiveTab={setPropertyFilter}
                externalSearchTerm={listingSearch}
                onExternalSearchChange={setListingSearch}
                variant="embedded"
              />
            </Suspense>
          </ListingsSection>
          <LandlordFeatures onStartLandlord={() => openLandlordSignup()} />
          <GetStarted onStartLandlord={() => openLandlordSignup()} onSignIn={openSignIn} />
        </>
      )}

      <AuthDialog
        open={isAuthOpen}
        intent={authIntent}
        onOpenChange={(open) => {
          setIsAuthOpen(open);
          // The navbar's Sign in button opens the dialog without an intent, so default back to sign-in.
          if (!open) setAuthIntent({ mode: 'signin' });
        }}
      />
    </div>
  );
}
