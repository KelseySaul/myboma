import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { authClient } from './lib/auth-client';
import { getSession, completePasswordReset, bffRequest, setImpersonatedUser, activateFreeLandlordPlan } from './lib/api';
import LandingPage from './components/LandingPage';
import AccountMenu from './components/AccountMenu';
import { getPlatformBranding } from './lib/api';
import PublicNavbar from './components/PublicNavbar';
import Sidebar from './components/Sidebar';
import CommandPalette from './components/CommandPalette';
import Footer from './components/Footer';
import ImpersonationBanner from './components/ImpersonationBanner';
import AuthDialog, { type AuthIntent } from './components/auth/AuthDialog';
import { tenantConfig } from './config/tenant';

// Role dashboards and secondary routes are code-split so initial load stays fast and lean.
const LandlordDashboard = lazy(() => import('./components/LandlordDashboard'));
const TenantDashboard = lazy(() => import('./components/TenantDashboard'));
const CaretakerDashboard = lazy(() => import('./components/CaretakerDashboard'));
const HunterDashboard = lazy(() => import('./components/HunterDashboard'));
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));
const SettingsPage = lazy(() => import('./components/SettingsPage'));
const AboutPage = lazy(() => import('./components/AboutPage'));
const PublicLegalPage = lazy(() => import('./components/PublicLegalPage'));
const InvitePage = lazy(() => import('./components/InvitePage'));
const ResetPasswordPage = lazy(() => import('./components/ResetPasswordPage'));
const OnboardingTour = lazy(() => import('./components/OnboardingTour'));
const LandlordSubscriptionGate = lazy(() => import('./components/LandlordSubscriptionGate'));

const DashboardFallback = () => (
  <div className="space-y-6 p-6 md:p-8" role="status" aria-live="polite" aria-label="Loading workspace">
    <div className="h-8 w-56 animate-pulse rounded-lg bg-[#1C2B33]/[0.07] dark:bg-white/[0.07]" />
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-28 animate-pulse rounded-xl bg-white shadow-2xs dark:bg-[#1A1D21]" />
      ))}
    </div>
    <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
      <div className="h-64 animate-pulse rounded-xl bg-white shadow-2xs dark:bg-[#1A1D21]" />
      <div className="h-64 animate-pulse rounded-xl bg-white shadow-2xs dark:bg-[#1A1D21]" />
    </div>
  </div>
);

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
import { initializeOneSignal, promptForPush, showBrowserPushNotification, syncOneSignalIdentity } from './lib/oneSignal';
import { resolveMediaUrl } from './lib/fileUrl';

const shouldShowOnboarding = (role: UserRole): boolean => {
  try {
    return localStorage.getItem(`myboma_onboarding_done_v2_${role}`) !== 'true';
  } catch {
    return false;
  }
};
import {
  isLandlordSubscriptionActive,
  PENDING_LANDLORD_SUBSCRIPTION_KEY,
  type PendingLandlordSubscription,
} from '../../shared/landlordSubscription';
import { queryClient, clearQueryCache } from './lib/queryClient';
import { queryKeys, useSessionProfile, useUnreadCount } from './lib/queries';
export type UserRole = 'landlord' | 'tenant' | 'hunter' | 'admin' | 'caretaker';

export { promptForPush } from './lib/oneSignal';

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

const VALID_ROLES: UserRole[] = ['landlord', 'tenant', 'hunter', 'admin', 'caretaker'];

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

const SESSION_HINT_KEY = 'myboma_signed_in';

export default function App() {
  const sessionState = authClient.useSession() as {
    data: {user: {id: string; email: string; name?: string}} | null;
    isPending: boolean;
  };
  const user = sessionState.data?.user ?? null;
  const sessionPending = sessionState.isPending;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  // Logged-out visitors see the landing page immediately; only a browser that was signed in
  // last time waits for the session check before rendering.
  const [hadSession] = useState(() => {
    try { return localStorage.getItem(SESSION_HINT_KEY) === '1'; } catch { return false; }
  });
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [publicAuthIntent, setPublicAuthIntent] = useState<AuthIntent>({ mode: 'signin' });
  const [activeView, setActiveView] = useState<UserRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [impersonatedProfile, setImpersonatedProfile] = useState<UserProfile | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  // Lifted tab state — shared between Sidebar and the active dashboard
  const [activeTab, setActiveTab] = useState<string>('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  // Super-admin multi-account filter shared across gated AdminDashboard + LandlordDashboard pages
  const [superAdminAccountIds, setSuperAdminAccountIds] = useState<string[]>([]);

  useEffect(() => {
    setSuperAdminAccountIds([]);
  }, [user?.id]);

  useEffect(() => {
    // Patch history.replaceState to dispatch a custom event
    const originalReplaceState = history.replaceState;
    history.replaceState = function(...args) {
      originalReplaceState.apply(this, args as any);
      window.dispatchEvent(new Event('urlchange'));
    };
  }, []);

  useEffect(() => {
    if (!profile?.platformId) return;
    getPlatformBranding(profile.platformId).then((data) => {
      if (data.brandPrimaryColor) document.documentElement.style.setProperty('--brand-primary', data.brandPrimaryColor);
      if (data.brandSecondaryColor) document.documentElement.style.setProperty('--brand-secondary', data.brandSecondaryColor);
    }).catch(() => undefined);
  }, [profile?.platformId]);

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
    // Dashboards now really load the target's data (server honours X-Impersonate-User for
    // super admins, read-only); the start is audited server-side.
    setImpersonatedUser(target.uid);
    setImpersonatedProfile(target);
    void bffRequest(`/admin/impersonation/${target.uid}`, { method: 'POST' }).catch(() => undefined);
  };

  const handleExitImpersonation = () => {
    if (impersonatedProfile) {
      logAudit('ADMIN_IMPERSONATE_END', 'user', impersonatedProfile.uid, { targetEmail: impersonatedProfile.email });
    }
    setImpersonatedUser(null);
    setImpersonatedProfile(null);
  };

  const userRef = useRef(user);
  const profileRef = useRef(profile);

  useEffect(() => {
    userRef.current = user;
    profileRef.current = profile;
  }, [user, profile]);

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
        // Seeds the shared session query, so the polling query below doesn't refetch it.
        const { profile: profileData } = await queryClient.fetchQuery({
          queryKey: queryKeys.session(user!.id),
          queryFn: getSession,
        });
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

    try {
      if (user) localStorage.setItem(SESSION_HINT_KEY, '1');
      else localStorage.removeItem(SESSION_HINT_KEY);
    } catch { /* storage unavailable */ }

    if (user) {
      const pref = localStorage.getItem(`myboma_default_page_${user.id}`);
      if (pref) setActiveTab(pref);
      initializeOneSignal().then(async () => {
        await syncOneSignalIdentity(user.id);
        await promptForPush();
      }).catch((error) => console.error('OneSignal setup failed:', error));
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
      // Signed out (by any path): drop every cached query so nothing leaks to the next user.
      clearQueryCache();
      syncOneSignalIdentity(null).catch((error) => console.error('OneSignal identity sync failed:', error));
      setLoading(false);
      clearTimeout(safetyTimeout);
    }

    return () => {
      isMounted = false;
      clearTimeout(safetyTimeout);
    };
  }, [user?.id, sessionPending]);

  // Polls for profile changes (role/subscription updates made elsewhere, e.g. by an
  // admin) — replaces the old Supabase Realtime `profile-changes-*` channel.
  const { data: sessionData } = useSessionProfile(user?.id);
  useEffect(() => {
    if (!sessionData) return;
    const p = normalizeProfile(sessionData.profile);
    setProfile(p);
    setActiveView(prev => (!p.isAdmin ? p.role : prev || p.role));
  }, [sessionData]);

  // Live push bridge: whenever unread notifications increase while signed in, fire a
  // native browser push notification (when permitted) and an in-app toast alert.
  const { data: liveUnreadCount } = useUnreadCount(profile?.email);
  const prevUnreadRef = useRef<number | null>(null);
  useEffect(() => {
    prevUnreadRef.current = null;
  }, [profile?.email]);
  useEffect(() => {
    if (typeof liveUnreadCount !== 'number') return;
    if (prevUnreadRef.current !== null && liveUnreadCount > prevUnreadRef.current) {
      const diff = liveUnreadCount - prevUnreadRef.current;
      const title = diff === 1 ? 'New MyBoma notification' : `${diff} new MyBoma notifications`;
      const body = 'Open Notifications to read your rent reminder or update.';
      showBrowserPushNotification(title, body);
      toast.info(title, { description: body });
    }
    prevUnreadRef.current = liveUnreadCount;
  }, [liveUnreadCount]);

  const refreshProfile = useCallback(async () => {
    if (!user?.id) return;
    const { profile: profileData } = await getSession();
    setProfile(normalizeProfile(profileData));
  }, [user?.id]);

  // A landlord who picked the free plan at signup (email or Google) has nothing to pay, so
  // the plan is activated as soon as their profile exists. Paid choices go through the gate.
  const freePlanActivationStarted = useRef(false);
  useEffect(() => {
    if (!user?.id || !profile || impersonatedProfile || freePlanActivationStarted.current) return;
    let pending: PendingLandlordSubscription | null = null;
    try {
      pending = JSON.parse(localStorage.getItem(PENDING_LANDLORD_SUBSCRIPTION_KEY) || 'null');
    } catch {
      pending = null;
    }
    if (pending?.tier !== 'free') return;
    if (profile.role !== 'hunter' && isLandlordSubscriptionActive(profile)) {
      localStorage.removeItem(PENDING_LANDLORD_SUBSCRIPTION_KEY);
      return;
    }

    freePlanActivationStarted.current = true;
    const payout = pending;
    void (async () => {
      try {
        const result = await activateFreeLandlordPlan({
          rentPayoutMethod: payout.rentPayoutMethod,
          mpesaSettlementPhone: payout.mpesaSettlementPhone,
          bankName: payout.bankName,
          bankAccountNumber: payout.bankAccountNumber,
          bankAccountName: payout.bankAccountName,
          cashPayoutNotes: payout.cashPayoutNotes,
        });
        localStorage.removeItem(PENDING_LANDLORD_SUBSCRIPTION_KEY);
        await refreshProfile();
        if (result.activated && !profile.isAdmin) setActiveView('landlord');
        if (result.activated) toast.success('Your free landlord plan is active. Add your house to get started.');
      } catch (err: any) {
        console.error('App: free plan activation failed', err);
        // Not retried automatically (the profile poll would repeat the toast); the gate offers a button.
        toast.error(err.message || 'Could not activate your free plan.');
      }
    })();
  }, [user?.id, profile, impersonatedProfile, refreshProfile]);

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
          
          if (isActive || attempts > 50) {
            clearInterval(poll);
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

  if (loading && (user || (sessionPending && hadSession))) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-white dark:bg-zinc-950" role="status" aria-label="Loading">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-900 dark:border-zinc-800 dark:border-t-white" />
      </div>
    );
  }

  // An invitation must be usable even in a browser that still has somebody else's
  // session (for example, a landlord inviting a tenant from the same device).
  // Keep this route ahead of the authenticated dashboard gate so the invitee can
  // complete setup and replace that session with their own account.
  if (window.location.pathname === '/invite') {
    return (
      <div className="db app-shell app-shell-public min-h-screen bg-white">
        <PublicNavbar
          onLoginClick={() => {
            setPublicAuthIntent({ mode: 'signin' });
            setIsAuthOpen(true);
          }}
          overHero={false}
        />
        <main>
          <Suspense
            fallback={
              <div className="flex min-h-[60vh] items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-200 border-t-violet-700" />
              </div>
            }
          >
            <InvitePage />
          </Suspense>
        </main>
        <Footer variant="public" />
        <AuthDialog
          open={isAuthOpen}
          intent={publicAuthIntent}
          onOpenChange={(open) => {
            setIsAuthOpen(open);
            if (!open) setPublicAuthIntent({ mode: 'signin' });
          }}
        />
        {profile && (
        <div className="fixed bottom-20 right-4 z-40 sm:hidden">
          <AccountMenu profile={profile} activeView={activeView}
            setActiveView={(role) => { setActiveView(role); setActiveTab(''); }}
            setActiveTab={setActiveTab} onHelpClick={() => setShowOnboarding(true)} side="top"
            trigger={<button type="button" aria-label="Open account menu" className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-violet-700 via-purple-600 to-fuchsia-600 text-sm font-bold text-white shadow-lg shadow-violet-700/30">{profile.avatarUrl ? <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" /> : profile.displayName?.charAt(0).toUpperCase() || 'U'}</button>} />
        </div>
      )}
      <Toaster />
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
    const isAboutPage = window.location.pathname === '/about';
    const isResetPage = window.location.pathname === '/reset-password';
    // The landing page renders its own sign-in dialog; every other public page uses this one.
    const isLanding = !legalPageType && !isAboutPage && !isResetPage;
    const openAuth = (intent: AuthIntent) => {
      setPublicAuthIntent(intent);
      setIsAuthOpen(true);
    };

    return (
      <div className="db app-shell app-shell-public min-h-screen bg-white">
        <PublicNavbar onLoginClick={() => openAuth({ mode: 'signin' })} overHero={!legalPageType && !isResetPage} />
        <main>
          <Suspense
            fallback={
              <div className="flex min-h-[60vh] items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-200 border-t-violet-700" />
              </div>
            }
          >
            {legalPageType ? (
              <PublicLegalPage type={legalPageType} />
            ) : isAboutPage ? (
              <AboutPage onSignUp={() => openAuth({ mode: 'signup', role: 'landlord' })} />
            ) : isResetPage ? (
              <ResetPasswordPage onSignIn={() => openAuth({ mode: 'signin' })} />
            ) : (
              <LandingPage isAuthOpen={isAuthOpen} setIsAuthOpen={setIsAuthOpen} />
            )}
          </Suspense>
        </main>
        <Footer variant="public" />
        {!isLanding && (
          <AuthDialog
            open={isAuthOpen}
            intent={publicAuthIntent}
            onOpenChange={(open) => {
              setIsAuthOpen(open);
              if (!open) setPublicAuthIntent({ mode: 'signin' });
            }}
          />
        )}
        {profile && (
        <div className="fixed bottom-20 right-4 z-40 sm:hidden">
          <AccountMenu profile={profile} activeView={activeView}
            setActiveView={(role) => { setActiveView(role); setActiveTab(''); }}
            setActiveTab={setActiveTab} onHelpClick={() => setShowOnboarding(true)} side="top"
            trigger={<button type="button" aria-label="Open account menu" className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-violet-700 via-purple-600 to-fuchsia-600 text-sm font-bold text-white shadow-lg shadow-violet-700/30">{profile.avatarUrl ? <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" /> : profile.displayName?.charAt(0).toUpperCase() || 'U'}</button>} />
        </div>
      )}
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
      className={`db app-shell h-screen h-dvh w-screen overflow-hidden bg-[#F4F3F8] dark:bg-[#0F1016] transition-colors duration-200 flex ${impersonatedProfile ? 'app-shell-impersonating' : ''}`}
    >
      {/* Desktop Fixed Sidebar — only when logged in */}
      {activeProfile && (
        <Sidebar
          profile={activeProfile}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          currentRole={currentRole as UserRole}
          activeView={activeView}
          setActiveView={(role) => { setActiveView(role); setActiveTab(''); }}
          onHelpClick={() => setShowOnboarding(true)}
          isImpersonating={Boolean(impersonatedProfile)}
        />
      )}
      {activeProfile && (
        <CommandPalette
          profile={activeProfile}
          currentRole={currentRole as UserRole}
          onNavigate={setActiveTab}
          onHelpClick={() => setShowOnboarding(true)}
        />
      )}

      {/* Right Column Container (Next to the Sidebar) */}
      <div className="flex-1 flex flex-col min-w-0 w-full overflow-x-hidden h-full relative">
        {impersonatedProfile && (
          <div className="shrink-0 z-50 w-full">
            <ImpersonationBanner target={impersonatedProfile} onExit={handleExitImpersonation} />
          </div>
        )}
        
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
              <Suspense fallback={<DashboardFallback />}>
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
                          superAdminAccountIds={
                            currentRole === 'admin' && profile?.isSuperAdmin && !impersonatedProfile
                              ? superAdminAccountIds
                              : undefined
                          }
                          onChangeSuperAdminAccountIds={
                            currentRole === 'admin' && profile?.isSuperAdmin && !impersonatedProfile
                              ? setSuperAdminAccountIds
                              : undefined
                          }
                        />
                      )}
                    {currentRole === 'tenant' && (
                      <TenantDashboard
                        profile={activeProfile!}
                        activeTab={activeTab || 'dashboard'}
                        setActiveTab={setActiveTab}
                      />
                    )}
                    {currentRole === 'caretaker' && (
                      <CaretakerDashboard
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
                        superAdminAccountIds={profile?.isSuperAdmin ? superAdminAccountIds : undefined}
                        onChangeSuperAdminAccountIds={profile?.isSuperAdmin ? setSuperAdminAccountIds : undefined}
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
              </Suspense>
            )}
          </div>
          <Footer />
        </main>
      </div>

      {currentRole === 'admin' && (
        <>
          {/* Mobile Bottom Navigation Bar */}
          <nav className="sm:hidden mobile-bottom-nav fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-200/80 bg-white/95 backdrop-blur-md dark:border-white/[0.08] dark:bg-[#181922]/95">
            <div className="flex h-15 items-center justify-around px-1">
              {[
                { id: 'dashboard',   label: 'Home',       icon: faChartPie },
                { id: 'registered',  label: 'Users',      icon: faUsers },
                { id: 'pending',     label: 'Pending',    icon: faLink },
                { id: 'properties',  label: 'Properties', icon: faBuilding },
              ].map(t => {
                const isActive = (activeTab || 'dashboard') === t.id;
                return (
                <button
                  key={t.id}
                  type="button"
                  data-tour={`nav-${t.id}`}
                  onClick={() => {
                    setActiveTab(t.id);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={`flex h-full flex-1 flex-col items-center justify-center gap-0.5 rounded-xl transition-colors cursor-pointer ${
                    isActive
                      ? 'font-semibold text-[#5B21B6] dark:text-violet-300'
                      : 'text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  <div className={`flex h-7 w-9 items-center justify-center rounded-lg transition-colors ${
                    isActive ? 'bg-violet-600/10 dark:bg-violet-500/20' : ''
                  }`}>
                    <FontAwesomeIcon icon={t.icon} className="text-xs" />
                  </div>
                  <span className="text-[10px] leading-none">{t.label}</span>
                </button>
              );})}
              {(() => {
                const isAdminMenuTabActive = ['maintenance', 'finances', 'tenants', 'automations', 'revenue', 'platforms', 'audit', 'settings'].includes(activeTab);
                return (
                  <button
                    type="button"
                    onClick={() => setIsMobileMenuOpen(true)}
                    className={`flex h-full flex-1 flex-col items-center justify-center gap-0.5 rounded-xl transition-colors cursor-pointer ${
                      isAdminMenuTabActive
                        ? 'font-semibold text-[#5B21B6] dark:text-violet-300'
                        : 'text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                    }`}
                  >
                    <div className={`flex h-7 w-9 items-center justify-center rounded-lg transition-colors ${
                      isAdminMenuTabActive ? 'bg-violet-600/10 dark:bg-violet-500/20' : ''
                    }`}>
                      <FontAwesomeIcon icon={faBars} className="text-xs" />
                    </div>
                    <span className="text-[10px] leading-none">Menu</span>
                  </button>
                );
              })()}
            </div>
          </nav>

          {/* Modern Mobile Slide-out Menu */}
          {isMobileMenuOpen && (
            <div
              className="fixed inset-0 z-50 bg-zinc-950/40 backdrop-blur-[2px] transition-opacity animate-in fade-in duration-150 sm:hidden"
              onClick={() => setIsMobileMenuOpen(false)}
            />
          )}

          <aside
            aria-label="Mobile navigation menu"
            className={`fixed inset-y-0 right-0 z-50 flex w-[82vw] max-w-[300px] flex-col border-l border-zinc-200/80 bg-white shadow-2xl transition-transform duration-200 ease-out dark:border-white/[0.08] dark:bg-[#181922] sm:hidden ${
              isMobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            {/* Profile Header */}
            <div className="flex items-center justify-between gap-2.5 border-b border-zinc-100 px-4 py-3.5 dark:border-white/[0.07]">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-900 text-xs font-bold text-white dark:bg-zinc-100 dark:text-zinc-900">
                  {profile?.avatarUrl ? (
                    <img src={resolveMediaUrl(profile.avatarUrl)} alt="" className="h-full w-full object-cover" />
                  ) : (
                    profile?.displayName?.charAt(0).toUpperCase() || 'A'
                  )}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-zinc-950 dark:text-white">{profile?.displayName || 'Account'}</p>
                  <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                    {profile?.isSuperAdmin ? 'Super admin' : profile?.isAdmin ? 'Platform admin' : 'Property manager'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-white/10 dark:text-zinc-300 cursor-pointer"
              >
                <FontAwesomeIcon icon={faTimes} className="h-3.5 w-3.5" />
              </button>
            </div>

            <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-3.5">
              <div>
                <p className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Rent &amp; operations</p>
                <div className="space-y-0.5">
                  {[
                    { id: 'finances',    label: 'Rent & payments',       icon: faWallet },
                    { id: 'tenants',     label: 'Tenants',               icon: faUsers },
                    { id: 'maintenance', label: 'Maintenance',           icon: faTools },
                    { id: 'automations', label: 'Notifications',         icon: faBell },
                  ].map((item) => {
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setActiveTab(item.id);
                          setIsMobileMenuOpen(false);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-[13px] transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-violet-50 font-semibold text-[#5B21B6] dark:bg-violet-500/15 dark:text-violet-300'
                            : 'font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/[0.06]'
                        }`}
                      >
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${isActive ? 'bg-[#5B21B6] text-white' : 'bg-zinc-100 text-zinc-500 dark:bg-white/8 dark:text-zinc-400'}`}>
                          <FontAwesomeIcon icon={item.icon} className="h-3 w-3" />
                        </span>
                        <span className="truncate">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {profile?.isSuperAdmin && (
                <div>
                  <p className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Platform governance</p>
                  <div className="space-y-0.5">
                    {[
                      { id: 'revenue',   label: 'Revenue & accounts', icon: faWallet },
                      { id: 'platforms', label: 'Platforms',          icon: faGlobe },
                      { id: 'audit',     label: 'Activity log',       icon: faClipboardList },
                    ].map((item) => {
                      const isActive = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setActiveTab(item.id);
                            setIsMobileMenuOpen(false);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-[13px] transition-colors cursor-pointer ${
                            isActive
                              ? 'bg-violet-50 font-semibold text-[#5B21B6] dark:bg-violet-500/15 dark:text-violet-300'
                              : 'font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/[0.06]'
                          }`}
                        >
                          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${isActive ? 'bg-[#5B21B6] text-white' : 'bg-zinc-100 text-zinc-500 dark:bg-white/8 dark:text-zinc-400'}`}>
                            <FontAwesomeIcon icon={item.icon} className="h-3 w-3" />
                          </span>
                          <span className="truncate">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </nav>

            {/* Anchored Footer Actions */}
            <div className="border-t border-zinc-100 bg-zinc-50/70 p-3 space-y-1 dark:border-white/[0.07] dark:bg-white/[0.02]">
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setShowOnboarding(true);
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/[0.06] cursor-pointer"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-[#5B21B6] shadow-2xs dark:bg-white/10 dark:text-violet-300">
                  <FontAwesomeIcon icon={faChartPie} className="h-3 w-3" />
                </span>
                <span>Show me around</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('settings');
                  setIsMobileMenuOpen(false);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] transition-colors cursor-pointer ${
                  activeTab === 'settings'
                    ? 'bg-violet-50 font-semibold text-[#5B21B6] dark:bg-violet-500/15 dark:text-violet-300'
                    : 'font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/[0.06]'
                }`}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-zinc-600 shadow-2xs dark:bg-white/10 dark:text-zinc-300">
                  <FontAwesomeIcon icon={faCog} className="h-3 w-3" />
                </span>
                <span>Settings</span>
              </button>
              <button
                type="button"
                onClick={async () => {
                  setIsMobileMenuOpen(false);
                  await authClient.signOut({});
                  clearQueryCache();
                  toast.success('Signed out');
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/25 cursor-pointer"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-950/40">
                  <FontAwesomeIcon icon={faSignOutAlt} className="h-3 w-3" />
                </span>
                <span>Sign out</span>
              </button>
            </div>
          </aside>
        </>
      )}

      {currentRole === 'landlord' && (
        <>
          {/* Landlord Mobile Bottom Navigation Bar */}
          <nav className="sm:hidden mobile-bottom-nav fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-200/80 bg-white/95 backdrop-blur-md dark:border-white/[0.08] dark:bg-[#181922]/95">
            <div className="flex h-15 items-center justify-around px-1">
              {[
                { id: 'dashboard',   label: 'Home',       icon: faChartPie },
                { id: 'properties',  label: 'Properties', icon: faHome },
                { id: 'finances',    label: 'Payments',   icon: faWallet },
                { id: 'tenants',     label: 'Tenants',    icon: faUsers },
              ].map(t => {
                const isActive = (activeTab || 'dashboard') === t.id;
                return (
                <button
                  key={t.id}
                  type="button"
                  data-tour={`nav-${t.id}`}
                  onClick={() => {
                    setActiveTab(t.id);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={`flex h-full flex-1 flex-col items-center justify-center gap-0.5 rounded-xl transition-colors cursor-pointer ${
                    isActive
                      ? 'font-semibold text-[#5B21B6] dark:text-violet-300'
                      : 'text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  <div className={`flex h-7 w-9 items-center justify-center rounded-lg transition-colors ${
                    isActive ? 'bg-violet-600/10 dark:bg-violet-500/20' : ''
                  }`}>
                    <FontAwesomeIcon icon={t.icon} className="text-xs" />
                  </div>
                  <span className="text-[10px] leading-none">{t.label}</span>
                </button>
              );})}
              {(() => {
                const isMenuTabActive = ['caretakers', 'pending', 'maintenance', 'automations', 'settings'].includes(activeTab);
                return (
                  <button
                    type="button"
                    onClick={() => setIsMobileMenuOpen(true)}
                    className={`flex h-full flex-1 flex-col items-center justify-center gap-0.5 rounded-xl transition-colors cursor-pointer ${
                      isMenuTabActive
                        ? 'font-semibold text-[#5B21B6] dark:text-violet-300'
                        : 'text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                    }`}
                  >
                    <div className={`flex h-7 w-9 items-center justify-center rounded-lg transition-colors ${
                      isMenuTabActive ? 'bg-violet-600/10 dark:bg-violet-500/20' : ''
                    }`}>
                      <FontAwesomeIcon icon={faBars} className="text-xs" />
                    </div>
                    <span className="text-[10px] leading-none">Menu</span>
                  </button>
                );
              })()}
            </div>
          </nav>

          {/* Modern Mobile Slide-out Menu */}
          {isMobileMenuOpen && (
            <div
              className="fixed inset-0 z-50 bg-zinc-950/40 backdrop-blur-[2px] transition-opacity animate-in fade-in duration-150 sm:hidden"
              onClick={() => setIsMobileMenuOpen(false)}
            />
          )}

          <aside
            aria-label="Mobile navigation menu"
            className={`fixed inset-y-0 right-0 z-50 flex w-[82vw] max-w-[300px] flex-col border-l border-zinc-200/80 bg-white shadow-2xl transition-transform duration-200 ease-out dark:border-white/[0.08] dark:bg-[#181922] sm:hidden ${
              isMobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            <div className="flex items-center justify-between gap-2.5 border-b border-zinc-100 px-4 py-3.5 dark:border-white/[0.07]">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-900 text-xs font-bold text-white dark:bg-zinc-100 dark:text-zinc-900">
                  {profile?.avatarUrl ? (
                    <img src={resolveMediaUrl(profile.avatarUrl)} alt="" className="h-full w-full object-cover" />
                  ) : (
                    profile?.displayName?.charAt(0).toUpperCase() || 'L'
                  )}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-zinc-950 dark:text-white">{profile?.displayName || 'Landlord'}</p>
                  <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">{profile?.email}</p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-white/10 dark:text-zinc-300 cursor-pointer"
              >
                <FontAwesomeIcon icon={faTimes} className="h-3.5 w-3.5" />
              </button>
            </div>

            <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-3.5">
              <div>
                <p className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">People</p>
                <div className="space-y-0.5">
                  {[
                    { id: 'caretakers',  label: 'Caretakers & reports', icon: faUsers },
                    { id: 'pending',     label: 'Pending invites',      icon: faLink },
                  ].map((item) => {
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setActiveTab(item.id);
                          setIsMobileMenuOpen(false);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-[13px] transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-violet-50 font-semibold text-[#5B21B6] dark:bg-violet-500/15 dark:text-violet-300'
                            : 'font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/[0.06]'
                        }`}
                      >
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${isActive ? 'bg-[#5B21B6] text-white' : 'bg-zinc-100 text-zinc-500 dark:bg-white/8 dark:text-zinc-400'}`}>
                          <FontAwesomeIcon icon={item.icon} className="h-3 w-3" />
                        </span>
                        <span className="truncate">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Finance &amp; operations</p>
                <div className="space-y-0.5">
                  {[
                    { id: 'maintenance', label: 'Maintenance',   icon: faTools },
                    { id: 'automations', label: 'Notifications', icon: faBell },
                  ].map((item) => {
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setActiveTab(item.id);
                          setIsMobileMenuOpen(false);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-[13px] transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-violet-50 font-semibold text-[#5B21B6] dark:bg-violet-500/15 dark:text-violet-300'
                            : 'font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/[0.06]'
                        }`}
                      >
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${isActive ? 'bg-[#5B21B6] text-white' : 'bg-zinc-100 text-zinc-500 dark:bg-white/8 dark:text-zinc-400'}`}>
                          <FontAwesomeIcon icon={item.icon} className="h-3 w-3" />
                        </span>
                        <span className="truncate">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </nav>

            <div className="border-t border-zinc-100 bg-zinc-50/70 p-3 space-y-1 dark:border-white/[0.07] dark:bg-white/[0.02]">
              <button
                type="button"
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setShowOnboarding(true);
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/[0.06] cursor-pointer"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-[#5B21B6] shadow-2xs dark:bg-white/10 dark:text-violet-300">
                  <FontAwesomeIcon icon={faChartPie} className="h-3 w-3" />
                </span>
                <span>Show me around</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('settings');
                  setIsMobileMenuOpen(false);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] transition-colors cursor-pointer ${
                  activeTab === 'settings'
                    ? 'bg-violet-50 font-semibold text-[#5B21B6] dark:bg-violet-500/15 dark:text-violet-300'
                    : 'font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/[0.06]'
                }`}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-zinc-600 shadow-2xs dark:bg-white/10 dark:text-zinc-300">
                  <FontAwesomeIcon icon={faCog} className="h-3 w-3" />
                </span>
                <span>Settings</span>
              </button>
              <button
                type="button"
                onClick={async () => {
                  setIsMobileMenuOpen(false);
                  await authClient.signOut({});
                  clearQueryCache();
                  toast.success('Signed out');
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/25 cursor-pointer"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-950/40">
                  <FontAwesomeIcon icon={faSignOutAlt} className="h-3 w-3" />
                </span>
                <span>Sign out</span>
              </button>
            </div>
          </aside>
        </>
      )}

      {currentRole === 'tenant' && (
        <nav className="sm:hidden mobile-bottom-nav fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-200/80 bg-white/95 backdrop-blur-md dark:border-white/[0.08] dark:bg-[#181922]/95">
          <div className="flex h-15 items-center justify-around px-1">
            {[
              { id: 'dashboard',   label: 'Home',     icon: faChartPie },
              { id: 'finances',    label: 'Payments', icon: faWallet },
              { id: 'maintenance', label: 'Repairs',  icon: faTools },
              { id: 'notices',     label: 'Notices',  icon: faBell },
              { id: 'settings',    label: 'Settings', icon: faCog },
            ].map(t => {
              const isActive = (activeTab || 'dashboard') === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  data-tour={`nav-${t.id}`}
                  onClick={() => {
                    setActiveTab(t.id);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={`flex h-full flex-1 flex-col items-center justify-center gap-0.5 rounded-xl transition-colors cursor-pointer ${
                    isActive
                      ? 'font-semibold text-[#5B21B6] dark:text-violet-300'
                      : 'text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  <div className={`flex h-7 w-9 items-center justify-center rounded-lg transition-colors ${
                    isActive ? 'bg-violet-600/10 dark:bg-violet-500/20' : ''
                  }`}>
                    <FontAwesomeIcon icon={t.icon} className="text-xs" />
                  </div>
                  <span className="text-[10px] leading-none">{t.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {currentRole === 'caretaker' && (
        <nav className="sm:hidden mobile-bottom-nav fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-200/80 bg-white/95 backdrop-blur-md dark:border-white/[0.08] dark:bg-[#181922]/95">
          <div className="flex h-15 items-center justify-around px-1">
            {[
              { id: 'dashboard',   label: 'Home',     icon: faChartPie },
              { id: 'repairs',     label: 'Repairs',  icon: faTools },
              { id: 'reports',     label: 'Reports',  icon: faClipboardList },
              { id: 'automations', label: 'Alerts',   icon: faBell },
              { id: 'settings',    label: 'Settings', icon: faCog },
            ].map(t => {
              const isActive = (activeTab || 'dashboard') === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  data-tour={`nav-${t.id}`}
                  onClick={() => {
                    setActiveTab(t.id);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={`flex h-full flex-1 flex-col items-center justify-center gap-0.5 rounded-xl transition-colors cursor-pointer ${
                    isActive
                      ? 'font-semibold text-[#5B21B6] dark:text-violet-300'
                      : 'text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
                  }`}
                >
                  <div className={`flex h-7 w-9 items-center justify-center rounded-lg transition-colors ${
                    isActive ? 'bg-violet-600/10 dark:bg-violet-500/20' : ''
                  }`}>
                    <FontAwesomeIcon icon={t.icon} className="text-xs" />
                  </div>
                  <span className="text-[10px] leading-none">{t.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}

      <Toaster />
      {showOnboarding && !impersonatedProfile && profile && (
        <Suspense fallback={null}>
          <OnboardingTour
            role={currentRole}
            isSuperAdmin={Boolean(profile.isSuperAdmin)}
            isAdmin={Boolean(profile.isAdmin)}
            activeTab={activeTab || 'dashboard'}
            onNavigateTab={(tab) => {
              setIsMobileMenuOpen(false);
              setActiveTab(tab);
            }}
            onComplete={() => setShowOnboarding(false)}
          />
        </Suspense>
      )}

    </div>
  );
}
