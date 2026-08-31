import { useState, useEffect } from 'react';
import { UserProfile, UserRole } from '../App';
import { getSubscriptionFeatures } from '../lib/landlordSubscription';
import { authClient } from '../lib/auth-client';
import { getUnreadNotificationCount } from '../lib/api';
import { toast } from 'sonner';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faHome,
  faTools,
  faWallet,
  faUsers,
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
import { tenantConfig } from '../config/tenant';

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
  category?: 'workspace' | 'operations' | 'network' | 'system' | string;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

function getRoleNavSections(role: UserRole, isSuperAdmin?: boolean, profile?: UserProfile): NavSection[] {
  const dashboardItem: NavItem = { id: 'dashboard', label: 'Overview', icon: faChartPie, category: 'workspace' };

  switch (role) {
    case 'landlord': {
      const features = profile ? getSubscriptionFeatures(profile) : { maintenanceHub: true };
      const workspaceItems: NavItem[] = [
        dashboardItem,
        { id: 'properties', label: 'Assets & Units', icon: faHome, category: 'workspace' },
      ];
      const operationsItems: NavItem[] = [
        { id: 'finances', label: 'Finances & Rent', icon: faWallet, category: 'operations' },
        ...(features.maintenanceHub ? [{ id: 'maintenance', label: 'Maintenance', icon: faTools, category: 'operations' as const }] : []),
        { id: 'tenants', label: 'Tenants Directory', icon: faUsers, category: 'operations' },
        { id: 'automations', label: 'Notifications', icon: faBell, category: 'operations' },
      ];
      return [
        { title: 'Core Workspace', items: workspaceItems },
        { title: 'Operations', items: operationsItems },
      ];
    }
    case 'hunter':
      return [
        {
          title: 'Explorer',
          items: [
            dashboardItem,
            { id: 'all', label: 'All Spaces', icon: faHome, category: 'workspace' },
            { id: 'residential', label: 'Residential', icon: faBuilding, category: 'workspace' },
            { id: 'commercial', label: 'Commercial', icon: faBuilding, category: 'workspace' },
            { id: 'bnb', label: 'BNB / Luxury', icon: faHotel, category: 'workspace' },
          ],
        },
      ];
    case 'admin':
      return [
        {
          title: 'Management',
          items: [
            dashboardItem,
            { id: 'registered', label: 'User Registry', icon: faUsers, category: 'workspace' },
            { id: 'pending', label: 'Pending Users', icon: faLink, category: 'workspace' },
            { id: 'properties', label: 'Asset Portfolio', icon: faBuilding, category: 'workspace' },
          ],
        },
        {
          title: 'Property Operations',
          items: [
            { id: 'maintenance', label: 'Maintenance', icon: faTools, category: 'operations' },
            { id: 'finances', label: 'Finances', icon: faWallet, category: 'operations' },
            { id: 'tenants', label: 'Tenants', icon: faUsers, category: 'operations' },
            { id: 'automations', label: 'Notifications', icon: faBell, category: 'operations' },
          ],
        },
        ...(isSuperAdmin
          ? [
              {
                title: 'Multi-Tenant Governance',
                items: [
                  { id: 'platforms', label: 'Network Platforms', icon: faGlobe, category: 'network' as const },
                  { id: 'audit', label: 'Audit Trail', icon: faClipboardList, category: 'network' as const },
                ],
              },
            ]
          : []),
      ];
    case 'tenant':
      return [
        {
          title: 'Tenant Space',
          items: [
            dashboardItem,
            { id: 'finances', label: 'Rent & Payments', icon: faWallet, category: 'workspace' },
            { id: 'maintenance', label: 'Maintenance Requests', icon: faTools, category: 'workspace' },
            { id: 'notices', label: 'Notices & Reminders', icon: faBell, category: 'workspace' },
          ],
        },
      ];
    default:
      return [{ title: 'Main', items: [dashboardItem] }];
  }
}

const ROLE_BADGE_STYLES: Record<UserRole, { label: string; text: string; bg: string; border: string }> = {
  landlord: { label: 'Landlord', text: 'text-blue-700 dark:text-blue-300', bg: 'bg-blue-50 dark:bg-blue-950/40', border: 'border-blue-200/80 dark:border-blue-800/60' },
  hunter:   { label: 'Hunter',   text: 'text-purple-700 dark:text-purple-300', bg: 'bg-purple-50 dark:bg-purple-950/40', border: 'border-purple-200/80 dark:border-purple-800/60' },
  admin:    { label: 'Admin',    text: 'text-rose-700 dark:text-rose-300', bg: 'bg-rose-50 dark:bg-rose-950/40', border: 'border-rose-200/80 dark:border-rose-800/60' },
  tenant:   { label: 'Tenant',   text: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-50 dark:bg-emerald-950/40', border: 'border-emerald-200/80 dark:border-emerald-800/60' },
};

export default function Sidebar({ profile, activeTab, setActiveTab, currentRole, isImpersonating }: SidebarProps) {
  const navSections = getRoleNavSections(currentRole, profile.isSuperAdmin, profile);
  const roleStyle = ROLE_BADGE_STYLES[currentRole] ?? ROLE_BADGE_STYLES.hunter;
  const topOffset = isImpersonating ? '100px' : '56px';
  const [unreadCount, setUnreadCount] = useState(0);

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
    toast.success('Signed out successfully');
  };

  const handleNavClick = (id: string) => {
    setActiveTab(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const NavButton = ({ id, label, icon }: NavItem) => {
    const isActive = (activeTab || 'dashboard') === id;
    const hasUnread = unreadCount > 0 && (id === 'automations' || id === 'notices');

    return (
      <button
        key={id}
        onClick={() => handleNavClick(id)}
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-2xl text-left transition-all duration-150 group cursor-pointer ${
          isActive
            ? 'bg-rose-50 text-rose-600 font-bold shadow-2xs dark:bg-rose-950/30 dark:text-rose-400'
            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100 font-medium'
        }`}
      >
        <div
          className={`h-7.5 w-7.5 rounded-xl flex items-center justify-center shrink-0 transition-all ${
            isActive
              ? 'bg-rose-500 text-white shadow-xs'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-400 group-hover:text-slate-800 dark:group-hover:text-slate-200'
          }`}
        >
          <FontAwesomeIcon icon={icon} className="h-3.5 w-3.5" />
        </div>

        <span className="text-xs tracking-tight flex-1 truncate">
          {label}
        </span>

        {hasUnread && (
          <span className="flex h-2 w-2 relative shrink-0 mr-0.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
          </span>
        )}

        {isActive && (
          <FontAwesomeIcon
            icon={faChevronRight}
            className="h-2.5 w-2.5 text-rose-400 dark:text-rose-300"
          />
        )}
      </button>
    );
  };

  return (
    <aside
      className="hidden sm:flex flex-col w-64 h-full shrink-0 border-r border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 justify-between select-none overflow-hidden z-30"
    >
      {/* ── Brand / Status Header ──────────────────────────── */}
      <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <img
            src={tenantConfig.logoUrl}
            alt={tenantConfig.appName}
            className="h-7 w-7 object-contain rounded-lg border border-slate-200/60 dark:border-slate-700 bg-white p-0.5 shrink-0"
          />
          <div className="min-w-0">
            <div className="text-xs font-bold text-slate-900 dark:text-white tracking-tight truncate">
              {tenantConfig.appName} OS
            </div>
            <div className="text-[10px] text-slate-400 font-medium tracking-wide truncate">
              Command Node
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0" title="System Status: Connected">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
        </div>
      </div>

      {/* ── Main Navigation Sections ─────────────────────────── */}
      <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
        {navSections.map((section, idx) => (
          <div key={idx} className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-3 py-1">
              {section.title}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavButton key={item.id} {...item} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* ── Bottom Section: Profile + Settings + Sign Out ───── */}
      <div className="mt-auto shrink-0 p-3 border-t border-slate-100 dark:border-slate-800 space-y-2 bg-slate-50/50 dark:bg-slate-900/50">
        <div className="flex items-center gap-2.5 px-1 py-1">
          <div className="relative shrink-0">
            <div className="h-8 w-8 rounded-lg overflow-hidden bg-slate-900 text-white flex items-center justify-center text-xs font-bold shadow-xs">
              {profile.avatarUrl ? (
                <img src={profile.avatarUrl} alt="avatar" className="h-full w-full object-cover" />
              ) : (
                profile.displayName?.charAt(0).toUpperCase() || 'U'
              )}
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
              {profile.displayName || 'User'}
            </p>
            <div className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded border text-[9px] font-semibold uppercase tracking-wider mt-0.5 ${roleStyle.bg} ${roleStyle.text} ${roleStyle.border}`}>
              <FontAwesomeIcon icon={faShieldAlt} className="h-2 w-2" />
              {profile.isSuperAdmin ? 'Super Admin' : roleStyle.label}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5 pt-1">
          <button
            onClick={() => handleNavClick('settings')}
            className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
              activeTab === 'settings'
                ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200/80 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
            }`}
            title="System Settings"
          >
            <FontAwesomeIcon icon={faCog} className="h-3 w-3" />
            <span>Settings</span>
          </button>

          <button
            onClick={handleLogout}
            className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold border border-rose-200/60 bg-rose-50/50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/20 dark:border-rose-800/40 dark:text-rose-400 transition-all cursor-pointer"
            title="Sign out of MYBOMA"
          >
            <FontAwesomeIcon icon={faSignOutAlt} className="h-3 w-3" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
