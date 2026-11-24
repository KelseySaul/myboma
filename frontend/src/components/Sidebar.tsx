import { UserProfile, UserRole } from '../App';
import { getSubscriptionFeatures } from '../../../shared/landlordSubscription';
import { authClient } from '../lib/auth-client';
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
import { useUnreadCount } from '../lib/queries';
import { clearQueryCache } from '../lib/queryClient';

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
        { id: 'properties', label: 'Properties', icon: faHome, category: 'workspace' },
      ];
      const operationsItems: NavItem[] = [
        { id: 'finances', label: 'Rent & payments', icon: faWallet, category: 'operations' },
        ...(features.maintenanceHub ? [{ id: 'maintenance', label: 'Maintenance', icon: faTools, category: 'operations' as const }] : []),
        { id: 'tenants', label: 'Tenants', icon: faUsers, category: 'operations' },
        { id: 'automations', label: 'Notifications', icon: faBell, category: 'operations' },
      ];
      return [
        { title: 'Manage', items: workspaceItems },
        { title: 'Day to day', items: operationsItems },
      ];
    }
    case 'hunter':
      return [
        {
          title: 'Browse',
          items: [
            dashboardItem,
            { id: 'all', label: 'All homes', icon: faHome, category: 'workspace' },
            { id: 'residential', label: 'Homes', icon: faBuilding, category: 'workspace' },
            { id: 'commercial', label: 'Commercial', icon: faBuilding, category: 'workspace' },
            { id: 'bnb', label: 'Short stays', icon: faHotel, category: 'workspace' },
          ],
        },
      ];
    case 'admin':
      return [
        {
          title: 'People and properties',
          items: [
            dashboardItem,
            { id: 'registered', label: 'Users', icon: faUsers, category: 'workspace' },
            { id: 'pending', label: 'Pending invites', icon: faLink, category: 'workspace' },
            { id: 'properties', label: 'Properties', icon: faBuilding, category: 'workspace' },
          ],
        },
        {
          title: 'Day to day',
          items: [
            { id: 'maintenance', label: 'Maintenance', icon: faTools, category: 'operations' },
            { id: 'finances', label: 'Rent & payments', icon: faWallet, category: 'operations' },
            { id: 'tenants', label: 'Tenants', icon: faUsers, category: 'operations' },
            { id: 'automations', label: 'Notifications', icon: faBell, category: 'operations' },
          ],
        },
        ...(isSuperAdmin
          ? [
              {
                title: 'Administration',
                items: [
                  { id: 'platforms', label: 'Platforms', icon: faGlobe, category: 'network' as const },
                  { id: 'audit', label: 'Activity log', icon: faClipboardList, category: 'network' as const },
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
            { id: 'finances', label: 'Rent & Payments', icon: faWallet, category: 'workspace' },
            { id: 'maintenance', label: 'Repairs', icon: faTools, category: 'workspace' },
            { id: 'notices', label: 'Notices', icon: faBell, category: 'workspace' },
          ],
        },
      ];
    default:
      return [{ title: 'Main', items: [dashboardItem] }];
  }
}

const NEUTRAL_BADGE = { text: 'text-zinc-700 dark:text-zinc-300', bg: 'bg-zinc-100 dark:bg-zinc-800', border: 'border-zinc-200 dark:border-zinc-700' };
const ROLE_BADGE_STYLES: Record<UserRole, { label: string; text: string; bg: string; border: string }> = {
  landlord: { label: 'Landlord', ...NEUTRAL_BADGE },
  hunter: { label: 'House hunter', ...NEUTRAL_BADGE },
  admin: { label: 'Admin', ...NEUTRAL_BADGE },
  tenant: { label: 'Tenant', ...NEUTRAL_BADGE },
};

export default function Sidebar({ profile, activeTab, setActiveTab, currentRole, isImpersonating }: SidebarProps) {
  const navSections = getRoleNavSections(currentRole, profile.isSuperAdmin, profile);
  const roleStyle = ROLE_BADGE_STYLES[currentRole] ?? ROLE_BADGE_STYLES.hunter;
  const topOffset = isImpersonating ? '100px' : '56px';
  // Shared query: Navbar and Sidebar read the same cached count (one request per poll).
  const { data: unreadCount = 0 } = useUnreadCount(profile?.email);

  const handleLogout = async () => {
    await authClient.signOut({});
    clearQueryCache();
    toast.success('Signed out');
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
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-all duration-150 group cursor-pointer ${
          isActive
            ? 'bg-zinc-950 text-white font-semibold dark:bg-white dark:text-zinc-950'
            : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 hover:text-zinc-950 dark:hover:text-zinc-100 font-medium'
        }`}
      >
        <div
          className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 transition-all ${
            isActive
              ? 'text-white dark:text-zinc-950'
              : 'text-zinc-400 group-hover:text-zinc-800 dark:group-hover:text-zinc-200'
          }`}
        >
          <FontAwesomeIcon icon={icon} className="h-3.5 w-3.5" />
        </div>

        <span className="text-sm flex-1 truncate">
          {label}
        </span>

        {hasUnread && (
          <span className="flex h-2 w-2 relative shrink-0 mr-0.5">
            
            <span className="relative inline-flex rounded-full h-2 w-2 bg-current" aria-label="Unread"></span>
          </span>
        )}


      </button>
    );
  };

  return (
    <aside
      className="hidden sm:flex flex-col w-64 h-full shrink-0 border-r border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-950 justify-between select-none overflow-hidden z-30"
    >
      {/* ── Brand ── */}
      <div className="flex h-14 items-center gap-2.5 border-b border-zinc-100 px-4 shrink-0 dark:border-zinc-800">
        <img src={tenantConfig.logoUrl} alt="" className="h-7 w-7 shrink-0 object-contain" width="28" height="28" />
        <span className="text-sm font-bold tracking-tight text-zinc-950 dark:text-white">{tenantConfig.appName}</span>
      </div>

      {/* ── Main Navigation Sections ─────────────────────────── */}
      <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
        {navSections.map((section, idx) => (
          <div key={idx} className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 px-3 py-1">
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
            title="Settings"
          >
            <FontAwesomeIcon icon={faCog} className="h-3 w-3" />
            <span>Settings</span>
          </button>

          <button
            onClick={handleLogout}
            className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-200 transition-all cursor-pointer"
            title="Sign out"
          >
            <FontAwesomeIcon icon={faSignOutAlt} className="h-3 w-3" />
            <span>Sign out</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
