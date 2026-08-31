import { useState, useEffect, useRef } from 'react';
import HunterDashboard from './HunterDashboard';
import { getAuthPersistence, setAuthPersistence, authClient } from '../lib/auth-client';
import { promptForPush } from '../App';
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
  faBell,
  faChartPie,
  faUsers
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
import { Capacitor } from '@capacitor/core';
import { tenantConfig } from '../config/tenant';

// Move PWA prompt to module level so it persists across renders
let _pwaPromptEvent: any = null;

interface LandingPageProps {
  isAuthOpen: boolean;
  setIsAuthOpen: (open: boolean) => void;
}

export default function LandingPage({ isAuthOpen, setIsAuthOpen }: LandingPageProps) {
  const isNative = Capacitor.isNativePlatform();
  const [propertyFilter, setPropertyFilter] = useState('all');
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
      .then(() => toast.success(`You have been unsubscribed from ${tenantConfig.appName} emails.`))
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
      toast.success(`You are on the ${tenantConfig.appName} waitlist.`);
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
      toast.success(`You have been unsubscribed from ${tenantConfig.appName} emails.`);
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
      // Note: the selected role can't ride along an OAuth redirect the way it rides
      // in the signup request body for email/password (see handleEmailAuth) — a
      // Google signup with no matching `invitations` row always lands as 'hunter'
      // (server/auth.ts seedProfileForNewAuthUser), same as the old Supabase trigger's
      // reliable behavior.
      if (selectedRole === 'landlord' && authMode === 'signup') {
        localStorage.setItem(PENDING_LANDLORD_SUBSCRIPTION_KEY, JSON.stringify(landlordSignup));
      }
      setAuthPersistence(authMode === 'login' ? rememberMe : true);
      recordTermsAcceptance();
      try {
        const { error } = await authClient.signIn.social({
          provider: 'google',
          callbackURL: window.location.origin,
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

    const handleEmailAuth = async (e?: React.FormEvent | React.MouseEvent) => {
      if (e) e.preventDefault();
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

    setAuthPersistence(authMode === 'login' ? rememberMe : true);
    setLoading(true);

    try {
      if (authMode === 'login') {
        console.log("Landing: Attempting login for", cleanEmail);
        const { data, error } = await authClient.signIn.email({
          email: cleanEmail,
          password,
          rememberMe,
        });
        if (error) {
          console.error("Landing: Login error:", error);
          throw new Error(error.message || 'Login failed');
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
        // Extra fields (intended_role, phone, terms_*) ride along in the request body
        // and are read server-side by databaseHooks.user.create.after (server/auth.ts)
        // to seed the public.users profile row — see the migration plan.
        const { data: signUpData, error: signUpError } = await authClient.signUp.email({
          email: cleanEmail,
          password,
          name: cleanFullName,
          rememberMe: true,
          phone: cleanPhone,
          intended_role: selectedRole,
          terms_accepted_at: termsAcceptance.acceptedAt,
          terms_version: termsAcceptance.termsVersion,
          privacy_version: termsAcceptance.privacyVersion,
        } as Parameters<typeof authClient.signUp.email>[0]);

        if (signUpError) {
          console.error("Landing: Signup error:", signUpError);
          throw new Error(signUpError.message || 'Signup failed');
        }

        console.log("Landing: Signup successful", signUpData?.user?.id);

        // No email verification is configured, so signup always returns a live session.
        toast.success(
          selectedRole === 'landlord'
            ? 'Account created. Complete payment with card or M-Pesa on the next screen.'
            : 'Account created successfully!',
        );
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
      {!isNative && (
        <section className="relative min-h-[85vh] flex items-center pt-20 pb-10 sm:pt-24 sm:pb-16 overflow-hidden bg-cover bg-center" style={{ backgroundImage: "url('/premium_house_bg.png')" }}>
          {/* High-Trust Architectural Glass Overlay */}
          <div className="absolute inset-0 bg-slate-950/75 backdrop-blur-[2px]" />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/80 via-slate-950/60 to-slate-950/90 pointer-events-none" />

          <div className="container mx-auto px-4 relative z-10">
            <div className="max-w-4xl mx-auto text-center py-8 sm:py-12 px-6 rounded-3xl bg-slate-900/80 border border-slate-800 backdrop-blur-xl shadow-2xl">
              <p className="mb-4 text-[10px] font-black uppercase tracking-[0.3em] text-indigo-400 sm:text-xs">
                Property management, simplified
              </p>
              <h1 className="text-4xl sm:text-6xl md:text-7xl font-black tracking-[-0.04em] text-white leading-[0.98] mb-6">
                One home for your <span className="text-indigo-400 font-black">properties.</span>
              </h1>
              <p className="text-base sm:text-lg text-slate-300 max-w-2xl mx-auto font-normal leading-relaxed mb-10">
                Track listings, tenants, rent, and maintenance from a sovereign digital workspace built for modern property teams.
              </p>

              <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
                <div className="flex flex-col sm:flex-row gap-3">
                  <a
                    href={tenantConfig.appLinks.android}
                    download="app.apk"
                    className="group relative flex items-center justify-center gap-2.5 px-6 py-3.5 bg-white text-slate-950 rounded-xl font-bold text-sm shadow-md hover:bg-slate-100 active:scale-[0.98] transition-all cursor-pointer"
                  >
                    <FontAwesomeIcon icon={faDownload} className="text-emerald-600" />
                    Download APK
                  </a>
                  <a
                    href={tenantConfig.appLinks.ios}
                    download="app.ipa"
                    className="group relative flex items-center justify-center gap-2.5 px-6 py-3.5 bg-white text-slate-950 rounded-xl font-bold text-sm shadow-md hover:bg-slate-100 active:scale-[0.98] transition-all cursor-pointer"
                  >
                    <FontAwesomeIcon icon={faDownload} className="text-slate-900" />
                    Download iOS App
                  </a>
                </div>
                <button
                  onClick={() => document.getElementById('product')?.scrollIntoView({behavior: 'smooth'})}
                  className="group flex items-center gap-2.5 px-7 py-3.5 bg-slate-800/90 hover:bg-slate-800 border border-slate-700 text-white rounded-xl font-bold text-sm active:scale-[0.98] transition-all cursor-pointer"
                >
                  <FontAwesomeIcon icon={faArrowRight} className="text-indigo-400 group-hover:translate-x-0.5 transition-transform" />
                  Explore Features
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Immediate Property Discovery Grid */}
      <section className={isNative ? "container mx-auto px-2 sm:px-4 py-4 pt-safe" : "container mx-auto px-2 sm:px-4 pb-14 sm:pb-20 -mt-1"}>
        <HunterDashboard
          profile={null}
          onLoginRequired={() => setIsAuthOpen(true)}
          activeTab={propertyFilter}
          setActiveTab={setPropertyFilter}
          variant="embedded"
        />
      </section>

      {!isNative && (
        <>
          {/* Social Proof Section */}
          <section className="bg-slate-50/80 border-y border-slate-200 py-8 overflow-hidden">
            <div className="container mx-auto px-4">
              <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-12 md:gap-16">
                <div className="flex items-center gap-3.5 bg-white px-5 py-3 rounded-2xl shadow-xs border border-slate-200">
                  <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center text-white font-black text-xs">MB</div>
                  <span className="font-medium text-slate-600 tracking-tight text-sm">Trusted by <span className="text-slate-900 font-bold tabular-nums">50+ Teams</span></span>
                </div>
                <div className="flex items-center gap-3.5 bg-white px-5 py-3 rounded-2xl shadow-xs border border-slate-200">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center">
                    <FontAwesomeIcon icon={faCheckCircle} className="text-emerald-600 text-base" />
                  </div>
                  <span className="font-medium text-slate-600 tracking-tight text-sm"><span className="tabular-nums font-bold text-slate-900">Ksh 10M+</span> Tracked</span>
                </div>
                <div className="flex items-center gap-3.5 bg-white px-5 py-3 rounded-2xl shadow-xs border border-slate-200">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center">
                    <FontAwesomeIcon icon={faUsers} className="text-indigo-600 text-base" />
                  </div>
                  <span className="font-medium text-slate-600 tracking-tight text-sm"><span className="tabular-nums font-bold text-slate-900">500+</span> Tenants</span>
                </div>
              </div>
            </div>
          </section>

          <section id="product" className="relative bg-slate-50/50 px-4 py-20 sm:py-28 overflow-hidden">
            <div className="mx-auto max-w-7xl relative">
              <div className="mx-auto max-w-3xl text-center mb-14 sm:mb-20">
                <h2 className="text-3xl font-black tracking-tight text-slate-900 sm:text-5xl mb-4">
                  The important numbers <span className="text-indigo-600">stay close.</span>
                </h2>
                <p className="text-base sm:text-lg font-normal leading-relaxed text-slate-600">
                  See portfolio health at a glance, keep tenant work organized, and give your team a clear operating view from any device.
                </p>
              </div>

              <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
                {/* Feature Cards Column */}
                <div className="space-y-4">
                  {[
                    { 
                      title: 'Portfolio Visibility', 
                      description: 'Listings, occupancy, collections, and costs in one unified dashboard.',
                      icon: faChartPie,
                      color: 'text-indigo-600',
                      bg: 'bg-indigo-50'
                    },
                    { 
                      title: 'Tenant Operations', 
                      description: 'Invite tenants, manage rent records, and track maintenance work in real-time.',
                      icon: faUsers,
                      color: 'text-purple-600',
                      bg: 'bg-purple-50'
                    },
                    { 
                      title: 'Team Oversight', 
                      description: 'Give property managers and admins a focused control center with granular permissions.',
                      icon: faShieldAlt,
                      color: 'text-slate-700',
                      bg: 'bg-slate-100'
                    },
                  ].map((feature) => (
                    <article 
                      key={feature.title} 
                      className="group p-6 rounded-2xl border border-slate-200 bg-white hover:border-indigo-200 hover:shadow-md transition-all cursor-pointer"
                    >
                      <div className="flex gap-4">
                        <div className={`shrink-0 w-11 h-11 rounded-xl ${feature.bg} flex items-center justify-center`}>
                          <FontAwesomeIcon icon={feature.icon} className={`text-lg ${feature.color}`} />
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-slate-900 mb-1">{feature.title}</h3>
                          <p className="text-sm font-normal leading-relaxed text-slate-500">{feature.description}</p>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>

                {/* App Screenshots Column */}
                <div className="relative mt-8 lg:mt-0 lg:ml-8 h-[460px] sm:h-[540px] flex items-center justify-center">
                  {/* Main Phone */}
                  <div className="relative z-20 w-[240px] sm:w-[270px] shadow-2xl rounded-[2.5rem] border-[6px] border-slate-900 bg-slate-950 overflow-hidden">
                     <img src="/screenshots/mobile-dashboard.webp" alt="Dashboard" className="w-full aspect-[390/844] object-cover" />
                  </div>
                  
                  {/* Secondary Phones */}
                  <div className="absolute z-10 -left-4 sm:left-2 top-1/2 -translate-y-1/2 w-[190px] sm:w-[220px] opacity-50 hover:opacity-100 transition-opacity duration-300 rounded-[2rem] border-[4px] border-slate-900 bg-slate-950 overflow-hidden hidden sm:block">
                     <img src="/screenshots/mobile-tenants.webp" alt="Tenants" className="w-full aspect-[390/844] object-cover" />
                  </div>
                  
                  <div className="absolute z-10 -right-4 sm:right-2 top-1/2 -translate-y-1/2 w-[190px] sm:w-[220px] opacity-50 hover:opacity-100 transition-opacity duration-300 rounded-[2rem] border-[4px] border-slate-900 bg-slate-950 overflow-hidden hidden sm:block">
                     <img src="/screenshots/mobile-insights.webp" alt="Insights" className="w-full aspect-[390/844] object-cover" />
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section id="waitlist" className="border-y border-slate-800 bg-slate-950 px-4 py-14 text-white sm:py-20">
            <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-[1fr_0.9fr] md:items-center">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-indigo-400">Early access</p>
                <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Be first to know when {tenantConfig.appName} opens.</h2>
                <p className="mt-4 max-w-xl text-sm font-normal leading-6 text-slate-300 sm:text-base">
                  Join the waitlist for launch updates and important product news. No clutter. Unsubscribe in one step whenever you want.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-2xl sm:p-6">
                {waitlistJoined ? (
                  <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4 text-sm font-bold text-emerald-300">
                    You are on the list. Watch your inbox for {tenantConfig.appName} updates.
                  </div>
                ) : (
                  <form className="space-y-3.5" onSubmit={handleWaitlistSubmit}>
                    <Label htmlFor="waitlist-email" className="text-xs font-semibold text-slate-200">Email address</Label>
                    <Input
                      id="waitlist-email"
                      type="email"
                      value={waitlistEmail}
                      onChange={(event) => setWaitlistEmail(event.target.value)}
                      placeholder="you@example.com"
                      className="h-11 rounded-xl border-slate-700 bg-slate-950 text-white placeholder:text-slate-500 focus-visible:ring-indigo-500"
                      required
                    />
                    <Button type="submit" className="h-11 w-full rounded-xl bg-indigo-600 font-bold text-white hover:bg-indigo-500" disabled={waitlistLoading}>
                      {waitlistLoading ? 'Joining...' : 'Join the waitlist'}
                    </Button>
                  </form>
                )}
                <p className="mt-3 text-[11px] font-normal leading-5 text-slate-400">
                  By joining, you agree to receive launch and product emails. Read our <a className="font-semibold text-indigo-400 hover:text-indigo-300" href="/privacy">Privacy Policy</a>. Every email includes an unsubscribe link.
                </p>
              </div>
            </div>
          </section>

          <section id="unsubscribe" className="border-b border-slate-200 bg-white px-4 py-8">
            <div className="mx-auto flex max-w-4xl flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div>
                <h2 className="text-sm font-bold text-slate-900">No longer want launch emails?</h2>
                <p className="mt-1 text-xs font-normal text-slate-500">Enter your email and we will unsubscribe it immediately.</p>
              </div>
              <form className="flex w-full flex-col gap-2 sm:max-w-md sm:flex-row" onSubmit={handleUnsubscribe}>
                <Input
                  type="email"
                  aria-label="Email address to unsubscribe"
                  value={unsubscribeEmail}
                  onChange={(event) => setUnsubscribeEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="h-10 rounded-xl bg-white border-slate-300"
                  required
                />
                <Button type="submit" variant="outline" className="h-10 rounded-xl border-slate-300 bg-white px-5 text-xs font-bold text-slate-700 hover:bg-slate-100" disabled={unsubscribeLoading}>
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
        </>
      )}

      {/* Auth Modal */}
      {isAuthOpen && (
        <Dialog open={isAuthOpen} onOpenChange={setIsAuthOpen}>
          <DialogContent className={`${selectedRole === 'landlord' && authMode === 'signup' ? 'sm:max-w-[480px]' : 'sm:max-w-[400px]'} w-[calc(100vw-2rem)] rounded-[2rem] p-0 border-none shadow-2xl max-h-[min(90dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem))] flex flex-col overflow-hidden mt-[var(--sat)]`}>
            <div className="bg-gradient-to-br from-zinc-900 to-black p-6 text-center text-white relative shrink-0">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center transition-transform hover:rotate-12">
                <img src={tenantConfig.logoUrl} alt={tenantConfig.appName} className="h-10 w-10 object-contain rounded-xl bg-white p-1" width="40" height="40" />
              </div>
              <DialogTitle className="text-2xl font-black">
                {authMode === 'login' ? 'Welcome Home' : `Join ${tenantConfig.appName}`}
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

                    <Button type="submit" onClick={handleEmailAuth} className="w-full h-12 bg-gradient-to-r from-indigo-600 to-purple-600 hover:scale-[1.02] text-white rounded-2xl font-black text-sm shadow-lg shadow-indigo-200 dark:shadow-none transition-all active:scale-95" disabled={loading}>
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

    </div>
  );
}
