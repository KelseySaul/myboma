import { authClient } from '../lib/auth-client';
import { getUnreadNotificationCount, getPlatformBranding } from '../lib/api';
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
  faUserShield,
  faBuilding,
  faCog,
  faBell,
  faInfoCircle
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

import { Capacitor } from '@capacitor/core';

export default function Navbar({ user, profile, activeView, setActiveView, setActiveTab, onLoginClick, isImpersonating, onHelpClick }: NavbarProps) {
  const { setTheme } = useTheme();
  const [unreadCount, setUnreadCount] = useState(0);
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

  // Polls for unread notifications — replaces the old Supabase Realtime subscription.
  useEffect(() => {
    if (!profile?.email) return;

    let isActive = true;
    const fetchUnread = () => {
      getUnreadNotificationCount()
        .then(({ count }) => {
          if (isActive) setUnreadCount(count);
        })
        .catch(() => {});
    };

    fetchUnread();
    const interval = setInterval(fetchUnread, 20000);

    return () => {
      isActive = false;
      clearInterval(interval);
    };
  }, [profile?.email, profile?.uid]);

  const handleLogout = async () => {
    await authClient.signOut({});
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

  return (
    <header 
      className={`fixed left-0 right-0 z-50 transition-all duration-300 ${
        isNative 
          ? 'pointer-events-none bg-transparent border-none flex items-center justify-end px-4 sm:px-6' 
          : 'topbar sm:flex flex items-center justify-end sm:justify-between pointer-events-none sm:pointer-events-auto bg-transparent sm:bg-white border-none sm:border-b dark:sm:border-zinc-800/50 px-4 sm:px-4'
      } ${isImpersonating ? 'topbar-below-impersonation' : ''}`}
      style={{ 
        top: isImpersonating ? 'var(--impersonation-height)' : 0,
        height: isNative ? 'calc(56px + var(--sat))' : undefined,
        paddingTop: isNative ? 'var(--sat)' : undefined
      }}
    >
      {/* Brand Container with Logo */}
      {!isNative && (
        <div className="brand items-center gap-3 hidden sm:flex">
          <img 
            src={platformBranding?.brandLogoUrl || tenantConfig.logoUrl} 
            alt={platformBranding?.name || tenantConfig.appName} 
            className="h-8 object-contain" 
            width="32" 
            height="32" 
          />
          <div>
            <div className="brand-name">{platformBranding?.name || tenantConfig.appName.toUpperCase()}</div>
            <div className="brand-sub">{tenantConfig.companyName.toUpperCase()}</div>
          </div>
        </div>
      )}

      {/* Right Side Options */}
      {user ? (
        <div className={`topbar-right pointer-events-auto ${isNative ? 'bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md p-1.5 rounded-full shadow-sm border border-zinc-200/50 dark:border-zinc-800/50' : 'bg-white/80 dark:bg-zinc-900/80 sm:bg-transparent dark:sm:bg-transparent backdrop-blur-md sm:backdrop-blur-none p-1.5 sm:p-0 rounded-full sm:rounded-none shadow-sm sm:shadow-none border border-zinc-200/50 dark:border-zinc-800/50 sm:border-none'}`}>
          {profile && !isNative && (
            <>
              <span className="role-badge hidden sm:block">
                {profile.isSuperAdmin ? 'SUPER ADMIN' : (activeView || profile.role || 'hunter').toUpperCase()}
              </span>
              <div className="user-info hidden sm:block">
                <div className="user-name">{profile.displayName}</div>
                <div className="user-email">{profile.email}</div>
              </div>
            </>
          )}

          <Button
            variant="ghost"
            onClick={handlePushNotificationRequest}
            className="h-8 w-8 rounded-full text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 transition-colors p-0 flex items-center justify-center mr-1"
            title="Enable Push Notifications"
            aria-label="Enable Push Notifications"
          >
            <FontAwesomeIcon icon={faBell} />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger render={
              <Button 
                variant="ghost" 
                className="avatar cursor-pointer p-0 border-none rounded-full flex items-center justify-center bg-blue-500 hover:scale-105 active:scale-95 transition-all text-white font-bold relative overflow-hidden"
                style={{ width: '32px', height: '32px' }}
              >
                {profile?.avatarUrl ? (
                  <img src={profile.avatarUrl} alt="avatar" className="h-full w-full object-cover" />
                ) : (
                  profile?.displayName?.charAt(0).toUpperCase() || 'U'
                )}
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-purple-600 border border-white animate-pulse shadow-[0_0_8px_#9333ea]" />
                )}
              </Button>
            } />
            <DropdownMenuContent align="end" className="w-72 p-3 mt-2 rounded-2xl border border-zinc-100 bg-white shadow-lg animate-in fade-in zoom-in duration-200">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="font-normal px-4 py-3">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-bold leading-none text-zinc-900">{profile?.displayName}</p>
                    <p className="text-[11px] font-medium text-zinc-400 mt-1">{profile?.email}</p>
                    {profile?.role === 'tenant' && (
                      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-zinc-100">
                        <span className="text-[9px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full">Tenant Node</span>
                        <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-emerald-600">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                          </span>
                          Lease active
                        </div>
                      </div>
                    )}
                  </div>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              
              {profile?.isAdmin && (
                <>
                  <DropdownMenuSeparator className="mx-4 bg-zinc-100" />
                  <DropdownMenuGroup className="py-1">
                    <DropdownMenuLabel className="text-[9px] uppercase text-zinc-400 font-bold px-4 py-2 tracking-[0.2em]">Context Switcher</DropdownMenuLabel>
                    {[
                      { role: 'landlord', icon: faShieldAlt, color: 'text-blue-500', bg: 'hover:bg-blue-50/50' },
                      { role: 'tenant', icon: faUsers, color: 'text-emerald-500', bg: 'hover:bg-emerald-50/50' },
                      { role: 'hunter', icon: faSearch, color: 'text-purple-500', bg: 'hover:bg-purple-50/50' },
                      { role: 'admin', icon: faCogs, color: 'text-rose-500', bg: 'hover:bg-rose-50/50' }
                    ].map((item) => (
                      <DropdownMenuItem 
                        key={item.role} 
                        onClick={() => switchRole(item.role as UserRole)} 
                        className={`cursor-pointer rounded-xl px-4 py-2 m-1 transition-all flex items-center ${item.bg}`}
                      >
                        <div className="h-7 w-7 rounded-lg bg-zinc-50 flex items-center justify-center mr-3">
                          <FontAwesomeIcon icon={item.icon} className={`h-3.5 w-3.5 ${item.color}`} />
                        </div>
                        <span className="font-bold text-[11px] uppercase tracking-wider text-zinc-700">{item.role} View</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </>
              )}
              
              <DropdownMenuSeparator className="mx-4 bg-zinc-100" />
              <DropdownMenuGroup className="py-1">
                {profile && (activeView || profile.role || 'hunter') !== 'hunter' && (
                  <DropdownMenuItem 
                    onClick={() => setActiveTab && setActiveTab((activeView || profile.role) === 'tenant' ? 'notices' : 'automations')} 
                    className="cursor-pointer rounded-xl px-4 py-2.5 m-1 transition-all flex items-center hover:bg-zinc-50 group"
                  >
                    <div className="h-7 w-7 rounded-lg bg-zinc-50 group-hover:bg-white flex items-center justify-center mr-3 relative shadow-sm border border-zinc-100">
                      <FontAwesomeIcon icon={faBell} className="h-3.5 w-3.5 text-zinc-500 group-hover:text-zinc-700" />
                      {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-rose-500 border-2 border-white flex items-center justify-center text-[8px] text-white font-bold shadow-sm">
                          {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                      )}
                    </div>
                    <span className="font-bold text-[11px] uppercase tracking-wider text-zinc-700">Notifications</span>
                  </DropdownMenuItem>
                )}
                
                {profile && (
                  <DropdownMenuItem 
                    onClick={() => setActiveTab && setActiveTab('settings')} 
                    className="cursor-pointer rounded-xl px-4 py-2.5 m-1 transition-all flex items-center hover:bg-zinc-50 group"
                  >
                    <div className="h-7 w-7 rounded-lg bg-zinc-50 group-hover:bg-white flex items-center justify-center mr-3 shadow-sm border border-zinc-100">
                      <FontAwesomeIcon icon={faCog} className="h-3.5 w-3.5 text-zinc-500 group-hover:text-zinc-700" />
                    </div>
                    <span className="font-bold text-[11px] uppercase tracking-wider text-zinc-700">Settings</span>
                  </DropdownMenuItem>
                )}
                
                {profile && onHelpClick && (
                  <DropdownMenuItem 
                    onClick={onHelpClick} 
                    className="cursor-pointer rounded-xl px-4 py-2.5 m-1 transition-all flex items-center hover:bg-zinc-50 group"
                  >
                    <div className="h-7 w-7 rounded-lg bg-zinc-50 group-hover:bg-white flex items-center justify-center mr-3 shadow-sm border border-zinc-100">
                      <FontAwesomeIcon icon={faInfoCircle} className="h-3.5 w-3.5 text-zinc-500 group-hover:text-zinc-700" />
                    </div>
                    <span className="font-bold text-[11px] uppercase tracking-wider text-zinc-700">Quick Start Tour</span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>
              
              <DropdownMenuSeparator className="mx-4 bg-zinc-100" />
              <div className="p-1">
                <DropdownMenuItem 
                  onClick={handleLogout} 
                  className="text-rose-600 cursor-pointer rounded-xl px-4 py-2.5 focus:bg-rose-50 flex items-center group"
                >
                  <FontAwesomeIcon icon={faSignOutAlt} className="mr-3 h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                  <span className="font-bold text-[11px] uppercase tracking-wider">Terminate Session</span>
                </DropdownMenuItem>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : (
        <div className="topbar-right flex items-center">
          <Button
            variant="ghost"
            onClick={handlePushNotificationRequest}
            className="h-8 w-8 rounded-full text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 transition-colors p-0 flex items-center justify-center mr-1"
            title="Enable Push Notifications"
            aria-label="Enable Push Notifications"
          >
            <FontAwesomeIcon icon={faBell} />
          </Button>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Main navigation">
            <a className="rounded-lg px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-600 transition-colors hover:bg-zinc-100" href="/#product">Product</a>
            <a className="rounded-lg px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-zinc-600 transition-colors hover:bg-zinc-100" href="/#landlord-plans">Plans</a>
          </nav>
          <a
            className="rounded-lg px-2 py-2 text-[10px] font-bold uppercase tracking-widest text-indigo-600 transition-colors hover:bg-indigo-50 sm:px-3"
            href="/#waitlist"
          >
            Waitlist
          </a>
          <Button 
            className="bg-zinc-900 text-white hover:bg-black px-5 h-9 rounded-lg font-bold uppercase tracking-widest text-[10px] shadow-sm hover:scale-105 active:scale-95 transition-all"
            onClick={onLoginClick}
          >
            Sign In
          </Button>
        </div>
      )}
    </header>
  );
}
