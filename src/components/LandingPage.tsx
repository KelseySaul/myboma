import { useState, useEffect, useRef } from 'react';
import HunterDashboard from './HunterDashboard';
import { getAuthPersistence, setAuthPersistence, supabase } from '../supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faLock, 
  faEnvelope, 
  faUser, 
  faShieldAlt, 
  faSearch, 
  faArrowRight, 
  faCheckCircle,
  faMobileAlt,
  faEye,
  faEyeSlash,
  faDownload,
  faBell
} from '@fortawesome/free-solid-svg-icons';
import { toast } from 'sonner';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { LEGAL_DOCUMENTS, PRIVACY_VERSION, TERMS_VERSION } from '../legalDocuments';
import LandlordPricingSection from './LandlordPricingSection';
import LandlordSignupFields, { defaultLandlordSignupState } from './LandlordSignupFields';
import {
  PENDING_LANDLORD_SUBSCRIPTION_KEY,
  type PendingLandlordSubscription,
  type SubscriptionTier,
  type BillingPeriod,
} from '../lib/landlordSubscription';
import {joinWaitlist, unsubscribeFromWaitlist} from '../lib/waitlist';

// Move PWA prompt to module level so it persists across renders
let _pwaPromptEvent: any = null;

interface LandingPageProps {
  isAuthOpen: boolean;
  setIsAuthOpen: (open: boolean) => void;
}

export default function LandingPage({ isAuthOpen, setIsAuthOpen }: LandingPageProps) {
  const [propertyFilter, setPropertyFilter] = useState('all');
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
      toast.success('MyBoma is installing on your device.');
    }
  };

  const handlePwaInstallClick = async () => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      ('standalone' in window.navigator && Boolean((window.navigator as Navigator & {standalone?: boolean}).standalone));

    if (isStandalone) {
      toast.info('MyBoma is already installed on this device.');
      return;
    }

    if (pwaPrompt) {
      await handlePwaInstall();
      return;
    }

    toast.info(
      "Install MyBoma from your browser menu. On iPhone, tap Share then 'Add to Home Screen'. On Android or desktop, choose 'Install App' or 'Add to Home Screen'.",
      {duration: 7000},
    );
  };

  const handlePwaDismiss = () => {
    setPwaVisible(false);
    // Don't show again this session
    if (pwaTimerRef.current) clearTimeout(pwaTimerRef.current);
  };

  const handleEnableNotifications = () => {
    // @ts-ignore
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    // @ts-ignore
    window.OneSignalDeferred.push(function(OneSignal) {
      OneSignal.Slidedown.promptPush();
    });
  };

  const [loading, setLoading] = useState(false);
  const [agreed, setAgreed] = useState(() => {
    return localStorage.getItem('myboma_agreed_terms') === 'true';
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => getAuthPersistence());
  const [confirmPassword, setConfirmPassword] = useState('');
  const [legalDoc, setLegalDoc] = useState<'terms' | 'privacy' | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [selectedRole, setSelectedRole] = useState<'landlord' | 'hunter'>('hunter');
  const [landlordSignup, setLandlordSignup] = useState<PendingLandlordSubscription>(defaultLandlordSignupState);
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [unsubscribeEmail, setUnsubscribeEmail] = useState('');
  const [waitlistLoading, setWaitlistLoading] = useState(false);
  const [unsubscribeLoading, setUnsubscribeLoading] = useState(false);
  const [waitlistJoined, setWaitlistJoined] = useState(false);

  useEffect(() => {
    if (agreed) {
      recordTermsAcceptance();
    }
  }, [agreed]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const unsubscribeToken = url.searchParams.get('unsubscribe');
    if (!unsubscribeToken) return;

    url.searchParams.delete('unsubscribe');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    void unsubscribeFromWaitlist({token: unsubscribeToken})
      .then(() => toast.success('You have been unsubscribed from MyBoma emails.'))
      .catch((error: Error) => toast.error(error.message));
  }, []);

  const sanitizeAuthText = (value: string) => value.normalize('NFKC').replace(/<[^>]*>/g, '').trim();
  const normalizeEmail = (value: string) => sanitizeAuthText(value).toLowerCase();
  const normalizePhone = (value: string) => sanitizeAuthText(value).replace(/[^\d+]/g, '');

  const recordTermsAcceptance = () => {
    const acceptance = {
      acceptedAt: new Date().toISOString(),
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
    };

    localStorage.setItem('myboma_agreed_terms', 'true');
    localStorage.setItem('myboma_terms_acceptance', JSON.stringify(acceptance));
    return acceptance;
  };

  const handleAgreementChange = (checked: boolean) => {
    setAgreed(checked);
    if (checked) {
      recordTermsAcceptance();
    } else {
      localStorage.removeItem('myboma_agreed_terms');
      localStorage.removeItem('myboma_terms_acceptance');
    }
  };

  const handleWaitlistSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setWaitlistLoading(true);
    try {
      await joinWaitlist(waitlistEmail.trim().toLowerCase());
      setWaitlistJoined(true);
      setWaitlistEmail('');
      toast.success('You are on the MyBoma waitlist.');
    } catch (error: any) {
      toast.error(error.message || 'Could not join the waitlist.');
    } finally {
      setWaitlistLoading(false);
    }
  };

  const handleUnsubscribe = async (event: React.FormEvent) => {
    event.preventDefault();
    setUnsubscribeLoading(true);
    try {
      await unsubscribeFromWaitlist({email: unsubscribeEmail.trim().toLowerCase()});
      setUnsubscribeEmail('');
      toast.success('You have been unsubscribed from MyBoma emails.');
    } catch (error: any) {
      toast.error(error.message || 'Could not process your unsubscribe request.');
    } finally {
      setUnsubscribeLoading(false);
    }
  };

    const handleGoogleLogin = async () => {
      if (authMode === 'signup' && !agreed) {
        toast.error("Please agree to the Terms of Use and Privacy Policy to continue.");
        return;
      }
      setLoading(true);
      console.log("Landing: Starting Google OAuth with role:", selectedRole);
      localStorage.setItem('myboma_intended_role', selectedRole);
      if (selectedRole === 'landlord' && authMode === 'signup') {
        localStorage.setItem(PENDING_LANDLORD_SUBSCRIPTION_KEY, JSON.stringify(landlordSignup));
      }
      setAuthPersistence(authMode === 'login' ? rememberMe : true);
      recordTermsAcceptance();
      try {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            queryParams: {
              access_type: 'offline',
              prompt: 'consent',
            },
          },
        });
        if (error) throw error;
        console.log("Landing: Google OAuth initiated");
      } catch (error: any) {
        console.error("Landing: Google login error:", error);
        toast.error(error.message || "Failed to login");
      } finally {
        setLoading(false);
      }
    };

    const handleEmailAuth = async (e: React.FormEvent) => {
      e.preventDefault();
      console.log("Landing: handleEmailAuth called", authMode);
      
      if (authMode === 'signup' && !agreed) {
        toast.error("Please agree to the Terms of Use and Privacy Policy to continue.");
        return;
      }
      const cleanEmail = normalizeEmail(email);
      const cleanFullName = sanitizeAuthText(fullName);
      const cleanPhone = normalizePhone(phone);

      if (!cleanEmail || !password) {
        toast.error("Please enter both email and password.");
        return;
      }

    // Crucial: Set the intended role BEFORE signup so App.tsx can pick it up
    localStorage.setItem('myboma_intended_role', selectedRole);
    setAuthPersistence(authMode === 'login' ? rememberMe : true);
    setLoading(true);

    try {
      if (authMode === 'login') {
        console.log("Landing: Attempting login for", cleanEmail);
        const { data, error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (error) {
          console.error("Landing: Login error returned from Supabase:", error);
          throw error;
        }
        console.log("Landing: Login successful!", data.user?.id);
        toast.success("Successfully logged in!");
      } else {
        if (!cleanFullName || !cleanPhone) {
          toast.error("Please provide your full name and phone number.");
          setLoading(false);
          return;
        }

        if (password !== confirmPassword) {
          toast.error("Passwords do not match.");
          setLoading(false);
          return;
        }

        if (selectedRole === 'landlord') {
          if (landlordSignup.rentPayoutMethod === 'mpesa' && !landlordSignup.mpesaSettlementPhone?.trim()) {
            toast.error('Enter the M-Pesa number where you receive rent from tenants.');
            setLoading(false);
            return;
          }
          if (landlordSignup.rentPayoutMethod === 'bank') {
            if (
              !landlordSignup.bankName?.trim() ||
              !landlordSignup.bankAccountNumber?.trim() ||
              !landlordSignup.bankAccountName?.trim()
            ) {
              toast.error('Complete your bank details for receiving rent.');
              setLoading(false);
              return;
            }
          }
          localStorage.setItem(PENDING_LANDLORD_SUBSCRIPTION_KEY, JSON.stringify(landlordSignup));
        }

        const termsAcceptance = recordTermsAcceptance();

        console.log("Landing: Attempting signup for", cleanEmail);
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              full_name: cleanFullName,
              phone: cleanPhone,
              intended_role: selectedRole,
              terms_accepted_at: termsAcceptance.acceptedAt,
              terms_version: termsAcceptance.termsVersion,
              privacy_version: termsAcceptance.privacyVersion,
            }
          }
        });
        
        if (signUpError) {
          console.error("Landing: Signup error:", signUpError);
          throw signUpError;
        }
        
        const user = signUpData.user;
        if (user) {
          console.log("Landing: Signup successful, creation will be handled by App.tsx");
        }

        if (selectedRole === 'landlord') {
          toast.success(
            signUpData.session
              ? 'Account created. Complete payment with card or M-Pesa on the next screen.'
              : 'Account created. After email confirmation, sign in to pay and activate your plan.',
          );
        } else {
          toast.success(signUpData.session ? 'Account created successfully!' : 'Confirmation email sent!');
        }
      }
    } catch (error: any) {
      console.error("Landing: Email auth exception:", error);
      toast.error(error.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-white transition-colors duration-300 selection:bg-indigo-100 overflow-x-hidden">
      {/* Sleek Premium Welcome Hero */}
      <section className="relative pt-20 pb-10 sm:pt-24 sm:pb-16 overflow-hidden bg-cover bg-center" style={{ backgroundImage: "url('/premium_house_bg.png')" }}>
        <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />

        <div className="container mx-auto px-4 relative z-10 text-center max-w-4xl py-4 sm:py-6">
          <p className="mb-3 text-[10px] font-black uppercase tracking-[0.24em] text-indigo-200 sm:text-xs">
            Property management, simplified
          </p>
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-black tracking-[-0.04em] text-white leading-tight mb-2 sm:mb-4 drop-shadow-lg">
            One home for your properties.
          </h1>
          <p className="text-sm sm:text-lg text-zinc-200 max-w-xl mx-auto font-medium leading-relaxed mb-4 sm:mb-6 drop-shadow-md px-1">
            Track listings, tenants, rent, maintenance, and bookings from a clean workspace built for Kenyan property teams.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 mt-4 sm:mt-8">
            <button
              onClick={handlePwaInstallClick}
              className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 hover:scale-[1.02] text-white rounded-2xl font-black text-sm shadow-xl shadow-indigo-500/20 active:scale-95 transition-all duration-250"
            >
              <FontAwesomeIcon icon={faDownload} className="text-sm" />
              Download app
            </button>
            <button
              onClick={() => document.getElementById('product')?.scrollIntoView({behavior: 'smooth'})}
              className="px-8 py-3 bg-white/10 hover:bg-white/15 border border-white/20 hover:border-white/30 hover:scale-[1.02] text-white rounded-2xl font-black text-sm active:scale-95 transition-all duration-250 flex items-center gap-2"
            >
              <FontAwesomeIcon icon={faArrowRight} className="text-sm text-indigo-300" />
              See the app
            </button>
            <button
              onClick={handleEnableNotifications}
              className="px-8 py-3 bg-white/10 hover:bg-white/15 border border-white/20 hover:border-white/30 hover:scale-[1.02] text-white rounded-2xl font-black text-sm active:scale-95 transition-all duration-250 flex items-center gap-2"
            >
              <FontAwesomeIcon icon={faBell} className="text-sm text-yellow-300" />
              Enable Alerts
            </button>
          </div>
        </div>
      </section>

      {/* Immediate Property Discovery Grid */}
      <section className="container mx-auto px-2 sm:px-4 pb-14 sm:pb-20 -mt-1">
        <HunterDashboard
          profile={null}
          onLoginRequired={() => setIsAuthOpen(true)}
          activeTab={propertyFilter}
          setActiveTab={setPropertyFilter}
          variant="embedded"
        />
      </section>

      <section id="product" className="bg-white px-4 py-14 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-indigo-600">Built for daily work</p>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-zinc-950 sm:text-4xl">
              The important numbers stay close.
            </h2>
            <p className="mt-3 text-sm font-medium leading-6 text-zinc-600 sm:text-base">
              See portfolio health at a glance, keep tenant work organized, and give your team a clear operating view.
            </p>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              ['Portfolio visibility', 'Listings, occupancy, collections, and costs in one place.'],
              ['Tenant operations', 'Invite tenants, manage rent records, and track maintenance work.'],
              ['Team oversight', 'Give property managers and admins a focused control center.'],
            ].map(([title, description]) => (
              <article key={title} className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
                <FontAwesomeIcon icon={faCheckCircle} className="text-emerald-500" />
                <h3 className="mt-3 text-sm font-black text-zinc-900">{title}</h3>
                <p className="mt-1 text-xs font-medium leading-5 text-zinc-600">{description}</p>
              </article>
            ))}
          </div>

          <div className="mt-9 flex snap-x snap-mandatory gap-4 overflow-x-auto px-2 pb-5 sm:justify-center sm:gap-6">
            {[
              ['/screenshots/mobile-dashboard.webp', 'Owner dashboard', 'Track rent and occupancy'],
              ['/screenshots/mobile-tenants.webp', 'Tenant operations', 'Keep every tenancy organized'],
              ['/screenshots/mobile-insights.webp', 'Portfolio insights', 'See performance clearly'],
            ].map(([src, title, description]) => (
              <figure key={src} className="w-[238px] shrink-0 snap-center sm:w-[260px]">
                <div className="relative overflow-hidden rounded-[2.25rem] border-[7px] border-zinc-950 bg-zinc-950 p-1 shadow-[0_22px_55px_rgba(15,23,42,0.2)]">
                  <div className="absolute left-1/2 top-0 z-10 h-5 w-24 -translate-x-1/2 rounded-b-2xl bg-zinc-950" />
                  <img className="aspect-[390/844] w-full rounded-[1.65rem] bg-white object-contain" src={src} alt={`MyBoma mobile app ${title.toLowerCase()} screen`} loading="lazy" />
                </div>
                <figcaption className="px-2 pt-4 text-center">
                  <h3 className="text-sm font-black text-zinc-900">{title}</h3>
                  <p className="mt-1 text-xs font-medium text-zinc-500">{description}</p>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section id="waitlist" className="border-y border-zinc-100 bg-zinc-950 px-4 py-14 text-white sm:py-20">
        <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-[1fr_0.9fr] md:items-center">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-indigo-300">Early access</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Be first to know when MyBoma opens.</h2>
            <p className="mt-4 max-w-xl text-sm font-medium leading-6 text-zinc-300 sm:text-base">
              Join the waitlist for launch updates and important product news. No clutter. Unsubscribe in one step whenever you want.
            </p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-2xl backdrop-blur sm:p-6">
            {waitlistJoined ? (
              <div className="rounded-2xl bg-emerald-400/10 p-4 text-sm font-bold text-emerald-200">
                You are on the list. Watch your inbox for MyBoma updates.
              </div>
            ) : (
              <form className="space-y-3" onSubmit={handleWaitlistSubmit}>
                <Label htmlFor="waitlist-email" className="text-xs font-bold text-zinc-200">Email address</Label>
                <Input
                  id="waitlist-email"
                  type="email"
                  value={waitlistEmail}
                  onChange={(event) => setWaitlistEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="h-12 rounded-xl border-white/10 bg-white text-zinc-900"
                  required
                />
                <Button type="submit" className="h-12 w-full rounded-xl bg-indigo-500 font-black text-white hover:bg-indigo-400" disabled={waitlistLoading}>
                  {waitlistLoading ? 'Joining...' : 'Join the waitlist'}
                </Button>
              </form>
            )}
            <p className="mt-3 text-[11px] font-medium leading-5 text-zinc-400">
              By joining, you agree to receive launch and product emails. Read our <a className="font-bold text-indigo-300 hover:text-indigo-200" href="/privacy">Privacy Policy</a>. Every email includes an unsubscribe link.
            </p>
          </div>
        </div>
      </section>

      <section id="unsubscribe" className="border-b border-zinc-100 bg-white px-4 py-8">
        <div className="mx-auto flex max-w-4xl flex-col gap-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <h2 className="text-sm font-black text-zinc-900">No longer want launch emails?</h2>
            <p className="mt-1 text-xs font-medium text-zinc-500">Enter your email and we will unsubscribe it immediately.</p>
          </div>
          <form className="flex w-full flex-col gap-2 sm:max-w-md sm:flex-row" onSubmit={handleUnsubscribe}>
            <Input
              type="email"
              aria-label="Email address to unsubscribe"
              value={unsubscribeEmail}
              onChange={(event) => setUnsubscribeEmail(event.target.value)}
              placeholder="you@example.com"
              className="h-10 rounded-xl bg-white"
              required
            />
            <Button type="submit" variant="outline" className="h-10 rounded-xl border-zinc-300 bg-white px-5 text-xs font-black" disabled={unsubscribeLoading}>
              {unsubscribeLoading ? 'Removing...' : 'Unsubscribe'}
            </Button>
          </form>
        </div>
      </section>

      <LandlordPricingSection
        onGetStarted={(tier: SubscriptionTier, billing: BillingPeriod) => {
          setLandlordSignup((prev) => ({ ...prev, tier, billing }));
          setSelectedRole('landlord');
          setAuthMode('signup');
          setIsAuthOpen(true);
        }}
      />

      {/* Auth Modal */}
      {isAuthOpen && (
        <Dialog open={isAuthOpen} onOpenChange={setIsAuthOpen}>
          <DialogContent className={`${selectedRole === 'landlord' && authMode === 'signup' ? 'sm:max-w-[480px]' : 'sm:max-w-[400px]'} w-[calc(100vw-2rem)] rounded-[2rem] p-0 border-none shadow-2xl max-h-[min(90dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem))] flex flex-col overflow-hidden mt-[var(--sat)]`}>
            <div className="bg-gradient-to-br from-zinc-900 to-black p-6 text-center text-white relative shrink-0">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center transition-transform hover:rotate-12">
                <img src="/bomalog.webp" alt="myboma" className="h-10 w-10 object-contain rounded-xl bg-white p-1" width="40" height="40" />
              </div>
              <DialogTitle className="text-2xl font-black">
                {authMode === 'login' ? 'Welcome Home' : 'Join myboma'}
              </DialogTitle>
              <DialogDescription className="text-zinc-500 mt-1 text-xs font-bold uppercase tracking-widest">
                {authMode === 'login' 
                  ? 'Access Premium OS' 
                  : 'Experience the Future'}
              </DialogDescription>
            </div>
            
            <div className="p-6 bg-white dark:bg-zinc-900 overflow-y-auto flex-1">
              <div className="space-y-5">
                {authMode === 'signup' && (
                  <div className="space-y-3 p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-700 shadow-sm animate-in fade-in slide-in-from-top-2">
                    <Label className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-400 mb-1 block">
                      I am a:
                    </Label>
                    <RadioGroup 
                      defaultValue="hunter" 
                      value={selectedRole}
                      onValueChange={(value) => setSelectedRole(value as any)}
                      className="flex gap-3"
                    >
                      <div className="flex-1">
                        <RadioGroupItem value="landlord" id="landlord-modal" className="sr-only" />
                        <Label 
                          htmlFor="landlord-modal" 
                          className={`flex flex-col items-center justify-center text-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all ${selectedRole === 'landlord' ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/10' : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300'}`}
                        >
                          <FontAwesomeIcon icon={faShieldAlt} className={`h-4 w-4 ${selectedRole === 'landlord' ? 'text-indigo-600' : 'text-zinc-400'}`} />
                          <span className="font-bold text-[9px] uppercase">Landlord / Owner</span>
                        </Label>
                      </div>
                      <div className="flex-1">
                        <RadioGroupItem value="hunter" id="hunter-modal" className="sr-only" />
                        <Label 
                          htmlFor="hunter-modal" 
                          className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all ${selectedRole === 'hunter' ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/10' : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300'}`}
                        >
                          <FontAwesomeIcon icon={faSearch} className={`h-4 w-4 ${selectedRole === 'hunter' ? 'text-indigo-600' : 'text-zinc-400'}`} />
                          <span className="font-bold text-[10px] uppercase">Property Hunter</span>
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                )}

                {authMode === 'signup' && selectedRole === 'landlord' && (
                  <LandlordSignupFields value={landlordSignup} onChange={setLandlordSignup} />
                )}

                <form onSubmit={handleEmailAuth} className="space-y-4">
                  {authMode === 'signup' && (
                    <div className="grid gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="fullName" className="text-xs font-bold ml-1">Full Name</Label>
                        <div className="relative group">
                          <FontAwesomeIcon icon={faUser} className="absolute left-4 top-3.5 h-3.5 w-3.5 text-zinc-400 group-focus-within:text-indigo-500 transition-colors" />
                          <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="John Doe" className="h-11 pl-11 rounded-xl border-zinc-200 dark:border-zinc-700 focus:ring-indigo-500 text-sm" required />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="phone" className="text-xs font-bold ml-1">Phone Number</Label>
                        <div className="relative group">
                          <FontAwesomeIcon icon={faMobileAlt} className="absolute left-4 top-3.5 h-3.5 w-3.5 text-zinc-400 group-focus-within:text-indigo-500 transition-colors" />
                          <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+254 700 000" className="h-11 pl-11 rounded-xl border-zinc-200 dark:border-zinc-700 focus:ring-indigo-500 text-sm" required />
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-xs font-bold ml-1">Email Address</Label>
                    <div className="relative group">
                      <FontAwesomeIcon icon={faEnvelope} className="absolute left-4 top-3.5 h-3.5 w-3.5 text-zinc-400 group-focus-within:text-indigo-500 transition-colors" />
                      <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" className="h-11 pl-11 rounded-xl border-zinc-200 dark:border-zinc-700 focus:ring-indigo-500 text-sm" required />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="password" className="text-xs font-bold ml-1">Password</Label>
                    <div className="relative group">
                      <FontAwesomeIcon icon={faLock} className="absolute left-4 top-3.5 h-3.5 w-3.5 text-zinc-400 group-focus-within:text-indigo-500 transition-colors" />
                      <Input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="h-11 pl-11 pr-11 rounded-xl border-zinc-200 dark:border-zinc-700 focus:ring-indigo-500 text-sm" required />
                      <button
                        type="button"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:text-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                        onClick={() => setShowPassword((current) => !current)}
                      >
                        <FontAwesomeIcon icon={showPassword ? faEyeSlash : faEye} className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {authMode === 'signup' && (
                    <div className="space-y-1.5 animate-in fade-in duration-300">
                      <Label htmlFor="confirmPassword" className="text-xs font-bold ml-1">Confirm Password</Label>
                      <div className="relative group">
                        <FontAwesomeIcon icon={faLock} className="absolute left-4 top-3.5 h-3.5 w-3.5 text-zinc-400 group-focus-within:text-indigo-500 transition-colors" />
                        <Input id="confirmPassword" type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" className="h-11 pl-11 pr-11 rounded-xl border-zinc-200 dark:border-zinc-700 focus:ring-indigo-500 text-sm" required />
                        <button
                          type="button"
                          aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:text-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                          onClick={() => setShowConfirmPassword((current) => !current)}
                        >
                          <FontAwesomeIcon icon={showConfirmPassword ? faEyeSlash : faEye} className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {authMode === 'login' && (
                    <div className="flex items-center gap-3 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/50">
                      <input
                        type="checkbox"
                        id="rememberMe"
                        className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                      />
                      <Label htmlFor="rememberMe" className="cursor-pointer text-[11px] font-bold text-zinc-600 dark:text-zinc-300">
                        Keep me logged in
                      </Label>
                    </div>
                  )}

                  <div className="pt-2">
                    {authMode === 'signup' && (
                      <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-700 mb-4">
                        <input type="checkbox" id="terms" className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500" checked={agreed} onChange={(e) => handleAgreementChange(e.target.checked)} />
                        <Label htmlFor="terms" className="text-[10px] text-zinc-500 dark:text-zinc-400 cursor-pointer font-medium leading-tight">
                          I accept the{' '}
                          <button type="button" className="text-indigo-600 font-bold underline-offset-2 hover:underline" onClick={(event) => { event.preventDefault(); setLegalDoc('terms'); }}>
                            Terms
                          </button>{' '}
                          and{' '}
                          <button type="button" className="text-indigo-600 font-bold underline-offset-2 hover:underline" onClick={(event) => { event.preventDefault(); setLegalDoc('privacy'); }}>
                            Privacy Policy
                          </button>.
                        </Label>
                      </div>
                    )}

                    <Button type="submit" className="w-full h-12 bg-gradient-to-r from-indigo-600 to-purple-600 hover:scale-[1.02] text-white rounded-2xl font-black text-sm shadow-lg shadow-indigo-200 dark:shadow-none transition-all active:scale-95" disabled={loading}>
                      {loading 
                        ? <FontAwesomeIcon icon={faCheckCircle} className="animate-spin" />
                        : (authMode === 'login'
                          ? 'Access Dashboard'
                          : selectedRole === 'landlord'
                            ? 'Create landlord account'
                            : 'Create Account')}
                    </Button>
                    {authMode === 'signup' && selectedRole === 'landlord' && (
                      <p className="mt-2 text-center text-[10px] font-medium text-zinc-500">
                        You will pay by card or M-Pesa STK after sign-up — no manual transfers.
                      </p>
                    )}
                  </div>
                  
                  <div className="text-center pt-2">
                    <button type="button" onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')} className="text-[10px] text-zinc-400 font-black uppercase tracking-widest hover:text-indigo-600 transition-colors">
                      {authMode === 'login' ? "New here? Sign Up" : "Have an account? Log In"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
      {legalDoc && (
        <Dialog open={Boolean(legalDoc)} onOpenChange={(open) => !open && setLegalDoc(null)}>
          <DialogContent className="sm:max-w-[680px] max-h-[82vh] overflow-y-auto rounded-3xl p-6">
            <DialogHeader>
              <DialogTitle className="text-xl font-black text-zinc-900">
                {LEGAL_DOCUMENTS[legalDoc].title}
              </DialogTitle>
              <DialogDescription>
                Effective {LEGAL_DOCUMENTS[legalDoc].effectiveDate} · Version {LEGAL_DOCUMENTS[legalDoc].version}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-5 py-2">
              {LEGAL_DOCUMENTS[legalDoc].sections.map((section) => (
                <section key={section.title} className="space-y-1">
                  <h3 className="text-sm font-black text-zinc-900">{section.title}</h3>
                  <p className="text-sm leading-6 text-zinc-600">{section.body}</p>
                </section>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* PWA Install Banner */}
      {pwaVisible && (
        <div
          role="dialog"
          aria-label="Install myboma app"
          className="pwa-install-banner fixed left-1/2 -translate-x-1/2 z-50 w-[calc(100vw-2rem)] max-w-sm"
          style={{ animation: 'slideUp 0.4s cubic-bezier(0.34,1.56,0.64,1) both' }}
        >
          <div className="bg-zinc-900 text-white rounded-[1.5rem] shadow-2xl px-5 py-4 flex items-center gap-4">
            <img src="/bomalog.webp" alt="myboma" className="h-11 w-11 rounded-xl shrink-0 shadow-lg bg-white p-1 object-contain" width="44" height="44" />
            <div className="flex-1 min-w-0">
              <p className="font-black text-sm leading-tight">Install myboma</p>
              <p className="text-[11px] text-zinc-400 font-medium mt-0.5">Add to home screen for the best experience</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={handlePwaInstall}
                className="bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-xs font-black px-3.5 py-2 rounded-xl transition-all"
              >
                Install
              </button>
              <button
                onClick={handlePwaDismiss}
                aria-label="Dismiss"
                className="text-zinc-500 hover:text-zinc-300 text-lg leading-none px-1 transition-colors"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translate(-50%, 24px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
    </div>
  );
}
