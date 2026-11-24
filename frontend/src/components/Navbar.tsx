import { authClient } from '../lib/auth-client';
import { getPlatformBranding } from '../lib/api';
import { UserProfile, UserRole, promptForPush } from '../App';
import { Button } from '@/components/ui/button';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { tenantConfig } from '../config/tenant';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faShieldAlt, 
  faUsers, 
  faSearch, 
  faSignOutAlt, 
  faCogs, 
  faBuilding,
  faCog,
  faBell,
  faInfoCircle,
} from '@fortawesome/free-solid-svg-icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Capacitor } from '@capacitor/core';
import { useUnreadCount } from '../lib/queries';
import { clearQueryCache } from '../lib/queryClient';

interface NavbarProps {
  user: any;
  profile: UserProfile | null;
  activeView?: UserRole | null;
  setActiveView?: (role: UserRole) => void;
  setActiveTab?: (tab: string) => void;
  onLoginClick?: () => void;
  isImpersonating?: boolean;
  onHelpClick?: () => void;
}

export default function Navbar({ user, profile, activeView, setActiveView, setActiveTab, onLoginClick, isImpersonating, onHelpClick }: NavbarProps) {
  const { setTheme } = useTheme();
  // Shared query: Navbar and Sidebar read the same cached count (one request per poll).
  const { data: unreadCount = 0 } = useUnreadCount(profile?.email);
  const [platformBranding, setPlatformBranding] = useState<{ brandLogoUrl?: string, brandPrimaryColor?: string, brandSecondaryColor?: string, name?: string } | null>(null);

  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    if (isNative) {
      document.documentElement.style.setProperty('--app-header-offset', 'calc(var(--sat) + 16px)');
    } else {
      document.documentElement.style.removeProperty('--app-header-offset');
    }
  }, [isNative]);

  useEffect(() => {
    setTheme('light');
  }, [setTheme]);

  useEffect(() => {
    if (profile?.platformId) {
      getPlatformBranding(profile.platformId)
        .then((data) => {
          setPlatformBranding(data);
          const root = document.documentElement;
          if (data.brandPrimaryColor) {
            root.style.setProperty('--brand-primary', data.brandPrimaryColor);
          }
          if (data.brandSecondaryColor) {
            root.style.setProperty('--brand-secondary', data.brandSecondaryColor);
          }
        })
        .catch(() => {});
    }
  }, [profile?.platformId]);

  const handleLogout = async () => {
    await authClient.signOut({});
    clearQueryCache();
    toast.success('Signed out');
  };

  const switchRole = (role: UserRole) => {
    if (setActiveView) {
      setActiveView(role);
      toast.success(`Switched to ${role} view`);
    }
  };

  const handlePushNotificationRequest = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(50);
    }
    toast.info("Please allow push notifications when prompted.");
    promptForPush();
  };

  const currentRoleLabel = profile?.isSuperAdmin
    ? 'Super Admin'
    : (activeView || profile?.role || 'hunter');

  return (
    <header 
      className={`w-full shrink-0 z-40 transition-all duration-200 ${
        isNative 
          ? 'pointer-events-none bg-transparent border-none flex items-center justify-end px-4 sm:px-6' 
          : 'topbar flex items-center justify-between pointer-events-none sm:pointer-events-auto bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 px-4 sm:px-6 h-14'
      }`}
      style={{ 
        height: isNative ? 'calc(56px + var(--sat))' : undefined,
        paddingTop: isNative ? 'var(--sat)' : undefined
      }}
    >
      {/* Brand & Breadcrumb Container */}
      {!isNative && (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <img 
              src={platformBranding?.brandLogoUrl || tenantConfig.logoUrl} 
              alt={platformBranding?.name || tenantConfig.appName} 
              className="h-7 w-7 object-contain rounded-lg border border-slate-200/60 dark:border-slate-700 bg-white p-0.5" 
              width="28" 
              height="28" 
            />
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white tracking-tight">
                {platformBranding?.name || tenantConfig.appName}
              </span>
              {user && (
                <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200/60 dark:border-slate-700">
                  OS
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Right Side Controls */}
      {user ? (
        <div className={`topbar-right pointer-events-auto flex items-center gap-3 ${
          isNative 
            ? 'bg-white/90 dark:bg-slate-900/90 backdrop-blur-md p-1.5 rounded-full shadow-sm border border-slate-200/80 dark:border-slate-800' 
            : ''
        }`}>
          {profile && !isNative && (
            <div className="hidden sm:flex items-center gap-3 border-r border-slate-200/80 dark:border-slate-800 pr-3">
              <div className="text-right leading-tight">
                <div className="text-xs font-bold text-slate-900 dark:text-white">
                  {profile.displayName || 'User'}
                </div>
                <div className="text-[10px] text-slate-400 font-normal truncate max-w-[150px]">
                  {profile.email}
                </div>
              </div>

              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-2xs">
                {currentRoleLabel}
              </span>
            </div>
          )}

          {/* Notifications Button */}
          <Button
            variant="ghost"
            onClick={handlePushNotificationRequest}
            className="h-8.5 w-8.5 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors p-0 relative cursor-pointer"
            title="Turn on notifications"
            aria-label="Enable Push Notifications"
          >
            <FontAwesomeIcon icon={faBell} className="h-3.5 w-3.5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 flex h-2 w-2">
                <span className="relative inline-flex rounded-full h-2 w-2 bg-zinc-950 dark:bg-white"></span>
              </span>
            )}
          </Button>

          {/* User Profile Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger render={
              <button 
                className="h-8.5 w-8.5 rounded-xl overflow-hidden bg-slate-900 dark:bg-slate-50 text-white dark:text-slate-900 flex items-center justify-center font-bold text-xs shadow-xs hover:ring-2 hover:ring-slate-900/20 active:scale-95 transition-all cursor-pointer relative"
              >
                {profile?.avatarUrl ? (
                  <img src={profile.avatarUrl} alt="avatar" className="h-full w-full object-cover" />
                ) : (
                  profile?.displayName?.charAt(0).toUpperCase() || 'U'
                )}
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-zinc-950 border-2 border-white dark:bg-white dark:border-zinc-950" />
                )}
              </button>
            } />
            <DropdownMenuContent align="end" className="w-72 p-2 mt-2 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl animate-in fade-in zoom-in-95 duration-150">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="font-normal px-3 py-2.5">
                  <div className="flex flex-col space-y-1">
                    <p className="text-xs font-bold text-slate-900 dark:text-white leading-none">{profile?.displayName}</p>
                    <p className="text-[11px] font-medium text-slate-400">{profile?.email}</p>
                    {profile?.role === 'tenant' && (
                      <span className="mt-2 inline-flex w-fit rounded bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">Tenant</span>
                    )}
                  </div>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              
              {profile?.isAdmin && (
                <>
                  <DropdownMenuSeparator className="my-1 bg-slate-100 dark:bg-slate-800" />
                  <DropdownMenuGroup className="py-1">
                    <DropdownMenuLabel className="text-[9px] uppercase text-slate-400 font-bold px-3 py-1 tracking-wider">View as</DropdownMenuLabel>
                    {[
                      { role: 'landlord', label: 'Landlord', icon: faShieldAlt, color: 'text-zinc-500' },
                      { role: 'tenant', label: 'Tenant', icon: faUsers, color: 'text-zinc-500' },
                      { role: 'hunter', label: 'House hunter', icon: faSearch, color: 'text-zinc-500' },
                      { role: 'admin', label: 'Admin', icon: faCogs, color: 'text-zinc-500' }
                    ].map((item) => (
                      <DropdownMenuItem 
                        key={item.role} 
                        onClick={() => switchRole(item.role as UserRole)} 
                        className="cursor-pointer rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-2.5"
                      >
                        <div className="h-6 w-6 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                          <FontAwesomeIcon icon={item.icon} className={`h-3 w-3 ${item.color}`} />
                        </div>
                        <span className="capitalize">{item.label}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </>
              )}
              
              <DropdownMenuSeparator className="my-1 bg-slate-100 dark:bg-slate-800" />
              <DropdownMenuGroup className="py-1">
                {profile && (activeView || profile.role || 'hunter') !== 'hunter' && (
                  <DropdownMenuItem 
                    onClick={() => setActiveTab && setActiveTab((activeView || profile.role) === 'tenant' ? 'notices' : 'automations')} 
                    className="cursor-pointer rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="h-6 w-6 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                        <FontAwesomeIcon icon={faBell} className="h-3 w-3 text-slate-500" />
                      </div>
                      <span>Notifications</span>
                    </div>
                    {unreadCount > 0 && (
                      <span className="h-4 min-w-4 px-1 rounded-full bg-zinc-950 text-[10px] font-bold text-white dark:bg-white dark:text-zinc-950 flex items-center justify-center">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </DropdownMenuItem>
                )}
                
                {profile && (
                  <DropdownMenuItem 
                    onClick={() => setActiveTab && setActiveTab('settings')} 
                    className="cursor-pointer rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-2.5"
                  >
                    <div className="h-6 w-6 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                      <FontAwesomeIcon icon={faCog} className="h-3 w-3 text-slate-500" />
                    </div>
                    <span>Settings</span>
                  </DropdownMenuItem>
                )}
                
                {profile && onHelpClick && (
                  <DropdownMenuItem 
                    onClick={onHelpClick} 
                    className="cursor-pointer rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-2.5"
                  >
                    <div className="h-6 w-6 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                      <FontAwesomeIcon icon={faInfoCircle} className="h-3 w-3 text-slate-500" />
                    </div>
                    <span>Show me around</span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>
              
              <DropdownMenuSeparator className="my-1 bg-slate-100 dark:bg-slate-800" />
              <div className="p-0.5">
                <DropdownMenuItem 
                  onClick={handleLogout} 
                  className="text-zinc-700 dark:text-zinc-200 cursor-pointer rounded-lg px-3 py-2 text-sm font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-2.5"
                >
                  <div className="h-6 w-6 rounded-md bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                    <FontAwesomeIcon icon={faSignOutAlt} className="h-3 w-3 text-zinc-500" />
                  </div>
                  <span>Sign out</span>
                </DropdownMenuItem>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : (
        <div className="topbar-right flex items-center">
          <Button
            className="h-9 cursor-pointer rounded-lg bg-zinc-950 px-4 text-xs font-semibold text-white transition-colors hover:bg-zinc-800"
            onClick={onLoginClick}
          >
            Sign in
          </Button>
        </div>
      )}
    </header>
  );
}
