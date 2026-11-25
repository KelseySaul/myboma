import { useState } from 'react';
import {
  BedDouble,
  Bell,
  Building2,
  ChevronRight,
  ClipboardList,
  Globe,
  Home,
  LayoutGrid,
  Mail,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  UserCheck,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { UserProfile, UserRole } from '../App';
import { getSubscriptionFeatures } from '../../../shared/landlordSubscription';
import { tenantConfig } from '../config/tenant';
import { useUnreadCount } from '../lib/queries';
import { resolveMediaUrl } from '../lib/fileUrl';
import AccountMenu, { roleLabel } from './AccountMenu';
import { openCommandPalette } from './CommandPalette';

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
  icon: LucideIcon;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

function getRoleNavSections(role: UserRole, isSuperAdmin?: boolean, profile?: UserProfile): NavSection[] {
  const dashboardItem: NavItem = { id: 'dashboard', label: 'Overview', icon: LayoutGrid };

  switch (role) {
    case 'landlord': {
      const features = profile ? getSubscriptionFeatures(profile) : { maintenanceHub: true };
      return [
        { title: 'Manage', items: [dashboardItem, { id: 'properties', label: 'Properties', icon: Home }] },
        {
          title: 'Day to day',
          items: [
            { id: 'finances', label: 'Rent & payments', icon: Wallet },
            ...(features.maintenanceHub ? [{ id: 'maintenance', label: 'Maintenance', icon: Wrench }] : []),
            { id: 'tenants', label: 'Tenants', icon: Users },
            { id: 'caretakers', label: 'Caretakers & reports', icon: UserCheck },
            { id: 'pending', label: 'Pending invites', icon: Mail },
            { id: 'automations', label: 'Notifications', icon: Bell },
          ],
        },
      ];
    }
    case 'caretaker':
      return [
        {
          title: 'Property operations',
          items: [
            dashboardItem,
            { id: 'repairs', label: 'Repairs & issues', icon: Wrench },
            { id: 'reports', label: 'Reports to landlord', icon: ClipboardList },
            { id: 'automations', label: 'Notifications', icon: Bell },
          ],
        },
      ];
    case 'hunter':
      return [
        {
          title: 'Browse',
          items: [
            dashboardItem,
            { id: 'all', label: 'All homes', icon: Home },
            { id: 'residential', label: 'Homes', icon: Building2 },
            { id: 'commercial', label: 'Commercial', icon: Building2 },
            { id: 'bnb', label: 'Short stays', icon: BedDouble },
          ],
        },
      ];
    case 'admin':
      return [
        {
          title: 'People & properties',
          items: [
            dashboardItem,
            { id: 'registered', label: 'Users', icon: Users },
            { id: 'pending', label: 'Pending invites', icon: Mail },
            { id: 'properties', label: 'Properties', icon: Building2 },
          ],
        },
        {
          title: 'Day to day',
          items: [
            { id: 'maintenance', label: 'Maintenance', icon: Wrench },
            { id: 'finances', label: 'Rent & payments', icon: Wallet },
            { id: 'tenants', label: 'Tenants', icon: UserCheck },
            { id: 'automations', label: 'Notifications', icon: Bell },
          ],
        },
        ...(isSuperAdmin
          ? [
              {
                title: 'Administration',
                items: [
                  { id: 'platforms', label: 'Platforms', icon: Globe },
                  { id: 'audit', label: 'Activity log', icon: ClipboardList },
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
            { id: 'finances', label: 'Rent & payments', icon: Wallet },
            { id: 'maintenance', label: 'Repairs', icon: Wrench },
            { id: 'notices', label: 'Notices', icon: Bell },
          ],
        },
      ];
    default:
      return [{ title: 'Main', items: [dashboardItem] }];
  }
}

const SIDEBAR_STORAGE_KEY = 'myboma_sidebar_collapsed';

/** Desktop Meta-style workspace rail: expanded by default, smoothly collapsible without layout jank. */
export default function Sidebar({
  profile,
  activeTab,
  setActiveTab,
  currentRole,
  activeView,
  setActiveView,
  onHelpClick,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? '1' : '0');
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  const navSections = getRoleNavSections(currentRole, profile.isSuperAdmin, profile);
  const { data: unreadCount = 0 } = useUnreadCount(profile.email);

  const handleNavClick = (id: string) => {
    setActiveTab(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const NavButton = ({ id, label, icon: Icon }: NavItem) => {
    const isActive = (activeTab || 'dashboard') === id;
    const hasUnread = unreadCount > 0 && (id === 'automations' || id === 'notices');

    return (
      <button
        type="button"
        onClick={() => handleNavClick(id)}
        title={collapsed ? label : undefined}
        className={`group relative flex w-full items-center rounded-lg py-2 text-left transition-colors duration-150 ${
          collapsed ? 'justify-center px-2' : 'gap-2.5 px-2.5'
        } ${
          isActive
            ? 'bg-violet-600/[0.09] font-semibold text-violet-800 dark:bg-violet-500/15 dark:text-violet-300'
            : 'font-medium text-[#5D5A73] hover:bg-violet-600/[0.05] hover:text-[#161426] dark:text-slate-400 dark:hover:bg-white/[0.05] dark:hover:text-slate-100'
        }`}
      >
        {isActive && !collapsed && (
          <span
            aria-hidden
            className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-gradient-to-b from-violet-600 via-purple-600 to-fuchsia-500 dark:from-violet-400 dark:to-fuchsia-400"
          />
        )}
        <span
          className={`relative flex h-6 w-6 shrink-0 items-center justify-center ${
            isActive
              ? 'text-violet-700 dark:text-violet-400'
              : 'text-[#6B6785] group-hover:text-[#161426] dark:text-slate-400 dark:group-hover:text-slate-200'
          }`}
        >
          <Icon className="h-[18px] w-[18px]" strokeWidth={isActive ? 2.2 : 1.75} />
          {hasUnread && collapsed && (
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-fuchsia-600 ring-2 ring-white dark:ring-[#181922]" />
          )}
        </span>
        <span className={collapsed ? 'sr-only' : 'flex-1 truncate text-[13.5px] leading-tight'}>{label}</span>
        {hasUnread && !collapsed && (
          <span
            className="flex h-5 min-w-5 items-center justify-center rounded-full bg-gradient-to-r from-violet-700 to-fuchsia-600 px-1.5 text-[10px] font-semibold tabular-nums text-white"
            aria-label={`${unreadCount} unread`}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
    );
  };

  return (
    <aside
      className={`relative hidden h-full shrink-0 select-none flex-col justify-between overflow-hidden border-r border-[#1C2B33]/[0.09] bg-white transition-[width] duration-200 ease-out dark:border-white/[0.08] dark:bg-[#1A1D21] sm:flex ${
        collapsed ? 'w-[68px]' : 'w-60'
      }`}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Brand Header + Collapse Toggle */}
        <div
          className={`flex h-14 shrink-0 items-center border-b border-[#1C2B33]/[0.07] dark:border-white/[0.07] ${
            collapsed ? 'justify-center px-2' : 'justify-between gap-2 px-3.5'
          }`}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <img src={tenantConfig.logoUrl} alt="" className="h-7 w-7 shrink-0 rounded-md object-contain" width="28" height="28" />
            {!collapsed && (
              <span className="font-brand min-w-0 truncate text-xl font-semibold leading-none tracking-tight text-[#1C2B33] dark:text-white">
                {tenantConfig.appName}
              </span>
            )}
          </div>
          {!collapsed && (
            <button
              type="button"
              onClick={toggleCollapsed}
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#8A94A6] transition-colors hover:bg-[#1C2B33]/[0.05] hover:text-[#1C2B33] dark:hover:bg-white/[0.06] dark:hover:text-white"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Quick Search Trigger (Cmd/Ctrl + K) */}
        <div className={collapsed ? 'px-2 pt-3' : 'px-3 pt-3'}>
          {collapsed ? (
            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                onClick={toggleCollapsed}
                title="Expand sidebar"
                aria-label="Expand sidebar"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-[#5F6C7B] transition-colors hover:bg-[#1C2B33]/[0.05] hover:text-[#1C2B33] dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-white"
              >
                <PanelLeftOpen className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </button>
              <button
                type="button"
                onClick={openCommandPalette}
                title="Quick search (Ctrl+K)"
                aria-label="Quick search"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#1C2B33]/[0.09] bg-[#F7F8FA] text-[#5F6C7B] transition-colors hover:border-[#1C2B33]/20 hover:text-[#1C2B33] dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-400 dark:hover:text-white"
              >
                <Search className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={openCommandPalette}
              className="flex h-9 w-full items-center gap-2 rounded-lg border border-[#1C2B33]/[0.09] bg-[#F7F8FA] px-2.5 text-xs text-[#5F6C7B] transition-colors hover:border-[#1C2B33]/20 hover:bg-[#F0F2F5] hover:text-[#1C2B33] dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-400 dark:hover:bg-white/[0.07] dark:hover:text-slate-200"
            >
              <Search className="h-3.5 w-3.5 shrink-0 text-[#8A94A6]" />
              <span className="flex-1 truncate text-left">Quick search…</span>
              <kbd className="rounded border border-[#1C2B33]/10 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[#8A94A6] dark:border-white/10 dark:bg-[#16191D]">
                ⌘K
              </kbd>
            </button>
          )}
        </div>

        {/* Navigation Sections */}
        <nav
          className={`min-h-0 flex-1 space-y-5 overflow-x-hidden overflow-y-auto ${collapsed ? 'p-2 pt-3' : 'px-3 py-4'}`}
          aria-label="Main navigation"
        >
          {navSections.map((section) => (
            <div key={section.title} className="space-y-1">
              <p
                className={
                  collapsed
                    ? 'sr-only'
                    : 'whitespace-nowrap px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-[#8A94A6] dark:text-slate-500'
                }
              >
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
      </div>

      {/* Account Footer */}
      <div
        className={`shrink-0 border-t border-[#1C2B33]/[0.08] bg-[#F7F8FA]/70 dark:border-white/[0.08] dark:bg-[#16191D]/80 ${
          collapsed ? 'p-2' : 'p-2.5'
        }`}
      >
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
              className={`flex w-full items-center rounded-lg text-left transition-colors hover:bg-[#1C2B33]/[0.05] dark:hover:bg-white/[0.06] ${
                collapsed ? 'justify-center p-1' : 'gap-2.5 px-2 py-1.5'
              }`}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-violet-700 via-purple-600 to-fuchsia-600 text-xs font-semibold text-white shadow-2xs">
                {profile.avatarUrl ? (
                  <img src={resolveMediaUrl(profile.avatarUrl)} alt="" className="h-full w-full object-cover" />
                ) : (
                  profile.displayName?.charAt(0).toUpperCase() || 'U'
                )}
              </span>
              {!collapsed && (
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-[#1C2B33] dark:text-white">
                    {profile.displayName || 'User'}
                  </span>
                  <span className="block truncate text-[11px] font-medium text-[#5F6C7B] dark:text-slate-400">
                    {roleLabel(profile, activeView)}
                  </span>
                </span>
              )}
              {!collapsed && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#8A94A6]" />}
            </button>
          }
        />
      </div>
    </aside>
  );
}
