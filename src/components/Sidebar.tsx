import { useState, useEffect } from 'react';
import { UserProfile, UserRole } from '../App';
import { getSubscriptionFeatures } from '../lib/landlordSubscription';
import { supabase } from '../supabase';
import { toast } from 'sonner';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faHome,
  faTools,
  faWallet,
  faUsers,
  faBolt,
  faBuilding,
  faHotel,
  faShieldAlt,
  faLink,
  faGlobe,
  faClipboardList,
  faBell,
  faSignOutAlt,
  faChevronRight,
  faCog,
  faChartPie,
} from '@fortawesome/free-solid-svg-icons';

interface SidebarProps {
  profile: UserProfile;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentRole: UserRole;
  isImpersonating?: boolean;
}

interface NavItem {
  id: string;
  label: string;
  icon: any;
  color?: string;
}

function getRoleNavItems(role: UserRole, isSuperAdmin?: boolean, profile?: UserProfile): NavItem[] {
  const dashboard: NavItem = { id: 'dashboard', label: 'Dashboard', icon: faChartPie, color: 'text-zinc-500' };
  switch (role) {
    case 'landlord': {
      const items: NavItem[] = [
        dashboard,
        { id: 'properties',  label: 'Assets',    icon: faHome,          color: 'text-blue-500' },
        { id: 'maintenance', label: 'Maintenance',   icon: faTools,         color: 'text-amber-500' },
        { id: 'finances',    label: 'Finances',      icon: faWallet,        color: 'text-emerald-500' },
        { id: 'tenants',     label: 'Tenants',       icon: faUsers,         color: 'text-purple-500' },
        { id: 'automations', label: 'Notifications', icon: faBell,          color: 'text-rose-500' },
      ];
      const features = profile ? getSubscriptionFeatures(profile) : { maintenanceHub: true };
      return features.maintenanceHub ? items : items.filter((item) => item.id !== 'maintenance');
    }
    case 'hunter':
      return [
        dashboard,
        { id: 'all',         label: 'All Spaces',   icon: faHome,          color: 'text-blue-500' },
        { id: 'residential', label: 'Residential',   icon: faBuilding,      color: 'text-emerald-500' },
        { id: 'commercial',  label: 'Commercial',    icon: faBuilding,      color: 'text-amber-500' },
        { id: 'bnb',         label: 'BNB / Luxury',  icon: faHotel,         color: 'text-purple-500' },
      ];
    case 'admin':
      return [
        dashboard,
        { id: 'registered',  label: 'Users',         icon: faUsers,         color: 'text-blue-500' },
        { id: 'pending',     label: 'Pending',        icon: faLink,          color: 'text-amber-500' },
        { id: 'properties',  label: 'Assets',      icon: faBuilding,      color: 'text-emerald-500' },
        { id: 'maintenance', label: 'Maintenance',   icon: faTools,         color: 'text-amber-500' },
        { id: 'finances',    label: 'Finances',      icon: faWallet,        color: 'text-emerald-500' },
        { id: 'tenants',     label: 'Tenants',       icon: faUsers,         color: 'text-purple-500' },
        { id: 'automations', label: 'Notifications', icon: faBell,          color: 'text-rose-500' },
        ...(isSuperAdmin ? [
          { id: 'platforms', label: 'Network',        icon: faGlobe,         color: 'text-indigo-500' },
          { id: 'audit',     label: 'Audit Log',      icon: faClipboardList, color: 'text-rose-500' },
        ] : []),
      ];
    case 'tenant':
      return [
        { id: 'dashboard',   label: 'Dashboard',      icon: faChartPie,      color: 'text-emerald-500' },
        { id: 'finances',    label: 'Finances',       icon: faWallet,        color: 'text-emerald-500' },
        { id: 'maintenance', label: 'Maintenance',    icon: faTools,         color: 'text-amber-500' },
        { id: 'notices',     label: 'Notices',        icon: faBell,          color: 'text-purple-500' },
      ];
    default:
      return [dashboard];
  }
}

const ROLE_META: Record<UserRole, { label: string; color: string; bg: string }> = {
  landlord: { label: 'Landlord',  color: 'text-blue-600',    bg: 'bg-blue-50' },
  hunter:   { label: 'Hunter',    color: 'text-purple-600',  bg: 'bg-purple-50' },
  admin:    { label: 'Admin',     color: 'text-rose-600',    bg: 'bg-rose-50' },
  tenant:   { label: 'Tenant',    color: 'text-emerald-600', bg: 'bg-emerald-50' },
};

export default function Sidebar({ profile, activeTab, setActiveTab, currentRole, isImpersonating }: SidebarProps) {
  const navItems = getRoleNavItems(currentRole, profile.isSuperAdmin, profile);
  const roleMeta = ROLE_META[currentRole] ?? ROLE_META.hunter;
  const topOffset = isImpersonating ? '100px' : '56px';
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!profile?.email) return;

    let isActive = true;
    const email = profile.email.toLowerCase();

    const fetchUnread = async () => {
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('recipientEmail', email)
        .eq('read', false);

      if (!error && isActive) {
        setUnreadCount(count || 0);
      }
    };

    const channelToken = `${profile.uid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const notifSub = supabase
      .channel(`sidebar-notifs-${channelToken}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `recipientEmail=eq.${email}` }, fetchUnread)
      .subscribe();

    void fetchUnread();

    return () => {
      isActive = false;
      void supabase.removeChannel(notifSub);
    };
  }, [profile?.email, profile?.uid]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success('Signed out');
  };

  const handleNavClick = (id: string) => {
    setActiveTab(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const NavButton = ({ id, label, icon, color }: NavItem) => {
    const isActive = (activeTab || 'dashboard') === id;
    return (
      <button
        key={id}
        onClick={() => handleNavClick(id)}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150 group ${
          isActive
            ? 'bg-zinc-950 text-white shadow-sm'
            : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900'
        }`}
      >
        <div className={`h-6 w-6 rounded-lg flex items-center justify-center shrink-0 transition-all ${
          isActive ? 'bg-white/15' : 'bg-zinc-100 group-hover:bg-zinc-200'
        }`}>
          <FontAwesomeIcon
            icon={icon}
            className={`h-3 w-3 ${isActive ? 'text-white' : color || 'text-zinc-400'}`}
          />
        </div>
        <span className={`text-[11px] font-black uppercase tracking-wide flex-1 ${
          isActive ? 'text-white' : 'text-zinc-600 group-hover:text-zinc-900'
        }`}>
          {label}
        </span>
        {unreadCount > 0 && (id === 'automations' || id === 'notices') && (
          <span className="h-2 w-2 rounded-full bg-purple-600 animate-pulse shrink-0 mr-1 shadow-[0_0_8px_#9333ea]" />
        )}
        {isActive && (
          <FontAwesomeIcon icon={faChevronRight} className="h-2 w-2 text-white/50" />
        )}
      </button>
    );
  };

  return (
    <aside
      className="hidden sm:flex flex-col w-[220px] shrink-0 border-r border-zinc-100 bg-white sticky overflow-y-auto"
      style={{ 
        top: topOffset,
        height: `calc(100vh - ${topOffset})`
      }}
    >
      {/* ── User card ──────────────────────────────────────── */}
      <div className="p-4 border-b border-zinc-50">
        <div className="flex items-center gap-3">
          <div className="relative shrink-0">
            <div className="h-9 w-9 rounded-xl overflow-hidden bg-gradient-to-br from-zinc-800 to-zinc-600 flex items-center justify-center text-white text-sm font-black shadow">
              {profile.avatarUrl ? (
                <img src={profile.avatarUrl} alt="avatar" className="h-full w-full object-cover" />
              ) : (
                profile.displayName?.charAt(0).toUpperCase() || 'U'
              )}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 border-2 border-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-black text-zinc-900 truncate">{profile.displayName || 'User'}</p>
            <p className="text-[9px] font-bold text-zinc-400 truncate">{profile.email}</p>
          </div>
        </div>
        <div className={`mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${roleMeta.bg} ${roleMeta.color}`}>
          <FontAwesomeIcon icon={faShieldAlt} className="h-2.5 w-2.5" />
          {profile.isSuperAdmin ? 'Super Admin' : roleMeta.label}
        </div>
      </div>

      {/* ── Main navigation ────────────────────────────────── */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        <p className="text-[8px] font-black uppercase tracking-[0.2em] text-zinc-300 px-3 py-2">
          Navigation
        </p>
        {navItems.map(item => (
          <NavButton key={item.id} {...item} />
        ))}
      </nav>

      {/* ── Bottom section: Settings + Sign out ────────────── */}
      <div className="p-3 border-t border-zinc-50 space-y-0.5">
        <p className="text-[8px] font-black uppercase tracking-[0.2em] text-zinc-300 px-3 py-1.5">
          Account
        </p>

        {/* Settings */}
        <button
          onClick={() => handleNavClick('settings')}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150 group ${
            activeTab === 'settings'
              ? 'bg-zinc-950 text-white shadow-sm'
              : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900'
          }`}
        >
          <div className={`h-6 w-6 rounded-lg flex items-center justify-center shrink-0 transition-all ${
            activeTab === 'settings' ? 'bg-white/15' : 'bg-zinc-100 group-hover:bg-zinc-200'
          }`}>
            <FontAwesomeIcon
              icon={faCog}
              className={`h-3 w-3 ${activeTab === 'settings' ? 'text-white' : 'text-zinc-400 group-hover:text-zinc-600'}`}
            />
          </div>
          <span className={`text-[11px] font-black uppercase tracking-wide flex-1 ${
            activeTab === 'settings' ? 'text-white' : 'text-zinc-600 group-hover:text-zinc-900'
          }`}>
            Settings
          </span>
          {activeTab === 'settings' && (
            <FontAwesomeIcon icon={faChevronRight} className="h-2 w-2 text-white/50" />
          )}
        </button>

        {/* Sign out */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-all group"
        >
          <div className="h-6 w-6 rounded-lg bg-zinc-100 group-hover:bg-rose-100 flex items-center justify-center shrink-0 transition-all">
            <FontAwesomeIcon icon={faSignOutAlt} className="h-3 w-3 group-hover:text-rose-600" />
          </div>
          <span className="text-[11px] font-black uppercase tracking-wide">Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
