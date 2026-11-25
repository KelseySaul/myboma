import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BedDouble,
  Bell,
  Building2,
  ClipboardList,
  Globe,
  HelpCircle,
  Home,
  LayoutGrid,
  Mail,
  Moon,
  Search,
  Settings,
  Sun,
  UserCheck,
  Users,
  Wallet,
  Wrench,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import type { UserProfile, UserRole } from '../App';

interface CommandItem {
  id: string;
  label: string;
  section: string;
  keywords?: string;
  icon: typeof LayoutGrid;
  action: () => void;
}

interface CommandPaletteProps {
  profile: UserProfile;
  currentRole: UserRole;
  onNavigate: (tab: string) => void;
  onHelpClick?: () => void;
}

export const OPEN_COMMAND_PALETTE_EVENT = 'myboma:open-command-palette';

export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT));
}

export default function CommandPalette({ profile, currentRole, onNavigate, onHelpClick }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      } else if (e.key === 'Escape' && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    const onOpenEvent = () => setOpen(true);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpenEvent);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const items = useMemo<CommandItem[]>(() => {
    const go = (tab: string) => () => {
      onNavigate(tab);
      setOpen(false);
    };

    const nav: CommandItem[] = [{ id: 'dashboard', label: 'Overview', section: 'Navigation', keywords: 'home summary kpi dashboard', icon: LayoutGrid, action: go('dashboard') }];

    if (currentRole === 'admin') {
      nav.push(
        { id: 'registered', label: 'Users', section: 'Navigation', keywords: 'accounts landlords tenants members', icon: Users, action: go('registered') },
        { id: 'pending', label: 'Pending invites', section: 'Navigation', keywords: 'invitations email onboarding', icon: Mail, action: go('pending') },
        { id: 'properties', label: 'Properties & Buildings', section: 'Navigation', keywords: 'units houses listings assets', icon: Building2, action: go('properties') },
        { id: 'maintenance', label: 'Maintenance', section: 'Navigation', keywords: 'repairs tickets issues', icon: Wrench, action: go('maintenance') },
        { id: 'finances', label: 'Rent & payments', section: 'Navigation', keywords: 'invoices mpesa stripe money billing', icon: Wallet, action: go('finances') },
        { id: 'tenants', label: 'Tenants', section: 'Navigation', keywords: 'renters occupants leases', icon: UserCheck, action: go('tenants') },
        { id: 'automations', label: 'Notifications', section: 'Navigation', keywords: 'alerts reminders messages', icon: Bell, action: go('automations') },
      );
      if (profile.isSuperAdmin) {
        nav.push(
          { id: 'platforms', label: 'Platforms', section: 'Administration', keywords: 'agencies workspaces tenants white label', icon: Globe, action: go('platforms') },
          { id: 'audit', label: 'Activity log', section: 'Administration', keywords: 'audit history security events', icon: ClipboardList, action: go('audit') },
        );
      }
    } else if (currentRole === 'landlord') {
      nav.push(
        { id: 'properties', label: 'Properties', section: 'Navigation', keywords: 'units houses buildings listings', icon: Home, action: go('properties') },
        { id: 'finances', label: 'Rent & payments', section: 'Navigation', keywords: 'invoices mpesa money billing', icon: Wallet, action: go('finances') },
        { id: 'maintenance', label: 'Maintenance', section: 'Navigation', keywords: 'repairs issues', icon: Wrench, action: go('maintenance') },
        { id: 'tenants', label: 'Tenants', section: 'Navigation', keywords: 'renters leases', icon: Users, action: go('tenants') },
        { id: 'automations', label: 'Notifications', section: 'Navigation', keywords: 'alerts reminders', icon: Bell, action: go('automations') },
      );
    } else if (currentRole === 'tenant') {
      nav.push(
        { id: 'finances', label: 'Rent & payments', section: 'Navigation', keywords: 'pay rent invoice receipt', icon: Wallet, action: go('finances') },
        { id: 'maintenance', label: 'Repairs', section: 'Navigation', keywords: 'maintenance ticket fix', icon: Wrench, action: go('maintenance') },
        { id: 'notices', label: 'Notices', section: 'Navigation', keywords: 'notifications messages', icon: Bell, action: go('notices') },
      );
    } else if (currentRole === 'hunter') {
      nav.push(
        { id: 'all', label: 'All homes', section: 'Browse', icon: Home, action: go('all') },
        { id: 'residential', label: 'Residential homes', section: 'Browse', icon: Building2, action: go('residential') },
        { id: 'commercial', label: 'Commercial spaces', section: 'Browse', icon: Building2, action: go('commercial') },
        { id: 'bnb', label: 'Short stays', section: 'Browse', icon: BedDouble, action: go('bnb') },
      );
    }

    const actions: CommandItem[] = [
      { id: 'settings', label: 'Account & workspace settings', section: 'Workspace', keywords: 'profile password payout branding', icon: Settings, action: go('settings') },
      {
        id: 'theme',
        label: resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
        section: 'Workspace',
        keywords: 'appearance dark mode light mode color',
        icon: resolvedTheme === 'dark' ? Sun : Moon,
        action: () => {
          setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
          setOpen(false);
        },
      },
    ];
    if (onHelpClick) {
      actions.push({
        id: 'help',
        label: 'Open guided tour',
        section: 'Workspace',
        keywords: 'help onboarding guide',
        icon: HelpCircle,
        action: () => {
          onHelpClick();
          setOpen(false);
        },
      });
    }

    return [...nav, ...actions];
  }, [currentRole, profile.isSuperAdmin, onNavigate, onHelpClick, resolvedTheme, setTheme]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.section.toLowerCase().includes(q) ||
        (item.keywords?.toLowerCase().includes(q) ?? false),
    );
  }, [items, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!open) return null;

  const grouped = filtered.reduce<Record<string, CommandItem[]>>((acc, item) => {
    acc[item.section] ??= [];
    acc[item.section].push(item);
    return acc;
  }, {});

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (filtered.length ? (i + 1) % filtered.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (filtered.length ? (i - 1 + filtered.length) % filtered.length : 0));
    } else if (e.key === 'Enter' && filtered[activeIndex]) {
      e.preventDefault();
      filtered[activeIndex].action();
    }
  };

  let runningIndex = -1;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-[#0F172A]/55 px-4 pt-[14vh] backdrop-blur-[2px] animate-in fade-in duration-150"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Quick navigation"
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-[#1C2B33]/[0.12] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.28)] dark:border-white/[0.12] dark:bg-[#1A1D21]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-[#1C2B33]/[0.08] px-4 py-3 dark:border-white/[0.08]">
          <Search className="h-4 w-4 shrink-0 text-[#8A94A6]" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to a page or action…"
            className="w-full bg-transparent text-sm text-[#1C2B33] placeholder:text-[#8A94A6] outline-none dark:text-slate-100"
          />
          <kbd className="hidden rounded border border-[#1C2B33]/12 bg-[#F7F8FA] px-1.5 py-0.5 text-[10px] font-semibold text-[#5F6C7B] sm:inline-block dark:border-white/12 dark:bg-white/5 dark:text-slate-400">
            ESC
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-[#5F6C7B] dark:text-slate-400">No matching destinations.</p>
          ) : (
            Object.entries(grouped).map(([section, groupItems]) => (
              <div key={section} className="mb-2 last:mb-0">
                <p className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-[#8A94A6]">{section}</p>
                {groupItems.map((item) => {
                  runningIndex += 1;
                  const idx = runningIndex;
                  const Icon = item.icon;
                  const active = idx === activeIndex;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={item.action}
                      className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                        active
                          ? 'bg-emerald-700/[0.09] font-medium text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300'
                          : 'text-[#1C2B33] hover:bg-[#F7F8FA] dark:text-slate-200 dark:hover:bg-white/[0.04]'
                      }`}
                    >
                      <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-emerald-700 dark:text-emerald-400' : 'text-[#5F6C7B] dark:text-slate-400'}`} />
                      <span className="flex-1 truncate">{item.label}</span>
                      {active && (
                        <kbd className="rounded border border-emerald-700/20 bg-white/80 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-950/60 dark:text-emerald-300">
                          ↵
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[#1C2B33]/[0.08] bg-[#F7F8FA] px-4 py-2 text-[11px] text-[#5F6C7B] dark:border-white/[0.08] dark:bg-[#16191D] dark:text-slate-400">
          <span>Navigate with ↑↓ · Select with ↵</span>
          <span>Ctrl / ⌘ + K</span>
        </div>
      </div>
    </div>
  );
}
