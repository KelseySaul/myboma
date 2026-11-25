import { useState, useEffect, useRef, useCallback } from 'react';
import { UserRole } from '../App';

interface Step {
  title: string;
  description: string;
  /** data-tour attribute value of the element to spotlight */
  spotlight?: string;
}

const STEPS: Record<UserRole, Step[]> = {
  landlord: [
    { title: 'Welcome to MyBoma', description: "Here's a quick look at where everything is. It takes under a minute, and you can skip it." },
    { title: 'Your properties', description: 'Add each house or unit here with its rent and photos. Mark a unit as available to show it on the public listings.', spotlight: 'tab-properties' },
    { title: 'Tenants', description: 'Invite a tenant by email. They get a secure link to set up their account, and their lease and invoices appear automatically.', spotlight: 'tab-tenants' },
    { title: 'Rent and money', description: 'See who has paid, record cash payments and expenses, and download your records.', spotlight: 'tab-finances' },
    { title: 'Repairs', description: 'Repair requests from tenants appear here. Update the status so tenants know what is happening.', spotlight: 'tab-maintenance' },
    { title: 'Reminders', description: 'Rent reminders go out automatically from three days before the due date. Adjust them here.', spotlight: 'tab-automations' },
  ],
  tenant: [
    { title: 'Welcome to MyBoma', description: 'This is where you see your rent, pay it and report repairs.' },
    { title: 'Rent', description: 'Check what you owe and when it is due. Pay by M-Pesa or card, and every payment gets a receipt.', spotlight: 'tab-rent' },
    { title: 'Repairs', description: 'Report a problem in your house and follow it until it is fixed. Your landlord is notified straight away.', spotlight: 'tab-maintenance' },
    { title: 'Notifications', description: 'Reminders, receipts and messages from your landlord appear here.', spotlight: 'tab-notifications' },
  ],
  hunter: [
    { title: 'Welcome to MyBoma', description: 'Browse homes, offices and short stays across Kenya, and contact landlords directly.' },
    { title: 'Search', description: 'Search by area or building name, and filter by type. Tap any listing to see photos and details.' },
    { title: 'Send an enquiry', description: 'On a listing, enter your details and send an enquiry. The landlord gets your contact details and gets back to you about availability.' },
    { title: 'Stay safe', description: 'View a house in person before paying anything, and never pay a deposit to someone you have not met.' },
  ],
  admin: [
    { title: 'Welcome', description: 'You can manage users, properties and platform settings from here.' },
    { title: 'Users', description: 'Find any account, change roles, invite people and suspend accounts. You can also view the app as a user to help them.', spotlight: 'tab-users' },
    { title: 'Overview', description: 'Key numbers for the platform: users, properties, leases and rent collected.', spotlight: 'tab-analytics' },
    { title: 'Activity log', description: 'Every admin action is recorded. Use it to see who changed what and when.', spotlight: 'tab-activity' },
  ],
  caretaker: [
    { title: 'Welcome to MyBoma', description: 'Respond to tenant repair tickets and file field reports straight to your landlord.' },
    { title: 'Repairs & issues', description: 'Review every repair request, add progress notes, and mark work fixed so tenants and your landlord stay updated.' },
    { title: 'Reports to landlord', description: 'Snap photos on site and send security, utility, or inspection reports to your landlord anytime.' },
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
      className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 pointer-events-none sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[360px]"
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
            boxShadow: '0 0 0 2px rgba(9,9,11,0.9), 0 0 20px 4px rgba(9,9,11,0.12)',
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
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_24px_64px_-12px_rgba(9,9,11,0.3)] dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between px-5 pt-5">
            <div className="flex items-center gap-1.5" aria-label={`Step ${step + 1} of ${steps.length}`}>
              {steps.map((_, i) => (
                <button
                  key={i}
                  onClick={(e) => { e.stopPropagation(); if (i <= step) goTo(i); }}
                  className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? 'w-5 bg-zinc-950 dark:bg-white' : i < step ? 'w-1.5 bg-zinc-400' : 'w-1.5 bg-zinc-200 dark:bg-zinc-700'}`}
                  aria-label={`Go to step ${i + 1}`}
                />
              ))}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); finish(); }}
              className="rounded-lg px-2 py-1 text-sm font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950 dark:hover:bg-zinc-800 dark:hover:text-white"
            >
              Skip
            </button>
          </div>

          <div className="px-5 pb-5 pt-4">
            <h2 key={`t${step}`} className="text-lg font-semibold tracking-tight text-zinc-950 dark:text-white" style={{ animation: 'tourContentIn 0.25s ease both' }}>
              {current.title}
            </h2>
            <p key={`d${step}`} className="mt-1.5 text-sm leading-6 text-zinc-600 dark:text-zinc-300" style={{ animation: 'tourContentIn 0.3s 0.04s ease both' }}>
              {current.description}
            </p>

            <div className="mt-5 flex items-center justify-between gap-3">
              <button
                onClick={(e) => { e.stopPropagation(); prev(); }}
                disabled={step === 0}
                className="h-10 rounded-xl px-3 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-950 disabled:invisible dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Back
              </button>
              <span className="text-xs tabular-nums text-zinc-400">{step + 1} of {steps.length}</span>
              <button
                onClick={(e) => { e.stopPropagation(); next(); }}
                className="h-10 rounded-xl bg-zinc-950 px-5 text-sm font-semibold text-white transition hover:bg-zinc-800 active:scale-[0.98] dark:bg-white dark:text-zinc-950"
              >
                {isLast ? 'Done' : 'Next'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes tourFadeIn  { from { opacity:0 } to { opacity:1 } }
        @keyframes tourFadeOut { from { opacity:1 } to { opacity:0 } }
        @keyframes tourCardInBottom { from { opacity:0; transform:translateY(20px) scale(0.96) } to { opacity:1; transform:translateY(0) scale(1) } }
        @keyframes tourContentIn { from { opacity:0; transform:translateY(5px) } to { opacity:1; transform:translateY(0) } }
        @keyframes tourPulseRing {
          0%,100% { box-shadow: 0 0 0 2px rgba(9,9,11,0.9), 0 0 12px 2px rgba(9,9,11,0.10); }
          50%      { box-shadow: 0 0 0 3px rgba(9,9,11,0.9),   0 0 24px 6px rgba(9,9,11,0.06); }
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
