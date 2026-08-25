import { useState, useEffect, useRef, useCallback } from 'react';
import { authClient } from './lib/auth-client';
import { getSession, completePasswordReset } from './lib/api';
import LandingPage from './components/LandingPage';
import LandlordDashboard from './components/LandlordDashboard';
import TenantDashboard from './components/TenantDashboard';
import HunterDashboard from './components/HunterDashboard';
import AdminDashboard from './components/AdminDashboard';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import SettingsPage from './components/SettingsPage';
import Footer from './components/Footer';
import ImpersonationBanner from './components/ImpersonationBanner';
import PublicLegalPage from './components/PublicLegalPage';
import { tenantConfig } from './config/tenant';

import { logAudit } from './lib/audit';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faExclamationTriangle, 
  faSync,
  faChartPie,
  faUsers,
  faLink,
  faBuilding,
  faBars,
  faTimes,
  faTools,
  faWallet,
  faBolt,
  faGlobe,
  faClipboardList,
  faCog,
  faHome,
  faSignOutAlt,
  faBell
} from '@fortawesome/free-solid-svg-icons';
import { Toaster, toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import OnboardingTour, { shouldShowOnboarding } from './components/OnboardingTour';
import LandlordSubscriptionGate from './components/LandlordSubscriptionGate';
import OneSignalWeb from 'react-onesignal';
import OneSignalNative from '@onesignal/capacitor-plugin';
import { Capacitor } from '@capacitor/core';
import { isLandlordSubscriptionActive } from './lib/landlordSubscription';
export type UserRole = 'landlord' | 'tenant' | 'hunter' | 'admin';

let oneSignalWebInitialized = false;
let oneSignalNativeInitialized = false;

export const promptForPush = async () => {
  if (Capacitor.isNativePlatform()) {
    if (oneSignalNativeInitialized) {
      try {
        await OneSignalNative.Notifications.requestPermission(true);
      } catch (err) {
        console.error("OneSignalNative promptForPush error:", err);
      }
    } else {
      console.warn("OneSignal Native not initialized yet.");
    }
  } else {
    if (oneSignalWebInitialized) {
      try {
        await OneSignalWeb.Slidedown.promptPush();
      } catch (err) {
        console.error("OneSignalWeb promptForPush error:", err);
      }
    } else {
      console.warn("OneSignal Web not initialized yet.");
    }
  }
};

export interface UserProfile {
  uid: string;
  platformId?: string;
  email: string;
  displayName: string;
  role: UserRole;
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
  phone?: string;
  address?: string;
  avatarUrl?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountName?: string;
  rentPayoutMethod?: 'cash' | 'mpesa' | 'bank';
  cashPayoutNotes?: string;
  subscriptionPlan?: 'monthly' | 'quarterly' | 'yearly';
  subscriptionStatus?: string;
  subscriptionExpiresAt?: string;
  createdAt: string;
  mustChangePassword?: boolean;
  status?: string;
  termsAcceptedAt?: string;
  termsVersion?: string;
  privacyVersion?: string;
}

const VALID_ROLES: UserRole[] = ['landlord', 'tenant', 'hunter', 'admin'];

const normalizeRole = (role?: string | null): UserRole => (
  VALID_ROLES.includes(role as UserRole) ? role as UserRole : 'hunter'
);

const normalizeProfile = (data: any): UserProfile => {
  const email = (data.email || '').toLowerCase();
  const isSuperAdmin = Boolean(data.isSuperAdmin);

  return {
    ...data,
    email,
    displayName: data.displayName || (isSuperAdmin ? 'Super Admin' : 'User'),
    role: isSuperAdmin ? 'admin' : normalizeRole(data.role),
    isAdmin: Boolean(data.isAdmin) || isSuperAdmin,
    isSuperAdmin,
    createdAt: data.createdAt || new Date().toISOString(),
    mustChangePassword: Boolean(data.mustChangePassword),
  } as UserProfile;
};

export default function App() {
  const sessionState = authClient.useSession() as {
    data: {user: {id: string; email: string; name?: string}} | null;
    isPending: boolean;
  };
  const user = sessionState.data?.user ?? null;
  const sessionPending = sessionState.isPending;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [activeView, setActiveView] = useState<UserRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [impersonatedProfile, setImpersonatedProfile] = useState<UserProfile | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  // Lifted tab state — shared between Sidebar and the active dashboard
  const [activeTab, setActiveTab] = useState<string>('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    // Initialize OneSignal
    const initOneSignal = async () => {
      try {
        const handleSubChange = (event: any) => {
          if (event.current.optedIn) {
            if (Capacitor.isNativePlatform()) {
              if (oneSignalNativeInitialized) {
                OneSignalNative.InAppMessages.addTrigger("ai_implementation_campaign_email_journey", "true");
              }
            } else {
              if (oneSignalWebInitialized) {
                (OneSignalWeb as any).InAppMessages.addTrigger("ai_implementation_campaign_email_journey", "true");
              }
            }
          }
        };

        if (Capacitor.isNativePlatform()) {
          if (!oneSignalNativeInitialized) {
            oneSignalNativeInitialized = true;
            OneSignalNative.initialize("16fe44a9-e285-4d7d-85f0-8b82014b9a71");
            (OneSignalNative.User as any).PushSubscription.addEventListener('change', handleSubChange);
          }
        } else {
          if (!oneSignalWebInitialized) {
            const isWindowInitted = typeof window !== 'undefined' && (window as any).OneSignal?.isInitted?.();
            if (isWindowInitted) {
              oneSignalWebInitialized = true;
            } else {
              try {
                await OneSignalWeb.init({
                  appId: "16fe44a9-e285-4d7d-85f0-8b82014b9a71",
                  allowLocalhostAsSecureOrigin: true,
                });
                oneSignalWebInitialized = true;
              } catch (initErr: any) {
                if (!initErr.message?.includes('already initialized')) {
                  console.warn("OneSignal init issue:", initErr);
                }
              }
            }
            if (oneSignalWebInitialized) {
              if ((OneSignalWeb.User as any)?.PushSubscription) {
                (OneSignalWeb.User as any).PushSubscription.addEventListener('change', handleSubChange);
              } else if ((OneSignalWeb.User as any)?.pushSubscription) {
                (OneSignalWeb.User as any).pushSubscription.addEventListener('change', handleSubChange);
              }
            }
          }
        }
      } catch (err) {
        console.error("OneSignal initialization error:", err);
      }
    };
    initOneSignal();

    // Patch history.replaceState to dispatch a custom event
    const originalReplaceState = history.replaceState;
    history.replaceState = function(...args) {
      originalReplaceState.apply(this, args as any);
      window.dispatchEvent(new Event('urlchange'));
    };
  }, []);

  // Forced password reset state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);

    if (newPassword.length < 8) {
      setResetError("Password must be at least 8 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setResetError("Passwords do not match.");
      return;
    }

    if (!profile) return;

    setResetLoading(true);
    try {
      // Sets the new password and clears mustChangePassword server-side, atomically.
      await completePasswordReset(newPassword);

      logAudit('PROFILE_UPDATE', 'user', profile.uid, { action: 'forced_password_reset' });

      setProfile(prev => prev ? { ...prev, mustChangePassword: false } : null);
      
      // Clean up inputs
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      console.error("Forced password reset failed:", err);
      setResetError(err.message || "An unexpected error occurred. Please try again.");
    } finally {
      setResetLoading(false);
    }
  };

  const handleImpersonate = (target: UserProfile) => {
    if (!profile?.isSuperAdmin) {
      console.warn("Unauthorized impersonation attempt");
      return;
    }
    setImpersonatedProfile(target);
    logAudit('ADMIN_IMPERSONATE_START', 'user', target.uid, { targetEmail: target.email });
  };

  const handleExitImpersonation = () => {
    if (impersonatedProfile) {
      logAudit('ADMIN_IMPERSONATE_END', 'user', impersonatedProfile.uid, { targetEmail: impersonatedProfile.email });
    }
    setImpersonatedProfile(null);
  };

  const userRef = useRef(user);
  const profileRef = useRef(profile);

  useEffect(() => {
    userRef.current = user;
    profileRef.current = profile;
  }, [user, profile]);

  // Sync OneSignal's device identity with the current auth user (unchanged from before).
  const syncOneSignalIdentity = useCallback((uid: string | null) => {
    if (Capacitor.isNativePlatform()) {
      if (!oneSignalNativeInitialized) return;
      try {
        if (uid) OneSignalNative.login(uid); else OneSignalNative.logout();
      } catch (e) {
        console.error('OneSignalNative identity sync failed:', e);
      }
    } else {
      if (!oneSignalWebInitialized) return;
      try {
        if (uid) OneSignalWeb.login(uid); else OneSignalWeb.logout();
      } catch (e) {
        console.error('OneSignalWeb identity sync failed:', e);
      }
    }
  }, []);

  // Loads (or reloads) the app profile for the current session via the BFF's
  // /session endpoint, which returns req.profile (see app.ts requireAuth).
  useEffect(() => {
    let isMounted = true;

    // Safety timeout: if auth doesn't resolve in 8 seconds, stop loading
    const safetyTimeout = setTimeout(() => {
      if (isMounted && loading) {
        console.warn('App: Auth check timed out (8s)');
        setLoading(false);
      }
    }, 8000);

    const loadProfile = async (retryCount = 0): Promise<void> => {
      try {
        const { profile: profileData } = await getSession();
        if (!isMounted) return;
        const p = normalizeProfile(profileData);
        setProfile(p);
        if (!activeView) setActiveView(p.role);
        if (shouldShowOnboarding(p.role)) setShowOnboarding(true);
        setError(null);
      } catch (err: any) {
        console.error('App: Profile handling error:', err);
        if (!isMounted) return;
        if (retryCount < 1) {
          await loadProfile(retryCount + 1);
          return;
        }
        setError(err.message || 'Failed to load profile');
      }
    };

    if (sessionPending) return () => { isMounted = false; };

    if (user) {
      const pref = localStorage.getItem(`myboma_default_page_${user.id}`);
      if (pref) setActiveTab(pref);
      syncOneSignalIdentity(user.id);
      loadProfile().finally(() => {
        if (isMounted) {
          setLoading(false);
          clearTimeout(safetyTimeout);
        }
      });
    } else {
      setProfile(null);
      setActiveView(null);
      setError(null);
      syncOneSignalIdentity(null);
      setLoading(false);
      clearTimeout(safetyTimeout);
    }

    return () => {
      isMounted = false;
      clearTimeout(safetyTimeout);
    };
  }, [user?.id, sessionPending, syncOneSignalIdentity]);

  // Polls for profile changes (role/subscription updates made elsewhere, e.g. by an
  // admin) — replaces the old Supabase Realtime `profile-changes-*` channel.
  useEffect(() => {
    if (!user?.id) return;
    const interval = setInterval(() => {
      getSession()
        .then(({ profile: profileData }) => {
          const p = normalizeProfile(profileData);
          setProfile(p);
          setActiveView(prev => (!p.isAdmin ? p.role : prev || p.role));
        })
        .catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, [user?.id]);

  const refreshProfile = useCallback(async () => {
    if (!user?.id) return;
    const { profile: profileData } = await getSession();
    setProfile(normalizeProfile(profileData));
  }, [user?.id]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    let handledPaymentReturn = false;
    const subscriptionPayment = params.get('subscription_payment');
    const rentPayment = params.get('rent_payment');

    const isSubscriptionPending = subscriptionPayment === 'success' || subscriptionPayment === 'processing';

    if (isSubscriptionPending) {
      const currentUserId = user?.id;
      if (currentUserId) {
        if (subscriptionPayment === 'success') {
          toast.success('Payment received. Activating your subscription…');
        } else {
          toast('Subscription payment is processing. Your plan will activate after confirmation.');
        }
        handledPaymentReturn = true;
        
        // Poll for profile update because IPN might be slightly delayed
        let attempts = 0;
        const poll = setInterval(async () => {
          attempts++;
          const { profile: data } = await getSession().catch(() => ({ profile: null as any }));

          const isActive = data?.subscriptionStatus === 'active' && data?.subscriptionExpiresAt;
          console.log(`[Polling Activation] Attempt ${attempts}: status=${data?.subscriptionStatus}, role=${data?.role}, hasExpiry=${!!data?.subscriptionExpiresAt}`);
          
          if (isActive || attempts > 50) {
            clearInterval(poll);
            console.log(`[Polling Finished] isActive=${isActive}, timing out=${attempts > 50}`);
            await refreshProfile();
            
            if (isActive) {
              toast.success('Subscription active! Welcome back.');
            } else if (attempts > 50) {
              toast.error('Activation is taking longer than expected. Please refresh in a moment.');
            }
            
            // Clear URL only after we have confirmed activation or timed out
            window.history.replaceState({}, '', window.location.pathname);
            window.dispatchEvent(new Event('urlchange'));
          }
        }, 2000);

        // Cleanup interval if component unmounts or effect re-runs
        return () => clearInterval(poll);
      }
    } else if (subscriptionPayment === 'cancelled') {
      toast.error('Subscription payment was cancelled or not completed.');
      handledPaymentReturn = true;
    }

    if (rentPayment === 'success') {
      toast.success('Rent payment received. Your receipt will appear shortly.');
      handledPaymentReturn = true;
    } else if (rentPayment === 'processing') {
      toast('Rent payment is processing. Your receipt will appear after confirmation.');
      handledPaymentReturn = true;
    } else if (rentPayment === 'cancelled') {
      toast.error('Rent payment was cancelled or not completed.');
      handledPaymentReturn = true;
    }

    // For non-polling cases, clear immediately. For polling, it's handled inside the interval.
    if (handledPaymentReturn && !isSubscriptionPending) {
      window.history.replaceState({}, '', window.location.pathname);
      window.dispatchEvent(new Event('urlchange'));
    }
  }, [user?.id, refreshProfile]);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-6">
          {/* Logo blur-to-clear skeleton */}
          <div className="relative flex items-center justify-center">
            {/* Glow halo behind logo */}
            <div className="absolute inset-0 rounded-3xl bg-zinc-200/60 blur-xl animate-pulse scale-150" />
            {/* The logo image — starts blurred, reveals to sharp */}
            <img
              src={tenantConfig.logoUrl}
              alt={tenantConfig.appName}
              className="relative h-20 w-20 object-contain rounded-2xl animate-logo-reveal shadow-xl bg-white p-2"
            />
          </div>
          {/* Brand text fades in after logo */}
          <div className="flex flex-col items-center gap-1" style={{ animation: 'fadeInUp 0.8s 0.6s ease-out both' }}>
            <span className="text-2xl font-black tracking-tighter text-zinc-900 dark:text-white uppercase"
              style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
              {tenantConfig.appName}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-[0.35em] text-zinc-400">
              {tenantConfig.companyName}
            </span>
          </div>
          {/* Subtle progress indicator */}
          <div className="w-24 h-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
            <div className="h-full bg-zinc-300 dark:bg-zinc-600 rounded-full animate-pulse w-1/2 mx-auto" />
          </div>
        </div>
        <style>{`
          @keyframes fadeInUp {
            from { opacity: 0; transform: translateY(8px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    );
  }

  if (!user) {
    const legalPageType =
      window.location.pathname === '/terms'
        ? 'terms'
        : window.location.pathname === '/privacy'
          ? 'privacy'
          : null;

    return (
      <div className="db app-shell min-h-screen bg-[#f8f9fa]">
        <Navbar user={null} profile={null} onLoginClick={() => setIsAuthOpen(true)} />
        <main>
          {legalPageType ? (
            <PublicLegalPage type={legalPageType} />
          ) : (
            <LandingPage isAuthOpen={isAuthOpen} setIsAuthOpen={setIsAuthOpen} />
          )}
        </main>
        <Footer />
        <Toaster />
      </div>
    );
  }

  const isResetRequired = Boolean(profile?.mustChangePassword) && !impersonatedProfile;

  if (isResetRequired) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-slate-50/70 dark:bg-slate-950 p-4 relative overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-slate-200/40 dark:bg-slate-800/20 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-100/40 dark:bg-indigo-950/20 blur-[120px] pointer-events-none" />
        
        <div className="relative w-full max-w-[440px] bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xl rounded-2xl p-8 transition-all animate-in fade-in zoom-in-95 duration-200 flex flex-col gap-6">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="h-14 w-14 rounded-2xl bg-slate-900 dark:bg-slate-50 text-white dark:text-slate-900 flex items-center justify-center shadow-md">
              <FontAwesomeIcon icon={faCog} className="text-xl" />
            </div>
            
            <div className="space-y-1.5">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Secure Your Account</h2>
              <p className="text-xs font-normal text-slate-500 dark:text-slate-400 leading-relaxed max-w-sm">
                To complete your onboarding, please update your temporary credentials with a permanent secure password.
              </p>
            </div>
          </div>
          
          <form onSubmit={handlePasswordReset} className="flex flex-col gap-5">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">New Password</label>
                <Input 
                  type="password" 
                  required 
                  placeholder="Minimum 8 characters" 
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="h-10"
                />
              </div>
              
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Confirm Password</label>
                <Input 
                  type="password" 
                  required 
                  placeholder="Re-enter your new password" 
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="h-10"
                />
              </div>
            </div>
            
            {resetError && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200/80 text-rose-700 text-xs font-semibold animate-in fade-in duration-200">
                <FontAwesomeIcon icon={faExclamationTriangle} className="text-sm shrink-0" />
                <span>{resetError}</span>
              </div>
            )}
            
            <Button 
              type="submit" 
              disabled={resetLoading}
              className="w-full h-10 font-bold text-xs"
            >
              {resetLoading ? 'Updating Credentials...' : 'Activate Account & Continue'}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  const activeProfile = impersonatedProfile ?? profile;
  const currentRole: UserRole = normalizeRole(
    impersonatedProfile
      ? impersonatedProfile.role
      : (activeView || profile?.role || 'hunter')
  );

  const landlordNeedsSubscription = Boolean(
    activeProfile &&
      currentRole === 'landlord' &&
      !isLandlordSubscriptionActive(activeProfile),
  );

  return (
    <div 
      className={`db app-shell h-screen h-dvh w-screen overflow-hidden bg-[#f8fafc] dark:bg-[#090d16] transition-colors duration-200 flex ${impersonatedProfile ? 'app-shell-impersonating' : ''}`}
    >
      {/* Desktop Fixed Sidebar — only when logged in */}
      {activeProfile && (
        <Sidebar
          profile={activeProfile}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          currentRole={currentRole as UserRole}
          isImpersonating={Boolean(impersonatedProfile)}
        />
      )}

      {/* Right Column Container (Next to the Sidebar) */}
      <div className="flex-1 flex flex-col min-w-0 w-full overflow-x-hidden h-full relative">
        {impersonatedProfile && (
          <div className="shrink-0 z-50 w-full">
            <ImpersonationBanner target={impersonatedProfile} onExit={handleExitImpersonation} />
          </div>
        )}
        
        <div className="shrink-0 z-40 w-full">
          <Navbar 
            user={user} 
            profile={profile} 
            activeView={activeView} 
            setActiveView={(role) => { setActiveView(role); setActiveTab(''); }}
            setActiveTab={setActiveTab}
            onLoginClick={() => setIsAuthOpen(true)} 
            isImpersonating={Boolean(impersonatedProfile)}
            onHelpClick={() => setShowOnboarding(true)}
          />
        </div>

        {/* Independent Scrollable Content Area */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden min-w-0 w-full flex flex-col justify-between">
          <div className="flex-1 min-w-0 w-full">
            {error ? (
              <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                <div className="h-14 w-14 rounded-2xl bg-rose-50 text-rose-600 border border-rose-200/80 flex items-center justify-center">
                  <FontAwesomeIcon icon={faExclamationTriangle} className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Profile Loading Error</h3>
                  <p className="text-xs text-slate-500 max-w-xs mx-auto mt-1">{error}</p>
                </div>
                <Button onClick={() => window.location.reload()} size="sm" className="gap-2">
                  <FontAwesomeIcon icon={faSync} className="h-3.5 w-3.5" />
                  Reload Page
                </Button>
              </div>
            ) : !profile ? (
               <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
                 <div className="relative flex items-center justify-center">
                   <div className="absolute inset-0 rounded-2xl bg-slate-200/60 blur-lg animate-pulse scale-125" />
                   <img
                     src={tenantConfig.logoUrl}
                     alt={tenantConfig.appName}
                     className="relative h-12 w-12 object-contain rounded-xl bg-white p-1 shadow-xs border border-slate-200/80"
                   />
                 </div>
                 <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Authenticating Session...</p>
               </div>
            ) : (
              <>
                {/* Settings page — rendered for all roles when activeTab === 'settings' */}
                {activeTab === 'settings' && <SettingsPage profile={activeProfile!} />}

                {activeTab !== 'settings' && (
                  <>
                    {landlordNeedsSubscription && activeTab !== 'settings' && (
                      <LandlordSubscriptionGate
                        email={activeProfile!.email}
                        phone={activeProfile!.phone}
                        onActivated={refreshProfile}
                      />
                    )}
                    {!landlordNeedsSubscription &&
                      (currentRole === 'landlord' ||
                        (currentRole === 'admin' &&
                          ['maintenance', 'finances', 'tenants', 'automations'].includes(activeTab))) && (
                        <LandlordDashboard
                          profile={activeProfile!}
                          activeTab={activeTab || 'dashboard'}
                          setActiveTab={setActiveTab}
                        />
                      )}
                    {currentRole === 'tenant' && (
                      <TenantDashboard
                        profile={activeProfile!}
                        activeTab={activeTab || 'dashboard'}
                        setActiveTab={setActiveTab}
                      />
                    )}
                    {currentRole === 'hunter' && (
                      <HunterDashboard
                        profile={activeProfile!}
                        activeTab={activeTab || 'dashboard'}
                        setActiveTab={setActiveTab}
                      />
                    )}
                    {currentRole === 'admin' && !['maintenance', 'finances', 'tenants', 'automations'].includes(activeTab) && !impersonatedProfile && (
                      <AdminDashboard
                        profile={profile!}
                        onImpersonate={handleImpersonate}
                        activeTab={activeTab || 'dashboard'}
                        setActiveTab={setActiveTab}
                      />
                    )}
                    {currentRole === 'admin' && !['maintenance', 'finances', 'tenants', 'automations'].includes(activeTab) && impersonatedProfile && (
                      <AdminDashboard
                        profile={impersonatedProfile}
                        onImpersonate={handleImpersonate}
                        activeTab={activeTab || 'dashboard'}
                        setActiveTab={setActiveTab}
                      />
                    )}
                  </>
                )}
              </>
            )}
          </div>
          <Footer />
        </main>
      </div>

      {currentRole === 'admin' && (
        <>
          {/* Mobile Bottom Navigation Bar */}
          <nav className="sm:hidden mobile-bottom-nav fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800 shadow-lg">
            <div className="flex items-center justify-around h-15 px-1">
              {[
                { id: 'dashboard',   label: 'Home',      icon: faChartPie },
                { id: 'registered',  label: 'Users',     icon: faUsers },
                { id: 'pending',     label: 'Pending',   icon: faLink },
                { id: 'properties',  label: 'Assets',    icon: faBuilding },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => {
                    setActiveTab(t.id);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full rounded-xl transition-all cursor-pointer ${
                    activeTab === t.id
                      ? 'text-slate-900 dark:text-white font-bold'
                      : 'text-slate-400 hover:text-slate-700'
                  }`}
                >
                  <div className={`flex items-center justify-center h-7 w-7 rounded-lg transition-all ${
                    activeTab === t.id ? 'bg-slate-100 dark:bg-slate-800' : ''
                  }`}>
                    <FontAwesomeIcon icon={t.icon} className={`text-xs ${activeTab === t.id ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`} />
                  </div>
                  <span className={`text-[9px] uppercase tracking-wide leading-none ${
                    activeTab === t.id ? 'font-bold text-slate-900 dark:text-white' : 'font-medium text-slate-400'
                  }`}>{t.label}</span>
                </button>
              ))}
              {(() => {
                const isAdminMenuTabActive = ['maintenance', 'finances', 'tenants', 'automations', 'platforms', 'audit', 'settings'].includes(activeTab);
                return (
                  <button
                    onClick={() => setIsMobileMenuOpen(true)}
                    className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full rounded-xl transition-all cursor-pointer ${
                      isAdminMenuTabActive
                        ? 'text-slate-900 dark:text-white font-bold'
                        : 'text-slate-400 hover:text-slate-700'
                    }`}
                  >
                    <div className={`flex items-center justify-center h-7 w-7 rounded-lg transition-all ${
                      isAdminMenuTabActive ? 'bg-slate-100 dark:bg-slate-800' : ''
                    }`}>
                      <FontAwesomeIcon icon={faBars} className={`text-xs ${isAdminMenuTabActive ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`} />
                    </div>
                    <span className={`text-[9px] uppercase tracking-wide leading-none ${
                      isAdminMenuTabActive ? 'font-bold text-slate-900 dark:text-white' : 'font-medium text-slate-400'
                    }`}>Menu</span>
                  </button>
                );
              })()}
            </div>
          </nav>

          {/* Mobile Drawer Slide-out Menu (Right to Left) */}
          {isMobileMenuOpen && (
            <div 
              className="fixed inset-0 bg-slate-950/40 z-50 sm:hidden transition-opacity backdrop-blur-xs animate-in fade-in duration-200"
              onClick={() => setIsMobileMenuOpen(false)}
            />
          )}
          
          <div 
            className={`fixed inset-y-0 right-0 z-50 w-72 bg-white dark:bg-slate-900 shadow-2xl p-5 sm:hidden transition-transform duration-200 ease-in-out border-l border-slate-200 dark:border-slate-800 ${
              isMobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">Operations Menu</span>
              <button 
                onClick={() => setIsMobileMenuOpen(false)}
                className="h-7 w-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center hover:bg-slate-200 text-slate-500 cursor-pointer"
              >
                <FontAwesomeIcon icon={faTimes} className="h-3 w-3" />
              </button>
            </div>
            
            <nav className="space-y-1 overflow-y-auto max-h-[calc(100vh-140px)]">
              {[
                { id: 'maintenance', label: 'Maintenance',   icon: faTools },
                { id: 'finances',    label: 'Finances',      icon: faWallet },
                { id: 'tenants',     label: 'Tenants',       icon: faUsers },
                { id: 'automations', label: 'Notifications', icon: faBell },
                ...(profile?.isSuperAdmin ? [
                  { id: 'platforms', label: 'Network Platforms', icon: faGlobe },
                  { id: 'audit',     label: 'Audit Trail',       icon: faClipboardList },
                ] : []),
                { id: 'settings',    label: 'Settings',          icon: faCog }
              ].map(item => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setIsMobileMenuOpen(false);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-slate-900 text-white dark:bg-slate-50 dark:text-slate-900 font-semibold'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium'
                    }`}
                  >
                    <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${
                      isActive ? 'bg-white/15 dark:bg-slate-900/10' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                    }`}>
                      <FontAwesomeIcon icon={item.icon} className="h-3 w-3" />
                    </div>
                    <span className="text-xs tracking-tight">
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>
        </>
      )}

      {currentRole === 'landlord' && (
        <>
          {/* Landlord Mobile Bottom Navigation Bar */}
          <nav className="sm:hidden mobile-bottom-nav fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800 shadow-lg">
            <div className="flex items-center justify-around h-15 px-1">
              {[
                { id: 'dashboard',   label: 'Home',     icon: faChartPie },
                { id: 'properties',  label: 'Units',    icon: faHome },
                { id: 'finances',    label: 'Finance',  icon: faWallet },
                { id: 'tenants',     label: 'Tenants',  icon: faUsers },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => {
                    setActiveTab(t.id);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full rounded-xl transition-all cursor-pointer ${
                    activeTab === t.id
                      ? 'text-slate-900 dark:text-white font-bold'
                      : 'text-slate-400 hover:text-slate-700'
                  }`}
                >
                  <div className={`flex items-center justify-center h-7 w-7 rounded-lg transition-all ${
                    activeTab === t.id ? 'bg-slate-100 dark:bg-slate-800' : ''
                  }`}>
                    <FontAwesomeIcon icon={t.icon} className={`text-xs ${activeTab === t.id ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`} />
                  </div>
                  <span className={`text-[9px] uppercase tracking-wide leading-none ${
                    activeTab === t.id ? 'font-bold text-slate-900 dark:text-white' : 'font-medium text-slate-400'
                  }`}>{t.label}</span>
                </button>
              ))}
              {(() => {
                const isMenuTabActive = ['maintenance', 'automations', 'settings'].includes(activeTab);
                return (
                  <button
                    onClick={() => setIsMobileMenuOpen(true)}
                    className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full rounded-xl transition-all cursor-pointer ${
                      isMenuTabActive
                        ? 'text-slate-900 dark:text-white font-bold'
                        : 'text-slate-400 hover:text-slate-700'
                    }`}
                  >
                    <div className={`flex items-center justify-center h-7 w-7 rounded-lg transition-all ${
                      isMenuTabActive ? 'bg-slate-100 dark:bg-slate-800' : ''
                    }`}>
                      <FontAwesomeIcon icon={faBars} className={`text-xs ${isMenuTabActive ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`} />
                    </div>
                    <span className={`text-[9px] uppercase tracking-wide leading-none ${
                      isMenuTabActive ? 'font-bold text-slate-900 dark:text-white' : 'font-medium text-slate-400'
                    }`}>Menu</span>
                  </button>
                );
              })()}
            </div>
          </nav>

          {/* Mobile Drawer Slide-out Menu (Right to Left) */}
          {isMobileMenuOpen && (
            <div 
              className="fixed inset-0 bg-slate-950/40 z-50 sm:hidden transition-opacity backdrop-blur-xs animate-in fade-in duration-200"
              onClick={() => setIsMobileMenuOpen(false)}
            />
          )}
          
          <div 
            className={`fixed inset-y-0 right-0 z-50 w-72 bg-white dark:bg-slate-900 shadow-2xl p-5 sm:hidden transition-transform duration-200 ease-in-out border-l border-slate-200 dark:border-slate-800 ${
              isMobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">More Options</span>
              <button 
                onClick={() => setIsMobileMenuOpen(false)}
                className="h-7 w-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center hover:bg-slate-200 text-slate-500 cursor-pointer"
              >
                <FontAwesomeIcon icon={faTimes} className="h-3 w-3" />
              </button>
            </div>
            
            <nav className="space-y-1 overflow-y-auto max-h-[calc(100vh-140px)]">
              {[
                { id: 'maintenance', label: 'Maintenance Hub', icon: faTools },
                { id: 'automations', label: 'Broadcast Notices', icon: faBell },
                { id: 'settings',    label: 'Settings',          icon: faCog }
              ].map(item => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setIsMobileMenuOpen(false);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-slate-900 text-white dark:bg-slate-50 dark:text-slate-900 font-semibold'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium'
                    }`}
                  >
                    <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${
                      isActive ? 'bg-white/15 dark:bg-slate-900/10' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                    }`}>
                      <FontAwesomeIcon icon={item.icon} className="h-3 w-3" />
                    </div>
                    <span className="text-xs tracking-tight">
                      {item.label}
                    </span>
                  </button>
                );
              })}

              <div className="my-2 border-t border-slate-100 dark:border-slate-800" />
              
              <button
                onClick={async () => {
                  setIsMobileMenuOpen(false);
                  await authClient.signOut({});
                  toast.success('Signed out');
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-all cursor-pointer"
              >
                <div className="h-7 w-7 rounded-lg bg-rose-50 dark:bg-rose-950/40 flex items-center justify-center shrink-0">
                  <FontAwesomeIcon icon={faSignOutAlt} className="h-3 w-3 text-rose-600" />
                </div>
                <span className="text-xs font-semibold">Sign Out</span>
              </button>
            </nav>
          </div>
        </>
      )}

      {currentRole === 'tenant' && (
        <nav className="sm:hidden mobile-bottom-nav fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800 shadow-lg">
          <div className="flex items-center justify-around h-15 px-1">
            {[
              { id: 'dashboard',   label: 'Dashboard', icon: faChartPie },
              { id: 'finances',    label: 'Finance', icon: faWallet },
              { id: 'maintenance', label: 'Fixes',   icon: faTools },
              { id: 'notices',     label: 'Notices', icon: faBell },
              { id: 'settings',    label: 'Settings', icon: faCog },
            ].map(t => {
              const isActive = (activeTab || 'dashboard') === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    setActiveTab(t.id);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full rounded-xl transition-all cursor-pointer ${
                    isActive
                      ? 'text-slate-900 dark:text-white font-bold'
                      : 'text-slate-400 hover:text-slate-700'
                  }`}
                >
                  <div className={`flex items-center justify-center h-7 w-7 rounded-lg transition-all ${
                    isActive ? 'bg-slate-100 dark:bg-slate-800' : ''
                  }`}>
                    <FontAwesomeIcon icon={t.icon} className={`text-xs ${isActive ? 'text-slate-900 dark:text-white' : 'text-slate-400'}`} />
                  </div>
                  <span className={`text-[9px] uppercase tracking-wide leading-none ${
                    isActive ? 'font-bold text-slate-900 dark:text-white' : 'font-medium text-slate-400'
                  }`}>{t.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}

      <Toaster />
      {showOnboarding && !impersonatedProfile && profile && (
        <OnboardingTour
          role={profile.role}
          onComplete={() => setShowOnboarding(false)}
        />
      )}

    </div>
  );
}
