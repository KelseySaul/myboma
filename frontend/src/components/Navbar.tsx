import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import type { UserProfile, UserRole } from '../App';
import { getPlatformBranding } from '../lib/api';
import { tenantConfig } from '../config/tenant';
import { useUnreadCount } from '../lib/queries';
import AccountMenu from './AccountMenu';

interface NavbarProps {
  user: unknown;
  profile: UserProfile | null;
  activeView?: UserRole | null;
  setActiveView?: (role: UserRole) => void;
  setActiveTab?: (tab: string) => void;
  onLoginClick?: () => void;
  isImpersonating?: boolean;
  onHelpClick?: () => void;
}

/**
 * The in-app header is intentionally phone-only. Desktop navigation and account
 * actions live in Sidebar, so the workspace does not repeat its branding twice.
 */
export default function Navbar({
  user,
  profile,
  activeView,
  setActiveView,
  setActiveTab,
  onLoginClick,
  onHelpClick,
}: NavbarProps) {
  const { data: unreadCount = 0 } = useUnreadCount(profile?.email);

  // Keep white-label colours working even though the desktop header no longer
  // displays the platform name.
  useEffect(() => {
    if (!profile?.platformId) return;

    getPlatformBranding(profile.platformId)
      .then((data) => {
        const root = document.documentElement;
        if (data.brandPrimaryColor) root.style.setProperty('--brand-primary', data.brandPrimaryColor);
        if (data.brandSecondaryColor) root.style.setProperty('--brand-secondary', data.brandSecondaryColor);
      })
      .catch(() => undefined);
  }, [profile?.platformId]);

  return (
    <header className="topbar z-40 flex w-full shrink-0 items-center justify-between border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95 sm:hidden">
      <div className="flex min-w-0 items-center gap-2.5">
        <img
          src={tenantConfig.logoUrl}
          alt=""
          className="h-7 w-7 shrink-0 rounded-lg border border-slate-200/60 bg-white p-0.5 object-contain dark:border-slate-700 dark:bg-slate-800"
          width="28"
          height="28"
        />
        <span className="truncate text-sm font-bold tracking-tight text-slate-900 dark:text-white">{tenantConfig.appName}</span>
      </div>

      {user ? (
        <div className="flex shrink-0 items-center gap-2">
          <AccountMenu
            profile={profile}
            activeView={activeView}
            setActiveView={setActiveView}
            setActiveTab={setActiveTab}
            onHelpClick={onHelpClick}
            unreadCount={unreadCount}
            trigger={
              <button
                type="button"
                aria-label="Open account menu"
                className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-slate-900 text-xs font-bold text-white shadow-xs transition hover:ring-2 hover:ring-slate-900/20 active:scale-95 dark:bg-slate-50 dark:text-slate-900"
              >
                {profile?.avatarUrl ? (
                  <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  profile?.displayName?.charAt(0).toUpperCase() || 'U'
                )}
              </button>
            }
          />
        </div>
      ) : (
        <Button className="h-9 rounded-lg px-4 text-xs font-semibold" onClick={onLoginClick}>
          Sign in
        </Button>
      )}
    </header>
  );
}
