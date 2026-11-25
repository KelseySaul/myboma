import type { ReactElement } from 'react';
import { Bell, Building2, Compass, LogOut, Search, Settings, ShieldCheck, Users, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { UserProfile, UserRole } from '../App';
import { authClient } from '../lib/auth-client';
import { clearQueryCache } from '../lib/queryClient';

const VIEW_AS: { role: UserRole; label: string; icon: typeof Users }[] = [
  { role: 'admin', label: 'Admin', icon: ShieldCheck },
  { role: 'landlord', label: 'Landlord', icon: Building2 },
  { role: 'caretaker', label: 'Caretaker', icon: Wrench },
  { role: 'tenant', label: 'Tenant', icon: Users },
  { role: 'hunter', label: 'House hunter', icon: Search },
];

export const roleLabel = (profile: UserProfile | null, activeView?: UserRole | null) => {
  if (profile?.isSuperAdmin) return 'Super admin';
  const role = activeView || profile?.role || 'hunter';
  if (role === 'admin' && !profile?.isAdmin && !profile?.isSuperAdmin) return 'Property manager';
  return VIEW_AS.find((item) => item.role === role)?.label ?? 'House hunter';
};

export const signOut = async () => {
  await authClient.signOut({});
  clearQueryCache();
  toast.success('Signed out');
};

interface AccountMenuProps {
  profile: UserProfile | null;
  activeView?: UserRole | null;
  setActiveView?: (role: UserRole) => void;
  setActiveTab?: (tab: string) => void;
  onHelpClick?: () => void;
  unreadCount?: number;
  /** The element that opens the menu. */
  trigger: ReactElement;
  side?: 'top' | 'bottom' | 'right';
  align?: 'start' | 'end';
}

const itemClass =
  'flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800';

/** The signed-in account menu: who you are, "View as" for admins, settings, tour and sign out. */
export default function AccountMenu({
  profile,
  activeView,
  setActiveView,
  setActiveTab,
  onHelpClick,
  unreadCount = 0,
  trigger,
  side = 'bottom',
  align = 'end',
}: AccountMenuProps) {
  const currentRole = activeView || profile?.role || 'hunter';
  const notificationsTab = currentRole === 'tenant' ? 'notices' : 'automations';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent
        side={side}
        align={align}
        className="w-64 rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-3 py-2.5 font-normal">
            <p className="truncate text-sm font-semibold text-zinc-950 dark:text-white">{profile?.displayName || 'Your account'}</p>
            <p className="truncate text-xs text-zinc-500">{profile?.email}</p>
            <p className="mt-1.5 text-xs text-zinc-500">{roleLabel(profile, activeView)}</p>
          </DropdownMenuLabel>
        </DropdownMenuGroup>

        {profile?.isAdmin && setActiveView && (
          <>
            <DropdownMenuSeparator className="my-1 bg-zinc-100 dark:bg-zinc-800" />
            <DropdownMenuGroup>
              <DropdownMenuLabel className="px-3 pb-1 pt-1.5 text-xs font-medium text-zinc-400">View as</DropdownMenuLabel>
              {VIEW_AS.map(({ role, label, icon: Icon }) => (
                <DropdownMenuItem
                  key={role}
                  onClick={() => {
                    setActiveView(role);
                    toast.success(`Now viewing as ${label.toLowerCase()}`);
                  }}
                  className={`${itemClass} ${currentRole === role ? 'font-semibold text-zinc-950 dark:text-white' : ''}`}
                >
                  <Icon className="h-4 w-4 text-zinc-400" />
                  <span className="flex-1">{label}</span>
                  {currentRole === role && <span className="h-1.5 w-1.5 rounded-full bg-zinc-950 dark:bg-white" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </>
        )}

        <DropdownMenuSeparator className="my-1 bg-zinc-100 dark:bg-zinc-800" />
        <DropdownMenuGroup>
          {setActiveTab && currentRole !== 'hunter' && (
            <DropdownMenuItem onClick={() => setActiveTab(notificationsTab)} className={itemClass}>
              <Bell className="h-4 w-4 text-zinc-400" />
              <span className="flex-1">Notifications</span>
              {unreadCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-zinc-950 px-1.5 text-[11px] font-semibold text-white dark:bg-white dark:text-zinc-950">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </DropdownMenuItem>
          )}
          {setActiveTab && (
            <DropdownMenuItem onClick={() => setActiveTab('settings')} className={itemClass}>
              <Settings className="h-4 w-4 text-zinc-400" />
              Settings
            </DropdownMenuItem>
          )}
          {onHelpClick && (
            <DropdownMenuItem onClick={onHelpClick} className={itemClass}>
              <Compass className="h-4 w-4 text-zinc-400" />
              Show me around
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>

        <DropdownMenuSeparator className="my-1 bg-zinc-100 dark:bg-zinc-800" />
        <DropdownMenuItem onClick={signOut} className={itemClass}>
          <LogOut className="h-4 w-4 text-zinc-400" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
