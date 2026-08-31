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
        className={`w-full relative flex items-center gap-3.5 px-4 py-2.5 rounded-xl text-left transition-all duration-150 group cursor-pointer ${
          isActive
            ? 'text-[#00c569] font-bold bg-[#00c569]/5 dark:bg-[#00c569]/10'
            : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100 font-medium'
        }`}
      >
        {isActive && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-6 rounded-r-full bg-[#00c569]" />
        )}

        <FontAwesomeIcon 
          icon={icon} 
          className={`h-4 w-4 shrink-0 transition-colors ${
            isActive ? 'text-[#00c569]' : 'text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200'
          }`} 
        />

        <span className="text-xs tracking-tight flex-1 truncate">
          {label}
        </span>

        {hasUnread && (
          <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-[#00c569] text-white text-[10px] font-bold flex items-center justify-center shadow-xs">
            {unreadCount}
          </span>
        )}
      </button>
    );
  };

  return (
    <aside
      className="hidden sm:flex flex-col w-60 h-full shrink-0 border-r border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 justify-between select-none overflow-hidden z-30"
    >
      {/* ── Brand / Header ──────────────────────────── */}
      <div className="p-5 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-8 w-8 rounded-xl bg-[#00c569]/10 flex items-center justify-center text-[#00c569] font-black text-sm shrink-0">
            <FontAwesomeIcon icon={faHome} className="h-4 w-4" />
          </div>
          <div className="text-lg font-black text-slate-900 dark:text-white tracking-tight flex items-center">
            myboma<span className="text-[#00c569] text-xl leading-none">.</span>
          </div>
        </div>
      </div>

      {/* ── Main Navigation Sections ─────────────────────────── */}
      <nav className="flex-1 px-3 py-2 space-y-4 overflow-y-auto">
        {navSections.map((section, idx) => (
          <div key={idx} className="space-y-1">
            {section.title && (
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-4 py-1">
                {section.title}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavButton key={item.id} {...item} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* ── Bottom Section: Support & Sign Out (Eduka Style) ───── */}
      <div className="mt-auto shrink-0 p-3 border-t border-slate-100 dark:border-slate-800 space-y-1">
        <button
          onClick={() => handleNavClick('settings')}
          className={`w-full flex items-center gap-3.5 px-4 py-2 rounded-xl text-left text-xs font-medium transition-all cursor-pointer ${
            activeTab === 'settings'
              ? 'text-[#00c569] font-bold bg-[#00c569]/5'
              : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          <FontAwesomeIcon icon={faCog} className="h-3.5 w-3.5 text-slate-400" />
          <span>Settings</span>
        </button>

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3.5 px-4 py-2 rounded-xl text-left text-xs font-medium text-slate-500 hover:text-rose-600 hover:bg-rose-50/60 dark:hover:bg-rose-950/20 transition-all cursor-pointer"
        >
          <FontAwesomeIcon icon={faSignOutAlt} className="h-3.5 w-3.5 text-slate-400 hover:text-rose-500" />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
}
