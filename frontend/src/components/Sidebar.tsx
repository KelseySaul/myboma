import { useState } from 'react';
import type { UserProfile, UserRole } from '../App';
import { getSubscriptionFeatures } from '../../../shared/landlordSubscription';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBell,
  faBuilding,
  faChartPie,
  faChevronRight,
  faClipboardList,
  faGlobe,
  faHome,
  faHotel,
  faLink,
  faTools,
  faUsers,
  faWallet,
} from '@fortawesome/free-solid-svg-icons';
import { tenantConfig } from '../config/tenant';
import { useUnreadCount } from '../lib/queries';
import AccountMenu, { roleLabel } from './AccountMenu';

interface SidebarProps {
  profile: UserProfile;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  currentRole: UserRole;
  activeView?: UserRole | null;
  setActiveView?: (role: UserRole) => void;
  onHelpClick?: () => void;
  isImpersonating?: boolean;
}

interface NavItem {
  id: string;
  label: string;
  icon: any;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

function getRoleNavSections(role: UserRole, isSuperAdmin?: boolean, profile?: UserProfile): NavSection[] {
  const dashboardItem: NavItem = { id: 'dashboard', label: 'Overview', icon: faChartPie };

  switch (role) {
    case 'landlord': {
      const features = profile ? getSubscriptionFeatures(profile) : { maintenanceHub: true };
      return [
        { title: 'Manage', items: [dashboardItem, { id: 'properties', label: 'Properties', icon: faHome }] },
        {
          title: 'Day to day',
          items: [
            { id: 'finances', label: 'Rent & payments', icon: faWallet },
            ...(features.maintenanceHub ? [{ id: 'maintenance', label: 'Maintenance', icon: faTools }] : []),
            { id: 'tenants', label: 'Tenants', icon: faUsers },
            { id: 'automations', label: 'Notifications', icon: faBell },
          ],
        },
      ];
    }
    case 'hunter':
      return [
        {
          title: 'Browse',
          items: [
            dashboardItem,
            { id: 'all', label: 'All homes', icon: faHome },
            { id: 'residential', label: 'Homes', icon: faBuilding },
            { id: 'commercial', label: 'Commercial', icon: faBuilding },
            { id: 'bnb', label: 'Short stays', icon: faHotel },
          ],
        },
      ];
    case 'admin':
      return [
        {
          title: 'People and properties',
          items: [
            dashboardItem,
            { id: 'registered', label: 'Users', icon: faUsers },
            { id: 'pending', label: 'Pending invites', icon: faLink },
            { id: 'properties', label: 'Properties', icon: faBuilding },
          ],
        },
        {
          title: 'Day to day',
          items: [
            { id: 'maintenance', label: 'Maintenance', icon: faTools },
            { id: 'finances', label: 'Rent & payments', icon: faWallet },
            { id: 'tenants', label: 'Tenants', icon: faUsers },
            { id: 'automations', label: 'Notifications', icon: faBell },
          ],
        },
        ...(isSuperAdmin
          ? [
              {
                title: 'Administration',
                items: [
                  { id: 'platforms', label: 'Platforms', icon: faGlobe },
                  { id: 'audit', label: 'Activity log', icon: faClipboardList },
                ],
              },
            ]
          : []),
      ];
    case 'tenant':
      return [
        {
          title: 'My home',
          items: [
            dashboardItem,
            { id: 'finances', label: 'Rent & payments', icon: faWallet },
            { id: 'maintenance', label: 'Repairs', icon: faTools },
            { id: 'notices', label: 'Notices', icon: faBell },
          ],
        },
      ];
    default:
      return [{ title: 'Main', items: [dashboardItem] }];
  }
}

/** Desktop navigation: collapse it to an icon rail without losing any routes or account actions. */
export default function Sidebar({
  profile,
  activeTab,
  setActiveTab,
  currentRole,
  activeView,
  setActiveView,
  onHelpClick,
}: SidebarProps) {
  const [expanded, setExpanded] = useState(false);
  const collapsed = !expanded;
  const navSections = getRoleNavSections(currentRole, profile.isSuperAdmin, profile);
  const { data: unreadCount = 0 } = useUnreadCount(profile.email);

  const handleNavClick = (id: string) => {
    setActiveTab(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const NavButton = ({ id, label, icon }: NavItem) => {
    const isActive = (activeTab || 'dashboard') === id;
    const hasUnread = unreadCount > 0 && (id === 'automations' || id === 'notices');

    return (
      <button
        type="button"
        onClick={() => handleNavClick(id)}
        title={collapsed ? label : undefined}
        className={`group flex w-full items-center rounded-xl py-2 text-left transition-all duration-200 ${
          collapsed ? 'justify-center px-2' : 'gap-3 px-3'
        } ${
          isActive
            ? 'bg-gradient-to-r from-slate-900 to-emerald-700 font-semibold text-white shadow-sm'
            : 'font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100'
        }`}
      >
        <span
          className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
            isActive ? 'text-white' : 'text-zinc-400 group-hover:text-zinc-800 dark:group-hover:text-zinc-200'
          }`}
        >
          <FontAwesomeIcon icon={icon} className="h-3.5 w-3.5" />
          {hasUnread && collapsed && <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-current" />}
        </span>
        <span className={collapsed ? 'sr-only' : 'flex-1 truncate text-sm'}>{label}</span>
        {hasUnread && !collapsed && <span className="h-2 w-2 shrink-0 rounded-full bg-current" aria-label="Unread" />}
      </button>
    );
  };

  return (
    <aside
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      onFocus={() => setExpanded(true)}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setExpanded(false); }}
      className={`relative hidden h-full shrink-0 select-none flex-col justify-between overflow-hidden border-r border-zinc-200/80 bg-white dark:border-zinc-800 dark:bg-zinc-950 sm:flex ${
        collapsed ? 'w-[4.75rem]' : 'w-64'
      }`}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className={`flex h-14 items-center border-b border-zinc-100 dark:border-zinc-800 ${collapsed ? 'justify-center px-2' : 'gap-2.5 px-4'}`}>
          <img src={tenantConfig.logoUrl} alt="" className="h-7 w-7 shrink-0 object-contain" width="28" height="28" />
          {!collapsed && <span className="font-brand min-w-0 flex-1 truncate text-xl font-semibold leading-none tracking-tight text-zinc-950 dark:text-white">{tenantConfig.appName}</span>}
        </div>

        <nav className={`min-h-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto ${collapsed ? 'p-2 pt-4' : 'p-3'}`} aria-label="Main navigation">
          {navSections.map((section) => (
            <div key={section.title} className="space-y-1">
              <p className={collapsed ? 'sr-only' : 'whitespace-nowrap px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500'}>
                {section.title}
              </p>
              <div className="space-y-0.5">{section.items.map((item) => <NavButton key={item.id} {...item} />)}</div>
            </div>
          ))}
        </nav>
      </div>

      <div className={`shrink-0 border-t border-slate-100 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-900/50 ${collapsed ? 'p-2' : ''}`}>
        <AccountMenu
          profile={profile}
          activeView={activeView}
          setActiveView={setActiveView}
          setActiveTab={setActiveTab}
          onHelpClick={onHelpClick}
          unreadCount={unreadCount}
          side="right"
          align="end"
          trigger={
            <button
              type="button"
              title={collapsed ? 'Open account menu' : undefined}
              className={`flex w-full items-center rounded-xl text-left transition hover:bg-white dark:hover:bg-zinc-800 ${collapsed ? 'justify-center p-1' : 'gap-2.5 px-1 py-1.5'}`}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-900 text-xs font-bold text-white shadow-xs">
                {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" className="h-full w-full object-cover" /> : profile.displayName?.charAt(0).toUpperCase() || 'U'}
              </span>
              {!collapsed && (
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-bold text-slate-900 dark:text-white">{profile.displayName || 'User'}</span>
                  <span className="block truncate text-[10px] font-medium text-slate-500">{roleLabel(profile, activeView)}</span>
                </span>
              )}
              {!collapsed && <FontAwesomeIcon icon={faChevronRight} className="mr-1 h-3 w-3 text-slate-400" />}
            </button>
          }
        />
      </div>
    </aside>
  );
}
