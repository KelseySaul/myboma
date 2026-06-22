import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './supabase';
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

const stripUndefined = (value: Record<string, any>) => (
  Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined))
);

const getStoredTermsAcceptance = () => {
  try {
    const raw = localStorage.getItem('myboma_terms_acceptance');
    if (!raw) return null;
    return JSON.parse(raw) as {
      acceptedAt?: string;
      termsVersion?: string;
      privacyVersion?: string;
    };
  } catch {
    return null;
  }
};

const getMissingSchemaColumn = (error: any) => {
  const message = error?.message || '';
  return /'([^']+)' column/.exec(message)?.[1] || null;
};

const upsertProfile = async (profile: UserProfile) => {
  const unsupportedColumns = new Set<string>();
  let lastError: any = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const payload = stripUndefined(
      Object.fromEntries(Object.entries(profile).filter(([key]) => !unsupportedColumns.has(key)))
    );
    const { error } = await supabase
      .from('users')
      .upsert([payload], { onConflict: 'uid' });

    if (!error) return;

    lastError = error;
    const missingColumn = getMissingSchemaColumn(error);
    if (error.code === 'PGRST204' && missingColumn && !unsupportedColumns.has(missingColumn)) {
      console.warn(`App: Supabase schema is missing '${missingColumn}'. Retrying profile sync without it.`);
      unsupportedColumns.add(missingColumn);
      continue;
    }

    throw error;
  }

  throw lastError;
};

const fetchInvitation = async (email: string) => {
  if (!email) return null;

  const { data, error } = await supabase
    .from('invitations')
    .select('email,platformId,displayName,phone,role,landlordId')
    .eq('email', email.toLowerCase())
    .maybeSingle();

  if (error) {
    console.warn("App: Invitation lookup skipped:", error.message);
    return null;
  }

  return data;
};

export default function App() {
  const [user, setUser] = useState<any>(null);
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
      // 1. Update password in Supabase Auth
      const { error: authError } = await supabase.auth.updateUser({ password: newPassword });
      if (authError) throw authError;

      // 2. Update mustChangePassword flag in public.users table
      const { error: dbError } = await supabase
        .from('users')
        .update({ mustChangePassword: false })
        .eq('uid', profile.uid);
      if (dbError) throw dbError;

      // 3. Log audit event
      logAudit('PROFILE_UPDATE', 'user', profile.uid, { action: 'forced_password_reset' });

      // 4. Update state to unlock UI
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

  useEffect(() => {
    let profileSubscription: any = null;
    let isMounted = true;
    let lastProcessedUserId: string | null = null;

    // Safety timeout: if auth doesn't resolve in 8 seconds, stop loading
    const safetyTimeout = setTimeout(() => {
      if (isMounted && loading) {
        console.warn('App: Auth check timed out (8s)');
        setLoading(false);
      }
    }, 8000);

    const handleProfile = async (currentUser: any, retryCount = 0) => {
      if (!currentUser || !isMounted) {
        setProfile(null);
        return;
      }

      if (lastProcessedUserId === currentUser.id && profileRef.current) {
        return;
      }
      lastProcessedUserId = currentUser.id;

      try {
        const { data: profileData, error: profileError } = await supabase
          .from('users')
          .select('uid,email,displayName,role,platformId,isAdmin,isSuperAdmin,phone,address,avatarUrl,bankName,bankAccountNumber,bankAccountName,rentPayoutMethod,cashPayoutNotes,subscriptionPlan,subscriptionStatus,subscriptionExpiresAt,createdAt,mustChangePassword,status,termsAcceptedAt,termsVersion,privacyVersion')
          .eq('uid', currentUser.id)
          .maybeSingle();

        if (!isMounted) return;

        if (profileData) {
          const p = normalizeProfile(profileData);
          setProfile(p);
          if (!activeView) setActiveView(p.role);
          // Show onboarding tour for first-time users
          if (shouldShowOnboarding(p.role)) setShowOnboarding(true);
          setError(null);
        } else if (profileError) {
          console.error("App: Profile fetch error:", JSON.stringify(profileError, null, 2));
          throw profileError;
        } else {
          // Profile genuinely doesn't exist, create it
          const email = (currentUser.email || '').toLowerCase();
          const invitation = await fetchInvitation(email);
          const savedRole = normalizeRole(localStorage.getItem('myboma_intended_role'));
          const invitedRole = normalizeRole(invitation?.role);
          const role = invitation ? invitedRole : savedRole;
          const termsAcceptance = getStoredTermsAcceptance();

          const newProfile: UserProfile = {
            uid: currentUser.id,
            platformId: invitation?.platformId,
            email,
            displayName: currentUser.user_metadata?.full_name || invitation?.displayName || 'User',
            role,
            isAdmin: role === 'admin',
            isSuperAdmin: false,
            phone: currentUser.user_metadata?.phone || invitation?.phone,
            createdAt: new Date().toISOString(),
            termsAcceptedAt: currentUser.user_metadata?.terms_accepted_at || termsAcceptance?.acceptedAt,
            termsVersion: currentUser.user_metadata?.terms_version || termsAcceptance?.termsVersion,
            privacyVersion: currentUser.user_metadata?.privacy_version || termsAcceptance?.privacyVersion,
          };
          
          await upsertProfile(newProfile);

          // NOTE: We intentionally do NOT delete the invitation here.
          // The server keeps invitations alive as the landlord's tenant registry.
          // The DB trigger (handle_new_user) already consumed the invite for role/platformId assignment.
          
          if (isMounted) {
            const p = normalizeProfile(newProfile);
            setProfile(p);
            if (!activeView) setActiveView(p.role);
            // Show onboarding tour for new accounts
            if (shouldShowOnboarding(p.role)) setShowOnboarding(true);
            localStorage.removeItem('myboma_intended_role');
            setError(null);
          }
        }

        // Set up realtime with a stable channel name (no random suffix to avoid WebSocket leaks)
        if (profileSubscription) profileSubscription.unsubscribe();
        profileSubscription = supabase
          .channel(`profile-changes-${currentUser.id}`)
          .on('postgres_changes', 
              { event: 'UPDATE', schema: 'public', table: 'users', filter: `uid=eq.${currentUser.id}` }, 
              (payload) => {
                if (isMounted) {
                  const updatedProfile = normalizeProfile(payload.new);
                  setProfile(updatedProfile);
                  setActiveView(prev => (!updatedProfile.isAdmin ? updatedProfile.role : prev || updatedProfile.role));
                }
              }
          )
          .subscribe();
      } catch (err: any) {
        console.error("App: Profile handling error:", err);
        if (isMounted) {
          if (retryCount < 1) {
            return handleProfile(currentUser, retryCount + 1);
          }
          setError(err.message || "Failed to load profile");
        }
        throw err;
      }
    };

    // 1. Get initial session synchronously on mount to avoid long timeouts on refresh
    const initSession = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        
        if (!isMounted) return;
        
        if (session?.user) {
          setUser(session.user);
          const pref = localStorage.getItem(`myboma_default_page_${session.user.id}`);
          if (pref) setActiveTab(pref);
          await handleProfile(session.user);
          // Tie this device to your Supabase User ID
          if (Capacitor.isNativePlatform()) {
            if (oneSignalNativeInitialized) {
              try {
                OneSignalNative.login(session.user.id);
              } catch (e) {
                console.error("OneSignalNative.login failed:", e);
              }
            }
          } else {
            if (oneSignalWebInitialized) {
              try {
                OneSignalWeb.login(session.user.id);
              } catch (e) {
                console.error("OneSignalWeb.login failed:", e);
              }
            }
          }
        } else {
          // When they log out
          if (Capacitor.isNativePlatform()) {
            if (oneSignalNativeInitialized) {
              try {
                OneSignalNative.logout();
              } catch (e) {
                console.error("OneSignalNative.logout failed:", e);
              }
            }
          } else {
            if (oneSignalWebInitialized) {
              try {
                OneSignalWeb.logout();
              } catch (e) {
                console.error("OneSignalWeb.logout failed:", e);
              }
            }
          }
        }
      } catch (err) {
        console.error("App: Session restore error:", err);
      } finally {
        if (isMounted) {
          setLoading(false);
          clearTimeout(safetyTimeout);
        }
      }
    };

    initSession();

    // 2. Set up event listener for subsequent changes
    const { data: { subscription: authListener } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;

      const currentUser = session?.user || null;
      setUser(currentUser);
      
      if (currentUser) {
        const pref = localStorage.getItem(`myboma_default_page_${currentUser.id}`);
        if (pref) setActiveTab(pref);
        handleProfile(currentUser).catch(() => {});
        // Tie this device to your Supabase User ID
        if (Capacitor.isNativePlatform()) {
          if (oneSignalNativeInitialized) {
            try {
              OneSignalNative.login(currentUser.id);
            } catch (e) {
              console.error("OneSignalNative.login failed:", e);
            }
          }
        } else {
          if (oneSignalWebInitialized) {
            try {
              OneSignalWeb.login(currentUser.id);
            } catch (e) {
              console.error("OneSignalWeb.login failed:", e);
            }
          }
        }
      } else {
        lastProcessedUserId = null;
        setProfile(null);
        setActiveView(null);
        setError(null);
        if (profileSubscription) {
          profileSubscription.unsubscribe();
          profileSubscription = null;
        }
        // When they log out
        if (Capacitor.isNativePlatform()) {
          if (oneSignalNativeInitialized) {
            try {
              OneSignalNative.logout();
            } catch (e) {
              console.error("OneSignalNative.logout failed:", e);
            }
          }
        } else {
          if (oneSignalWebInitialized) {
            try {
              OneSignalWeb.logout();
            } catch (e) {
              console.error("OneSignalWeb.logout failed:", e);
            }
          }
        }
      }
      
      // Only set loading=false here for sign-out / session-missing events.
      // For sign-in events, initSession already sets loading=false after the profile fetch completes.
      // Doing it here too causes the UI to flash before the profile is ready.
      if (!currentUser) {
        setLoading(false);
        clearTimeout(safetyTimeout);
      }
    });

    return () => {
      isMounted = false;
      authListener.unsubscribe();
      if (profileSubscription) profileSubscription.unsubscribe();
      clearTimeout(safetyTimeout);
    };
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('users')
      .select(
        'uid,email,displayName,role,platformId,isAdmin,isSuperAdmin,phone,address,avatarUrl,bankName,bankAccountNumber,bankAccountName,rentPayoutMethod,cashPayoutNotes,subscriptionPlan,subscriptionStatus,subscriptionExpiresAt,createdAt,mustChangePassword,status,termsAcceptedAt,termsVersion,privacyVersion',
      )
      .eq('uid', user.id)
      .maybeSingle();
    if (data) setProfile(normalizeProfile(data));
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
          const { data, error } = await supabase
            .from('users')
            .select('subscriptionStatus, subscriptionExpiresAt, role')
            .eq('uid', currentUserId)
            .maybeSingle();
          
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
      <div className="flex min-h-screen w-full items-center justify-center bg-slate-50/50 p-4 relative overflow-hidden">
        {/* Abstract beautiful mesh gradient background blobs */}
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-gradient-to-br from-indigo-200/40 to-purple-200/40 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-gradient-to-tr from-blue-200/40 to-emerald-200/40 blur-[120px] pointer-events-none" />
        
        <div className="relative w-full max-w-[460px] bg-white/80 backdrop-blur-xl border border-white/40 shadow-[0_32px_64px_rgba(15,23,42,0.08)] rounded-[32px] p-8 md:p-10 transition-all duration-300 animate-in fade-in zoom-in-95 duration-500 flex flex-col gap-8">
          
          <div className="flex flex-col items-center gap-6 text-center">
            {/* Pulsing Lock Icon */}
            <div className="relative flex items-center justify-center">
              <div className="absolute inset-0 rounded-[24px] bg-indigo-500/10 blur-xl animate-pulse scale-150" />
              <div className="relative h-16 w-16 rounded-[24px] bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-[0_8px_20px_rgba(79,70,229,0.3)] flex items-center justify-center text-white">
                <i className="ti ti-shield-lock text-3xl"></i>
              </div>
            </div>
            
            <div className="space-y-2">
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">Secure Your Account</h2>
              <p className="text-sm font-medium text-slate-500 leading-relaxed max-w-sm">
                To complete your onboarding, please update your temporary credentials with a new secure password.
              </p>
            </div>
          </div>
          
          <form onSubmit={handlePasswordReset} className="flex flex-col gap-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-slate-400">New Password</label>
                <div className="relative">
                  <Input 
                    type="password" 
                    required 
                    placeholder="Min. 8 characters" 
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="h-12 px-4 rounded-2xl border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/10 bg-white/50"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-widest text-slate-400">Confirm Password</label>
                <div className="relative">
                  <Input 
                    type="password" 
                    required 
                    placeholder="Re-enter password" 
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="h-12 px-4 rounded-2xl border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/10 bg-white/50"
                  />
                </div>
              </div>
            </div>
            
            {resetError && (
              <div className="flex items-center gap-2 p-4 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 text-xs font-semibold leading-relaxed animate-in fade-in slide-in-from-top-1 duration-200">
                <i className="ti ti-alert-circle text-lg shrink-0"></i>
                <span>{resetError}</span>
              </div>
            )}
            
            <Button 
              type="submit" 
              disabled={resetLoading}
              className="w-full h-13 rounded-2xl bg-slate-950 hover:bg-slate-800 text-white font-black text-sm transition-all shadow-[0_4px_12px_rgba(15,23,42,0.15)] flex items-center justify-center gap-2"
            >
              {resetLoading ? (
                <>
                  <i className="ti ti-spinner animate-spin text-lg"></i>
                  <span>Updating Credentials...</span>
                </>
              ) : (
                <>
                  <span>Activate Account</span>
                  <i className="ti ti-arrow-right text-base"></i>
                </>
              )}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  const activeProfile = impersonatedProfile ?? profile;
  const currentRole = impersonatedProfile
    ? impersonatedProfile.role
    : (activeView || profile?.role || 'hunter');

  const landlordNeedsSubscription = Boolean(
    activeProfile &&
      currentRole === 'landlord' &&
      !isLandlordSubscriptionActive(activeProfile),
  );

  return (
    <div 
      className={`db app-shell min-h-screen bg-[#f8f9fa] transition-colors duration-300 flex flex-col ${impersonatedProfile ? 'app-shell-impersonating' : ''}`}
    >
      {impersonatedProfile && (
        <ImpersonationBanner target={impersonatedProfile} onExit={handleExitImpersonation} />
      )}
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
      {/* Sidebar + content row */}
      <div className="flex flex-1 min-h-0">
        {/* Desktop Sidebar — only when logged in */}
        {activeProfile && (
          <Sidebar
            profile={activeProfile}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            currentRole={currentRole as UserRole}
            isImpersonating={Boolean(impersonatedProfile)}
          />
        )}
        {/* Main content area */}
        <main className="flex-1 min-w-0 w-full">
          {error ? (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
              <div className="h-16 w-16 rounded-3xl bg-rose-500/10 text-rose-600 flex items-center justify-center">
                <FontAwesomeIcon icon={faExclamationTriangle} className="h-8 w-8" />
              </div>
              <div>
                <h3 className="text-xl font-black text-zinc-900 dark:text-white">Profile Error</h3>
                <p className="text-zinc-500 max-w-xs mx-auto mt-2">{error}</p>
              </div>
              <Button onClick={() => window.location.reload()} className="gap-2 rounded-xl">
                <FontAwesomeIcon icon={faSync} className="h-4 w-4" />
                Try Again
              </Button>
            </div>
          ) : !profile ? (
             <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
               <div className="relative flex items-center justify-center">
                 <div className="absolute inset-0 rounded-2xl bg-zinc-100/80 blur-lg animate-pulse scale-150" />
                 <img
                   src={tenantConfig.logoUrl}
                   alt={tenantConfig.appName}
                   className="relative h-12 w-12 object-contain rounded-xl animate-logo-reveal bg-white p-1 shadow-xs"
                 />
               </div>
               <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-400">Synchronizing Identity...</p>
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
        </main>
      </div>

      {currentRole === 'admin' && (
        <>
          {/* Mobile Bottom Navigation Bar */}
          <nav className="sm:hidden mobile-bottom-nav fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-zinc-100 shadow-[0_-4px_24px_rgba(0,0,0,0.06)]">
            <div className="flex items-center justify-around h-16 px-1">
              {[
                { id: 'dashboard',   label: 'Home',      icon: faChartPie },
                { id: 'registered',  label: 'Users',     icon: faUsers },
                { id: 'pending',     label: 'Pending',   icon: faLink },
                { id: 'properties',  label: 'Assets', icon: faBuilding },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => {
                    setActiveTab(t.id);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={`flex flex-col items-center justify-center gap-1 flex-1 h-full rounded-xl transition-all ${
                    activeTab === t.id
                      ? 'text-indigo-600'
                      : 'text-zinc-400 hover:text-zinc-700'
                  }`}
                >
                  <div className={`flex items-center justify-center h-7 w-7 rounded-xl transition-all ${
                    activeTab === t.id ? 'bg-indigo-50' : ''
                  }`}>
                    <FontAwesomeIcon icon={t.icon} className={`text-sm ${activeTab === t.id ? 'text-indigo-600' : 'text-zinc-400'}`} />
                  </div>
                  <span className={`text-[9px] font-black uppercase tracking-wide leading-none ${
                    activeTab === t.id ? 'text-indigo-600' : 'text-zinc-400'
                  }`}>{t.label}</span>
                </button>
              ))}
              {(() => {
                const isAdminMenuTabActive = ['maintenance', 'finances', 'tenants', 'automations', 'platforms', 'audit', 'settings'].includes(activeTab);
                return (
                  <button
                    onClick={() => setIsMobileMenuOpen(true)}
                    className={`flex flex-col items-center justify-center gap-1 flex-1 h-full rounded-xl transition-all ${
                      isAdminMenuTabActive
                        ? 'text-indigo-600'
                        : 'text-zinc-400 hover:text-zinc-700'
                    }`}
                  >
                    <div className={`flex items-center justify-center h-7 w-7 rounded-xl transition-all ${
                      isAdminMenuTabActive ? 'bg-indigo-50' : ''
                    }`}>
                      <FontAwesomeIcon icon={faBars} className={`text-sm ${isAdminMenuTabActive ? 'text-indigo-600' : 'text-zinc-400'}`} />
                    </div>
                    <span className={`text-[9px] font-black uppercase tracking-wide leading-none ${
                      isAdminMenuTabActive ? 'text-indigo-600' : 'text-zinc-400'
                    }`}>Menu</span>
                  </button>
                );
              })()}
            </div>
          </nav>

          {/* Mobile Drawer Slide-out Menu (Right to Left) */}
          {isMobileMenuOpen && (
            <div 
              className="fixed inset-0 bg-black/45 z-50 sm:hidden transition-opacity duration-300 backdrop-blur-xs animate-in fade-in"
              onClick={() => setIsMobileMenuOpen(false)}
            />
          )}
          
          <div 
            className={`fixed inset-y-0 right-0 z-50 w-72 bg-white dark:bg-zinc-950 shadow-2xl p-6 sm:hidden transition-transform duration-300 ease-in-out ${
              isMobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-4 mb-6">
              <span className="text-xs font-black uppercase tracking-widest text-zinc-900 dark:text-white">More Options</span>
              <button 
                onClick={() => setIsMobileMenuOpen(false)}
                className="h-8 w-8 rounded-xl bg-zinc-50 dark:bg-zinc-900 flex items-center justify-center hover:bg-zinc-100"
              >
                <FontAwesomeIcon icon={faTimes} className="h-3.5 w-3.5 text-zinc-500" />
              </button>
            </div>
            
            <nav className="space-y-1.5 overflow-y-auto max-h-[calc(100vh-140px)]">
              {[
                { id: 'maintenance', label: 'Maintenance',   icon: faTools,         color: 'text-amber-500' },
                { id: 'finances',    label: 'Finances',      icon: faWallet,        color: 'text-emerald-500' },
                { id: 'tenants',     label: 'Tenants',       icon: faUsers,         color: 'text-purple-500' },
                { id: 'automations', label: 'Notifications', icon: faBell,          color: 'text-rose-500' },
                ...(profile?.isSuperAdmin ? [
                  { id: 'platforms', label: 'Network',        icon: faGlobe,         color: 'text-indigo-500' },
                  { id: 'audit',     label: 'Audit Log',      icon: faClipboardList, color: 'text-rose-500' },
                ] : []),
                { id: 'settings',    label: 'Settings',       icon: faCog,           color: 'text-zinc-500' }
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
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all duration-150 ${
                      isActive
                        ? 'bg-zinc-950 text-white dark:bg-zinc-800'
                        : 'text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-900 hover:text-zinc-900'
                    }`}
                  >
                    <div className={`h-8 w-8 rounded-xl flex items-center justify-center shrink-0 ${
                      isActive ? 'bg-white/15' : 'bg-zinc-50 dark:bg-zinc-900'
                    }`}>
                      <FontAwesomeIcon
                        icon={item.icon}
                        className={`h-3.5 w-3.5 ${isActive ? 'text-white' : item.color}`}
                      />
                    </div>
                    <span className={`text-[11px] font-black uppercase tracking-wide ${
                      isActive ? 'text-white' : 'text-zinc-700 dark:text-zinc-300'
                    }`}>
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
          <nav className="sm:hidden mobile-bottom-nav fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-zinc-100 shadow-[0_-4px_24px_rgba(0,0,0,0.06)]">
            <div className="flex items-center justify-around h-16 px-1">
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
                  className={`flex flex-col items-center justify-center gap-1 flex-1 h-full rounded-xl transition-all ${
                    activeTab === t.id
                      ? 'text-indigo-600'
                      : 'text-zinc-400 hover:text-zinc-700'
                  }`}
                >
                  <div className={`flex items-center justify-center h-7 w-7 rounded-xl transition-all ${
                    activeTab === t.id ? 'bg-indigo-50' : ''
                  }`}>
                    <FontAwesomeIcon icon={t.icon} className={`text-sm ${activeTab === t.id ? 'text-indigo-600' : 'text-zinc-400'}`} />
                  </div>
                  <span className={`text-[9px] font-black uppercase tracking-wide leading-none ${
                    activeTab === t.id ? 'text-indigo-600' : 'text-zinc-400'
                  }`}>{t.label}</span>
                </button>
              ))}
              {(() => {
                const isMenuTabActive = ['maintenance', 'automations', 'settings'].includes(activeTab);
                return (
                  <button
                    onClick={() => setIsMobileMenuOpen(true)}
                    className={`flex flex-col items-center justify-center gap-1 flex-1 h-full rounded-xl transition-all ${
                      isMenuTabActive
                        ? 'text-indigo-600'
                        : 'text-zinc-400 hover:text-zinc-700'
                    }`}
                  >
                    <div className={`flex items-center justify-center h-7 w-7 rounded-xl transition-all ${
                      isMenuTabActive ? 'bg-indigo-50' : ''
                    }`}>
                      <FontAwesomeIcon icon={faBars} className={`text-sm ${isMenuTabActive ? 'text-indigo-600' : 'text-zinc-400'}`} />
                    </div>
                    <span className={`text-[9px] font-black uppercase tracking-wide leading-none ${
                      isMenuTabActive ? 'text-indigo-600' : 'text-zinc-400'
                    }`}>Menu</span>
                  </button>
                );
              })()}
            </div>
          </nav>

          {/* Mobile Drawer Slide-out Menu (Right to Left) */}
          {isMobileMenuOpen && (
            <div 
              className="fixed inset-0 bg-black/45 z-50 sm:hidden transition-opacity duration-300 backdrop-blur-xs animate-in fade-in"
              onClick={() => setIsMobileMenuOpen(false)}
            />
          )}
          
          <div 
            className={`fixed inset-y-0 right-0 z-50 w-72 bg-white dark:bg-zinc-950 shadow-2xl p-6 sm:hidden transition-transform duration-300 ease-in-out ${
              isMobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-4 mb-6">
              <span className="text-xs font-black uppercase tracking-widest text-zinc-900 dark:text-white">More Options</span>
              <button 
                onClick={() => setIsMobileMenuOpen(false)}
                className="h-8 w-8 rounded-xl bg-zinc-50 dark:bg-zinc-900 flex items-center justify-center hover:bg-zinc-100"
              >
                <FontAwesomeIcon icon={faTimes} className="h-3.5 w-3.5 text-zinc-500" />
              </button>
            </div>
            
            <nav className="space-y-1.5 overflow-y-auto max-h-[calc(100vh-140px)]">
              {[
                { id: 'maintenance', label: 'Maintenance',   icon: faTools,         color: 'text-amber-500' },
                { id: 'automations', label: 'Notifications', icon: faBell,          color: 'text-rose-500' },
                { id: 'settings',    label: 'Settings',       icon: faCog,           color: 'text-zinc-500' }
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
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all duration-150 ${
                      isActive
                        ? 'bg-zinc-950 text-white dark:bg-zinc-800'
                        : 'text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-900 hover:text-zinc-900'
                    }`}
                  >
                    <div className={`h-8 w-8 rounded-xl flex items-center justify-center shrink-0 ${
                      isActive ? 'bg-white/15' : 'bg-zinc-50 dark:bg-zinc-900'
                    }`}>
                      <FontAwesomeIcon
                        icon={item.icon}
                        className={`h-3.5 w-3.5 ${isActive ? 'text-white' : item.color}`}
                      />
                    </div>
                    <span className={`text-[11px] font-black uppercase tracking-wide ${
                      isActive ? 'text-white' : 'text-zinc-700 dark:text-zinc-300'
                    }`}>
                      {item.label}
                    </span>
                  </button>
                );
              })}

              <div className="my-2 border-t border-zinc-100 dark:border-zinc-800" />
              
              <button
                onClick={async () => {
                  setIsMobileMenuOpen(false);
                  await supabase.auth.signOut();
                }}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-all"
              >
                <div className="h-8 w-8 rounded-xl bg-rose-50 dark:bg-rose-950/30 flex items-center justify-center shrink-0">
                  <FontAwesomeIcon icon={faSignOutAlt} className="h-3.5 w-3.5 text-rose-500" />
                </div>
                <span className="text-[11px] font-black uppercase tracking-wide">Sign Out</span>
              </button>
            </nav>
          </div>
        </>
      )}

      {currentRole === 'tenant' && (
        <nav className="sm:hidden mobile-bottom-nav fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-zinc-100 shadow-[0_-4px_24px_rgba(0,0,0,0.06)]">
          <div className="flex items-center justify-around h-16 px-1">
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
                  className={`flex flex-col items-center justify-center gap-1 flex-1 h-full rounded-xl transition-all ${
                    isActive
                      ? 'text-emerald-600'
                      : 'text-zinc-400 hover:text-zinc-700'
                  }`}
                >
                  <div className={`flex items-center justify-center h-7 w-7 rounded-xl transition-all ${
                    isActive ? 'bg-emerald-50' : ''
                  }`}>
                    <FontAwesomeIcon icon={t.icon} className={`text-sm ${isActive ? 'text-emerald-600' : 'text-zinc-400'}`} />
                  </div>
                  <span className={`text-[9px] font-black uppercase tracking-wide leading-none ${
                    isActive ? 'text-emerald-600' : 'text-zinc-400'
                  }`}>{t.label}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}

      <Footer />
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
