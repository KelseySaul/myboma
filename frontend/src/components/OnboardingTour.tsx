import { useState, useEffect, useCallback, useMemo } from 'react';
import { ArrowLeft, ArrowRight, Compass, X } from 'lucide-react';
import type { UserRole } from '../App';

export type TourPersona = 'superadmin' | 'agency' | 'landlord' | 'caretaker' | 'tenant' | 'hunter';

interface TourStep {
  title: string;
  description: string;
  /** Tab ID to navigate to automatically when entering this step. */
  tab?: string;
  /** Friendly page/section chip shown in the coachmark header. */
  sectionLabel?: string;
  /** Ordered list of `data-tour` values; first visible element in the viewport wins. */
  targets?: string[];
  /** Action tip telling the user what to try next. */
  actionTip?: string;
}

const PERSONA_LABELS: Record<TourPersona, string> = {
  superadmin: 'Super Admin Tour',
  agency: 'Property Manager Tour',
  landlord: 'Landlord Tour',
  caretaker: 'Caretaker Tour',
  tenant: 'Tenant Tour',
  hunter: 'House Hunter Tour',
};

const STEPS_BY_PERSONA: Record<TourPersona, TourStep[]> = {
  superadmin: [
    {
      title: 'Welcome to Super Admin',
      description: 'Let’s take a quick interactive walk through your controls. We’ll jump to each page and highlight the exact buttons as we go.',
      tab: 'dashboard',
      sectionLabel: 'Overview',
    },
    {
      title: 'Scope data by account',
      description: 'Use the Account Filter to inspect a specific landlord, multiple accounts together, or your own account. Gated pages stay clean until you pick a scope.',
      tab: 'dashboard',
      sectionLabel: 'Account Filter',
      targets: ['superadmin-filter'],
      actionTip: 'Try toggling “My account” or selecting any landlord from the dropdown.',
    },
    {
      title: 'Users & landlord plans',
      description: 'Invite landlords (and choose their subscription tier & duration), caretakers, tenants, or platform admins from one screen.',
      tab: 'registered',
      sectionLabel: 'Users',
      targets: ['admin-invite-btn', 'nav-registered'],
      actionTip: 'Tap Invite User to send a secure 7-day setup link.',
    },
    {
      title: 'Track pending invites',
      description: 'Every invite awaiting sign-up appears here so you can resend links or cancel unused invitations.',
      tab: 'pending',
      sectionLabel: 'Pending Invites',
      targets: ['nav-pending'],
    },
    {
      title: 'Properties & buildings',
      description: 'Manage units and buildings across accounts, snap photos with camera capture, or use quick description presets.',
      tab: 'properties',
      sectionLabel: 'Properties',
      targets: ['admin-add-property-btn', 'nav-properties'],
    },
    {
      title: 'Platforms & activity log',
      description: 'Provision separate agency workspaces under Platforms and audit every sensitive action in the Activity Log.',
      tab: 'platforms',
      sectionLabel: 'Platforms',
      targets: ['nav-platforms', 'nav-audit'],
    },
  ],
  agency: [
    {
      title: 'Welcome, Property Manager',
      description: 'Your Agency workspace lets you onboard landlords, manage their buildings and units, collect rent, and coordinate repairs end-to-end.',
      tab: 'dashboard',
      sectionLabel: 'Overview',
    },
    {
      title: 'Quick agency actions',
      description: 'Add a property for any managed landlord or invite a new landlord right from your overview.',
      tab: 'dashboard',
      sectionLabel: 'Overview',
      targets: ['admin-quick-actions'],
    },
    {
      title: 'Invite & manage landlords',
      description: 'Invite landlords under your agency and choose whether rent is collected by you (the property manager) or paid directly to the landlord.',
      tab: 'registered',
      sectionLabel: 'Users & Landlords',
      targets: ['admin-invite-btn', 'nav-registered'],
      actionTip: 'Select “Landlord” in Invite User to configure rent routing.',
    },
    {
      title: 'Pending invitations',
      description: 'See which landlords, caretakers, or tenants haven’t accepted yet and resend their links in one tap.',
      tab: 'pending',
      sectionLabel: 'Pending Invites',
      targets: ['nav-pending'],
    },
    {
      title: 'Buildings & units',
      description: 'Create buildings and assign units to your managed landlords — all photos, presets, and map pins live here.',
      tab: 'properties',
      sectionLabel: 'Properties',
      targets: ['admin-add-property-btn', 'nav-properties'],
    },
    {
      title: 'Rent collection & reminders',
      description: 'See which units across your managed landlords have paid, who is overdue, and send push + email reminders instantly.',
      tab: 'finances',
      sectionLabel: 'Rent & Payments',
      targets: ['nav-finances'],
    },
    {
      title: 'Repairs & maintenance',
      description: 'Track tenant maintenance tickets across every managed property from report to resolution.',
      tab: 'maintenance',
      sectionLabel: 'Maintenance',
      targets: ['nav-maintenance'],
    },
  ],
  landlord: [
    {
      title: 'Welcome to MyBoma',
      description: 'Let’s walk through your live landlord workspace. Each step opens the actual section and highlights where to click.',
      tab: 'dashboard',
      sectionLabel: 'Overview',
    },
    {
      title: 'Rent status & quick actions',
      description: 'See paid, due-soon, and overdue units at a glance, add a property, or invite a tenant right from your home screen.',
      tab: 'dashboard',
      sectionLabel: 'Overview',
      targets: ['landlord-quick-actions', 'nav-dashboard'],
    },
    {
      title: 'Add properties & buildings',
      description: 'Add houses or units with one-tap description presets and direct camera capture. Available units appear automatically on MyBoma listings.',
      tab: 'properties',
      sectionLabel: 'Properties',
      targets: ['landlord-add-property', 'nav-properties'],
      actionTip: 'Tap Add property to try presets and camera photo upload.',
    },
    {
      title: 'Rent, receipts & push reminders',
      description: 'Check every unit’s payment status, log cash or M-Pesa payments, and send push + email reminders with a single tap.',
      tab: 'finances',
      sectionLabel: 'Rent & Payments',
      targets: ['nav-finances'],
    },
    {
      title: 'Tenants & pending invites',
      description: 'Invite tenants by email so their leases and monthly invoices start automatically, and track anyone still awaiting sign-up.',
      tab: 'tenants',
      sectionLabel: 'Tenants',
      targets: ['nav-tenants', 'nav-pending'],
    },
    {
      title: 'Caretakers & field reports',
      description: 'Add caretakers under your account to respond to tenant house issues and send on-site photo reports straight to you.',
      tab: 'caretakers',
      sectionLabel: 'Caretakers & Reports',
      targets: ['nav-caretakers'],
    },
  ],
  caretaker: [
    {
      title: 'Welcome to your Caretaker workspace',
      description: 'Everything you need to fix tenant house issues and keep your landlord updated from the field.',
      tab: 'dashboard',
      sectionLabel: 'Overview',
    },
    {
      title: 'Respond to repairs & house issues',
      description: 'Review every open repair request, update status to In Progress or Resolved, and leave notes for the tenant and landlord.',
      tab: 'repairs',
      sectionLabel: 'Repairs & Issues',
      targets: ['caretaker-repairs', 'nav-repairs'],
    },
    {
      title: 'File reports to your landlord',
      description: 'Snap photos with your phone camera and submit security, utility, cleanliness, or inspection reports straight to your landlord.',
      tab: 'reports',
      sectionLabel: 'Field Reports',
      targets: ['caretaker-new-report', 'nav-reports'],
      actionTip: 'Tap New report to attach photos directly from your camera.',
    },
    {
      title: 'Real-time alerts',
      description: 'New tenant maintenance tickets and landlord replies appear here and trigger push notifications.',
      tab: 'automations',
      sectionLabel: 'Notifications',
      targets: ['nav-automations'],
    },
  ],
  tenant: [
    {
      title: 'Welcome to your Home',
      description: 'See your rent balance, pay safely by M-Pesa or card, report repairs, and read landlord notices all in one place.',
      tab: 'dashboard',
      sectionLabel: 'Home',
    },
    {
      title: 'Your next rent & M-Pesa payment',
      description: 'Check how much is due and when, then tap Pay with M-Pesa or card to get an instant digital receipt.',
      tab: 'dashboard',
      sectionLabel: 'Next Rent',
      targets: ['tenant-rent-card'],
    },
    {
      title: 'Payment history & receipts',
      description: 'Every invoice and confirmed rent payment is saved here so you can download receipts anytime.',
      tab: 'finances',
      sectionLabel: 'Payments',
      targets: ['nav-finances'],
    },
    {
      title: 'Report repairs',
      description: 'Need something fixed in your house? Report it here so your landlord and caretaker are notified immediately.',
      tab: 'maintenance',
      sectionLabel: 'Repairs',
      targets: ['tenant-report-repair', 'nav-maintenance'],
    },
    {
      title: 'Notices & reminders',
      description: 'Rent due reminders, payment confirmations, and landlord messages stay organized here.',
      tab: 'notices',
      sectionLabel: 'Notices',
      targets: ['nav-notices'],
    },
  ],
  hunter: [
    {
      title: 'Welcome to MyBoma',
      description: 'Browse verified homes, offices, and short stays directly from landlords and property managers across Kenya.',
      tab: 'all',
      sectionLabel: 'Explore',
    },
    {
      title: 'Smart search',
      description: 'Search by neighborhood, bedrooms, or budget (like “Kilimani 2br” or “under 45k”).',
      tab: 'all',
      sectionLabel: 'Search',
      targets: ['hunter-search'],
    },
    {
      title: 'Filter, like & save for later',
      description: 'Filter by Homes, Commercial, Short stays, or view your Liked and Saved listings anytime.',
      tab: 'all',
      sectionLabel: 'Filters',
      targets: ['hunter-filters'],
    },
    {
      title: 'Tap any listing to enquire',
      description: 'Inspect photos, check amenities, and send an enquiry directly to the landlord. Always view in person before paying.',
      tab: 'all',
      sectionLabel: 'Listings',
      targets: ['hunter-grid'],
    },
  ],
};

const STORAGE_KEY = (persona: TourPersona) => `myboma_onboarding_done_v3_${persona}`;

export function resolveTourPersona(role: UserRole, opts?: { isSuperAdmin?: boolean; isAdmin?: boolean }): TourPersona {
  if (opts?.isSuperAdmin) return 'superadmin';
  if (role === 'admin' || opts?.isAdmin) return 'agency';
  if (role === 'landlord') return 'landlord';
  if (role === 'caretaker') return 'caretaker';
  if (role === 'tenant') return 'tenant';
  return 'hunter';
}

function findVisibleTourElement(targets?: string[]): HTMLElement | null {
  if (!targets?.length) return null;
  for (const key of targets) {
    const candidates = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${key}"]`));
    for (const el of candidates) {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      if (rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none') {
        return el;
      }
    }
  }
  return null;
}

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface Props {
  role: UserRole;
  isSuperAdmin?: boolean;
  isAdmin?: boolean;
  activeTab?: string;
  onNavigateTab?: (tab: string) => void;
  onComplete: () => void;
}

export default function OnboardingTour({
  role,
  isSuperAdmin,
  isAdmin,
  activeTab,
  onNavigateTab,
  onComplete,
}: Props) {
  const persona = useMemo(
    () => resolveTourPersona(role, { isSuperAdmin, isAdmin }),
    [role, isSuperAdmin, isAdmin],
  );
  const steps = STEPS_BY_PERSONA[persona];
  const [step, setStep] = useState(0);
  const [exiting, setExiting] = useState(false);
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null);
  const [viewport, setViewport] = useState({
    w: typeof window !== 'undefined' ? window.innerWidth : 375,
    h: typeof window !== 'undefined' ? window.innerHeight : 812,
  });

  const current = steps[Math.min(step, steps.length - 1)];
  const isLast = step === steps.length - 1;
  const PAD = 6;

  // Auto-navigate to the step's real page/tab whenever the step changes.
  useEffect(() => {
    if (current.tab && onNavigateTab && current.tab !== activeTab) {
      onNavigateTab(current.tab);
    }
  }, [step, current.tab, activeTab, onNavigateTab]);

  // Locate, scroll into view, and track the target element (retrying briefly while lazy tabs mount).
  const measureTarget = useCallback(() => {
    setViewport({ w: window.innerWidth, h: window.innerHeight });
    const el = findVisibleTourElement(current.targets);
    if (!el) {
      setSpotlightRect(null);
      return false;
    }
    const rect = el.getBoundingClientRect();
    setSpotlightRect({
      top: Math.max(4, rect.top - PAD),
      left: Math.max(4, rect.left - PAD),
      width: Math.min(window.innerWidth - 8, rect.width + PAD * 2),
      height: rect.height + PAD * 2,
    });
    return true;
  }, [current.targets]);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    let scrolledOnce = false;

    const locate = () => {
      if (cancelled) return;
      const el = findVisibleTourElement(current.targets);
      if (el) {
        if (!scrolledOnce) {
          scrolledOnce = true;
          el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        }
        setTimeout(() => {
          if (!cancelled) measureTarget();
        }, 220);
        return;
      }
      if (attempts < 12) {
        attempts += 1;
        setTimeout(locate, 90);
      } else {
        setSpotlightRect(null);
      }
    };

    if (!current.targets?.length) {
      setSpotlightRect(null);
      return;
    }

    const startTimer = setTimeout(locate, 80);
    window.addEventListener('resize', measureTarget);
    window.addEventListener('scroll', measureTarget, true);
    return () => {
      cancelled = true;
      clearTimeout(startTimer);
      window.removeEventListener('resize', measureTarget);
      window.removeEventListener('scroll', measureTarget, true);
    };
  }, [step, current.targets, measureTarget]);

  const finish = useCallback(() => {
    setExiting(true);
    setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY(persona), 'true');
      } catch {
        /* ignore */
      }
      onComplete();
    }, 240);
  }, [persona, onComplete]);

  const next = useCallback(() => {
    if (isLast) {
      finish();
      return;
    }
    setStep((prev) => Math.min(prev + 1, steps.length - 1));
  }, [isLast, finish, steps.length]);

  const prev = useCallback(() => {
    setStep((p) => Math.max(0, p - 1));
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'Escape') finish();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [next, prev, finish]);

  const holePath = spotlightRect
    ? `M0,0 H${viewport.w} V${viewport.h} H0 Z M${spotlightRect.left},${spotlightRect.top} h${spotlightRect.width} v${spotlightRect.height} h-${spotlightRect.width} Z`
    : null;

  return (
    <div
      className="fixed inset-0 z-[70] pointer-events-none"
      role="dialog"
      aria-label={PERSONA_LABELS[persona]}
      style={{ opacity: exiting ? 0 : 1, transition: 'opacity 220ms ease' }}
    >
      {/* Subtle dimmed overlay with clean cutout over the highlighted live button/section */}
      {holePath ? (
        <svg
          className="fixed inset-0 h-full w-full pointer-events-none transition-opacity duration-200"
          width={viewport.w}
          height={viewport.h}
          aria-hidden
        >
          <path d={holePath} fill="rgba(15, 16, 24, 0.42)" fillRule="evenodd" />
        </svg>
      ) : (
        <div className="fixed inset-0 bg-zinc-950/25 pointer-events-none transition-opacity duration-200" aria-hidden />
      )}

      {/* Animated subtle-violet highlight ring on the exact target */}
      {spotlightRect && (
        <div
          className="fixed pointer-events-none rounded-xl transition-all duration-300 ease-out"
          style={{
            top: spotlightRect.top,
            left: spotlightRect.left,
            width: spotlightRect.width,
            height: spotlightRect.height,
            boxShadow: '0 0 0 2px #6D28D9, 0 0 0 6px rgba(109, 40, 217, 0.18)',
          }}
        />
      )}

      {/* Coachmark Card — stays clear of the mobile bottom nav */}
      <div className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] pointer-events-auto sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[370px]">
        <div className="overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-[0_20px_50px_-12px_rgba(15,16,24,0.32)] dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                <Compass className="h-3.5 w-3.5" />
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                {current.sectionLabel || PERSONA_LABELS[persona]}
              </span>
            </div>
            <button
              type="button"
              onClick={finish}
              aria-label="Close tour"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="px-4 pb-4 pt-3.5">
            <h2 className="text-base font-bold tracking-tight text-zinc-950 dark:text-white">
              {current.title}
            </h2>
            <p className="mt-1 text-[13px] leading-5 text-zinc-600 dark:text-zinc-300">
              {current.description}
            </p>

            {current.actionTip && (
              <p className="mt-2.5 rounded-lg bg-violet-50/70 px-2.5 py-1.5 text-[11px] font-medium text-violet-800 dark:bg-violet-500/15 dark:text-violet-200">
                Tip: {current.actionTip}
              </p>
            )}

            {/* Step dots */}
            <div className="mt-4 flex items-center gap-1.5" aria-label={`Step ${step + 1} of ${steps.length}`}>
              {steps.map((s, i) => (
                <button
                  key={s.title}
                  type="button"
                  onClick={() => setStep(i)}
                  className={`h-1.5 rounded-full transition-all duration-200 ${
                    i === step
                      ? 'w-5 bg-[#5B21B6] dark:bg-violet-400'
                      : i < step
                        ? 'w-1.5 bg-violet-300 dark:bg-violet-500/60'
                        : 'w-1.5 bg-zinc-200 dark:bg-zinc-700'
                  }`}
                  aria-label={`Go to step ${i + 1}: ${s.title}`}
                />
              ))}
              <span className="ml-auto text-[11px] font-medium tabular-nums text-zinc-400">
                {step + 1} / {steps.length}
              </span>
            </div>

            <div className="mt-3.5 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={prev}
                disabled={step === 0}
                className="inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-950 disabled:invisible dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={finish}
                  className="h-9 rounded-lg px-3 text-xs font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800"
                >
                  Skip
                </button>
                <button
                  type="button"
                  onClick={next}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#5B21B6] px-4 text-xs font-semibold text-white transition hover:bg-[#4C1D95] active:scale-[0.98]"
                >
                  {isLast ? 'Finish' : 'Next'}
                  {!isLast && <ArrowRight className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Call this to check whether the onboarding tour should show automatically for a given persona. */
export function shouldShowOnboarding(role: UserRole, opts?: { isSuperAdmin?: boolean; isAdmin?: boolean }): boolean {
  try {
    const persona = resolveTourPersona(role, opts);
    return localStorage.getItem(STORAGE_KEY(persona)) !== 'true';
  } catch {
    return false;
  }
}
