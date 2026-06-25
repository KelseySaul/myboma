import { useState, useEffect, useRef, useCallback } from 'react';
import { UserRole } from '../App';

interface Step {
  icon: string;
  title: string;
  description: string;
  /** data-tour attribute value of the element to spotlight */
  spotlight?: string;
  color: string;
}

const STEPS: Record<UserRole, Step[]> = {
  landlord: [
    {
      icon: '🏡',
      title: 'Welcome to myboma Command Center',
      description: "Your all-in-one property management OS. We'll walk you through the key features so you can get up and running fast.",
      color: 'from-indigo-500 to-purple-600',
    },
    {
      icon: '🏢',
      title: 'Assets Tab',
      description: 'This is your Assets tab — start here to manage all your properties and buildings. Click "Add Building" to group your units.',
      spotlight: 'tab-properties',
      color: 'from-blue-500 to-cyan-500',
    },
    {
      icon: '🔑',
      title: 'List Your Properties',
      description: 'Use "New Asset" to add individual units, or "Bulk Add Units" to create many at once. Set price, type, and availability.',
      spotlight: 'tab-properties',
      color: 'from-violet-500 to-fuchsia-500',
    },
    {
      icon: '👥',
      title: 'Tenants Tab',
      description: 'Invite tenants by email from the Tenants tab. Once they sign up, assign them to any available property unit.',
      spotlight: 'tab-tenants',
      color: 'from-emerald-500 to-teal-500',
    },
    {
      icon: '💰',
      title: 'Finances Tab',
      description: 'Record rent payments, log expenses, and get a real-time P&L overview with charts. Export to CSV anytime.',
      spotlight: 'tab-finances',
      color: 'from-amber-500 to-orange-500',
    },
    {
      icon: '🔧',
      title: 'Maintenance Tab',
      description: "Tenant requests land here. Update statuses in real time so your tenants always know what's happening.",
      spotlight: 'tab-maintenance',
      color: 'from-rose-500 to-pink-500',
    },
    {
      icon: '🔔',
      title: 'Notifications Hub',
      description: 'Stay updated in real time on booking requests, maintenance alerts, and rent ledger updates.',
      spotlight: 'tab-automations',
      color: 'from-purple-500 to-indigo-600',
    },
  ],
  tenant: [
    {
      icon: '🏠',
      title: 'Welcome to myboma',
      description: 'Your personal rental dashboard. Manage your rent, maintenance requests, and stay on top of everything from one place.',
      color: 'from-emerald-500 to-teal-600',
    },
    {
      icon: '💳',
      title: 'View & Pay Rent',
      description: 'See your current rent status, upcoming due dates, and payment history. Pay via M-Pesa directly from the app.',
      spotlight: 'tab-rent',
      color: 'from-blue-500 to-indigo-600',
    },
    {
      icon: '🔧',
      title: 'Submit Maintenance Requests',
      description: 'Something broken? Submit a request from the Maintenance tab — your landlord gets notified immediately.',
      spotlight: 'tab-maintenance',
      color: 'from-amber-500 to-orange-500',
    },
    {
      icon: '📬',
      title: 'Stay Updated',
      description: 'Check Notifications for messages from your landlord, payment confirmations, and reminders. Never miss a thing.',
      spotlight: 'tab-notifications',
      color: 'from-violet-500 to-purple-600',
    },
  ],
  hunter: [
    {
      icon: '🔍',
      title: 'Welcome to myboma',
      description: 'Discover verified properties across Kenya. Browse listings, schedule viewings, and book BnB stays — all in one place.',
      color: 'from-indigo-500 to-blue-600',
    },
    {
      icon: '🗺️',
      title: 'Browse Listings',
      description: 'Use the search bar and filters to find properties by location, price, and type. Each card shows photos, amenities, and price.',
      color: 'from-cyan-500 to-teal-500',
    },
    {
      icon: '📅',
      title: 'Book a BnB Stay',
      description: 'Found a short-term listing? Click it to view details, pick your dates, and book instantly. Confirmation is sent immediately.',
      color: 'from-rose-500 to-pink-500',
    },
    {
      icon: '📩',
      title: 'Contact Landlords',
      description: 'Interested in a long-term rental? Use the contact option on any listing to reach the property owner directly.',
      color: 'from-amber-500 to-orange-500',
    },
  ],
  admin: [
    {
      icon: '🛡️',
      title: 'Welcome, Super Admin',
      description: 'You have full platform access. Manage all users, monitor activity, and control platform-wide settings from this dashboard.',
      color: 'from-slate-800 to-zinc-900',
    },
    {
      icon: '👤',
      title: 'User Management',
      description: 'View all registered users, search by role or email, edit profiles, and impersonate any account for support.',
      spotlight: 'tab-users',
      color: 'from-blue-600 to-indigo-700',
    },
    {
      icon: '📊',
      title: 'Platform Analytics',
      description: 'Monitor key metrics — total properties, active tenants, revenue flow, and system health.',
      spotlight: 'tab-analytics',
      color: 'from-emerald-500 to-teal-600',
    },
    {
      icon: '🔔',
      title: 'Audit & Activity Log',
      description: 'All user actions are logged. Review the audit trail for any account to trace changes, logins, and admin actions.',
      spotlight: 'tab-activity',
      color: 'from-amber-500 to-orange-500',
    },
  ],
};

const STORAGE_KEY = (role: UserRole) => `myboma_onboarding_done_v2_${role}`;

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface Props {
  role: UserRole;
  onComplete: () => void;
}

export default function OnboardingTour({ role, onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null);
  const [cardPos, setCardPos] = useState<'top' | 'bottom'>('bottom');
  const cardRef = useRef<HTMLDivElement>(null);

  const steps = STEPS[role] ?? STEPS.hunter;
  const current = steps[step];
  const isLast = step === steps.length - 1;
  const PAD = 10; // spotlight padding around target

  // Measure and position spotlight when step changes
  const measureSpotlight = useCallback(() => {
    const s = steps[step];
    if (!s.spotlight) {
      setSpotlightRect(null);
      return;
    }
    const el = document.querySelector(`[data-tour="${s.spotlight}"]`) as HTMLElement | null;
    if (!el) { setSpotlightRect(null); return; }

    // Scroll element into view smoothly
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });

    // Small delay to let scroll settle
    setTimeout(() => {
      const rect = el.getBoundingClientRect();
      const r = {
        top: rect.top - PAD,
        left: rect.left - PAD,
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
      };
      setSpotlightRect(r);

      // Position card above or below based on space
      const spaceBelow = window.innerHeight - rect.bottom;
      setCardPos(spaceBelow > 220 ? 'bottom' : 'top');
    }, 200);
  }, [step, steps]);

  useEffect(() => {
    measureSpotlight();
    window.addEventListener('resize', measureSpotlight);
    return () => window.removeEventListener('resize', measureSpotlight);
  }, [measureSpotlight]);

  const finish = useCallback(() => {
    setExiting(true);
    setTimeout(() => {
      localStorage.setItem(STORAGE_KEY(role), 'true');
      onComplete();
    }, 350);
  }, [role, onComplete]);

  const goTo = useCallback((target: number) => {
    if (animating) return;
    setAnimating(true);
    setTimeout(() => {
      setStep(target);
      setAnimating(false);
    }, 180);
  }, [animating]);

  const next = useCallback(() => {
    if (isLast) { finish(); return; }
    goTo(step + 1);
  }, [isLast, finish, goTo, step]);

  const prev = useCallback(() => {
    if (step === 0) return;
    goTo(step - 1);
  }, [step, goTo]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') next();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'Escape') finish();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [next, prev, finish]);

  // SVG cutout dimensions
  const W = typeof window !== 'undefined' ? window.innerWidth : 375;
  const H = typeof window !== 'undefined' ? window.innerHeight : 812;

  const clipPath = spotlightRect
    ? `M0,0 H${W} V${H} H0 Z M${spotlightRect.left},${spotlightRect.top} h${spotlightRect.width} v${spotlightRect.height} h-${spotlightRect.width} Z`
    : null;

  return (
    <div
      className="fixed bottom-6 right-6 z-50 w-full max-w-[340px] pointer-events-none"
      role="dialog"
      aria-label="Onboarding tour"
      style={{ animation: exiting ? 'tourFadeOut 0.35s ease forwards' : 'tourFadeIn 0.3s ease both' }}
    >
      {/* Glowing border around spotlight */}
      {spotlightRect && (
        <div
          className="fixed pointer-events-none rounded-xl z-[49]"
          style={{
            top: spotlightRect.top,
            left: spotlightRect.left,
            width: spotlightRect.width,
            height: spotlightRect.height,
            boxShadow: '0 0 0 2px rgba(99,102,241,1), 0 0 20px 4px rgba(99,102,241,0.3)',
            animation: 'tourPulseRing 1.8s ease-in-out infinite',
          }}
        />
      )}

      {/* Tour card — Floating at bottom right */}
      <div
        ref={cardRef}
        className="w-full pointer-events-auto"
        style={{
          animation: animating
            ? 'tourFadeOut 0.15s ease forwards'
            : exiting
              ? 'tourFadeOut 0.3s ease forwards'
              : 'tourCardInBottom 0.35s cubic-bezier(0.34,1.4,0.64,1) both',
        }}
      >
        <div className="bg-white rounded-[1.75rem] overflow-hidden shadow-2xl">
          {/* Gradient header */}
          <div className={`bg-gradient-to-br ${current.color} px-5 pt-5 pb-8 relative overflow-hidden`}>
            <div className="absolute top-[-40%] right-[-20%] w-36 h-36 rounded-full bg-white/10 blur-2xl pointer-events-none" />

            {/* Skip */}
            <button
              onClick={(e) => { e.stopPropagation(); finish(); }}
              className="absolute top-3.5 right-4 text-white/60 hover:text-white text-[10px] font-black uppercase tracking-widest transition-colors"
            >
              Skip ✕
            </button>

            {/* Progress dots */}
            <div className="flex items-center gap-1.5 mb-4">
              {steps.map((_, i) => (
                <button
                  key={i}
                  onClick={(e) => { e.stopPropagation(); if (i <= step) goTo(i); }}
                  className="rounded-full transition-all duration-300"
                  style={{
                    width: i === step ? 20 : 6,
                    height: 6,
                    background: i === step ? 'rgba(255,255,255,0.95)' : i < step ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.25)',
                  }}
                  aria-label={`Go to step ${i + 1}`}
                />
              ))}
            </div>

            <div className="text-4xl mb-2 select-none" role="img" aria-hidden>{current.icon}</div>
            <h2
              key={`t${step}`}
              className="text-white font-black text-xl leading-snug tracking-tight"
              style={{ animation: 'tourContentIn 0.25s ease both' }}
            >
              {current.title}
            </h2>
          </div>

          {/* Body */}
          <div className="px-5 pt-4 pb-5">
            <p
              key={`d${step}`}
              className="text-zinc-600 text-sm leading-relaxed"
              style={{ animation: 'tourContentIn 0.3s 0.04s ease both' }}
            >
              {current.description}
            </p>

            {current.spotlight && (
              <div
                key={`s${step}`}
                className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-50 border border-indigo-100"
                style={{ animation: 'tourContentIn 0.3s 0.08s ease both' }}
              >
                <span className="text-indigo-500 text-sm">👆</span>
                <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">
                  Highlighted above
                </span>
              </div>
            )}

            {/* Controls */}
            <div className="flex items-center justify-between mt-4">
              <button
                onClick={(e) => { e.stopPropagation(); prev(); }}
                disabled={step === 0}
                className="text-[11px] font-black uppercase tracking-widest text-zinc-400 hover:text-zinc-700 disabled:opacity-0 transition-all"
              >
                ← Back
              </button>
              <span className="text-[10px] font-bold text-zinc-400">{step + 1} / {steps.length}</span>
              <button
                onClick={(e) => { e.stopPropagation(); next(); }}
                className={`px-5 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest text-white active:scale-95 shadow-md bg-gradient-to-r ${current.color} transition-transform`}
              >
                {isLast ? 'Get Started →' : 'Next →'}
              </button>
            </div>
          </div>
        </div>

        <p className="text-center text-white/40 text-[9px] font-bold uppercase tracking-widest mt-3">
          Tap backdrop · Arrow keys · Esc to skip
        </p>
      </div>

      <style>{`
        @keyframes tourFadeIn  { from { opacity:0 } to { opacity:1 } }
        @keyframes tourFadeOut { from { opacity:1 } to { opacity:0 } }
        @keyframes tourCardInBottom { from { opacity:0; transform:translateY(20px) scale(0.96) } to { opacity:1; transform:translateY(0) scale(1) } }
        @keyframes tourContentIn { from { opacity:0; transform:translateY(5px) } to { opacity:1; transform:translateY(0) } }
        @keyframes tourPulseRing {
          0%,100% { box-shadow: 0 0 0 2px rgba(99,102,241,1), 0 0 12px 2px rgba(99,102,241,0.25); }
          50%      { box-shadow: 0 0 0 3px rgba(99,102,241,1),   0 0 24px 6px rgba(99,102,241,0.4); }
        }
      `}</style>
    </div>
  );
}

/** Call this to check whether the onboarding tour should show for a given role */
export function shouldShowOnboarding(role: UserRole): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY(role)) !== 'true';
  } catch {
    return false;
  }
}
