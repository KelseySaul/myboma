import { useEffect, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Building2,
  CheckCircle2,
  Clock,
  Search,
  ShieldCheck,
  Smartphone,
  Wrench,
} from 'lucide-react';
import Reveal from './Reveal';

/** Hero backgrounds, pre-blurred and compressed by scripts/build-hero-images.mjs. */
const HERO_IMAGES = ['/hero/hero-1.webp', '/hero/hero-2.webp', '/hero/hero-3.webp', '/hero/hero-4.webp', '/hero/hero-5.webp'];
const SLIDE_MS = 6500;

export type ListingType = 'all' | 'residential' | 'commercial' | 'bnb';

/* Hero --------------------------------------------------------------------- */

interface HeroProps {
  onBrowse: () => void;
  onStartLandlord: () => void;
  onSearch?: (query: string) => void;
}

export function LandingHero({ onBrowse, onStartLandlord, onSearch }: HeroProps) {
  const [slide, setSlide] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [heroQuery, setHeroQuery] = useState('');

  useEffect(() => {
    setMounted(true);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(() => setSlide((current) => (current + 1) % HERO_IMAGES.length), SLIDE_MS);
    return () => clearInterval(timer);
  }, []);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSearch && heroQuery.trim()) {
      onSearch(heroQuery.trim());
    } else {
      onBrowse();
    }
  };

  return (
    <section className="relative isolate flex min-h-[620px] items-center overflow-hidden bg-zinc-950 pb-16 pt-28 sm:min-h-[86svh] sm:max-h-[880px] sm:py-24">
      {/* Load only slide 0 eagerly for fast LCP; reveal subsequent slides after mount */}
      {HERO_IMAGES.map((src, index) => {
        if (index > 0 && !mounted) return null;
        return (
          <img
            key={src}
            src={src}
            alt=""
            aria-hidden
            fetchPriority={index === 0 ? 'high' : 'low'}
            loading={index === 0 ? 'eager' : 'lazy'}
            decoding="async"
            className={`pointer-events-none absolute inset-0 -z-20 h-full w-full object-cover transition-[opacity,transform] duration-[1400ms] ease-out ${
              index === slide ? 'scale-105 opacity-100' : 'scale-110 opacity-0'
            }`}
          />
        );
      })}

      {/* Clean architectural charcoal photographic scrim */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-b from-black/70 via-black/45 to-black/80"
      />

      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
        <div className="mx-auto max-w-3xl text-center animate-in fade-in slide-in-from-bottom-5 duration-700">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/30 px-3.5 py-1.5 text-xs font-medium text-zinc-200 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
            Rentals &amp; property management across Kenya
          </p>

          <h1 className="mt-5 text-[2.35rem] font-extrabold leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-[4.15rem]">
            Find your next home.
            <br />
            <span className="text-zinc-300">Manage rentals simply.</span>
          </h1>

          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-zinc-200/90 sm:mt-6 sm:text-lg sm:leading-8">
            Browse verified homes across Kenya, or manage your properties with{' '}
            <span className="whitespace-nowrap font-semibold text-white">M-Pesa</span> rent tracking, caretaker reports, and one-tap reminders.
          </p>

          {/* Clean Hero Search Bar */}
          <form
            onSubmit={submitSearch}
            className="mx-auto mt-7 flex max-w-xl flex-col gap-2 rounded-2xl border border-white/15 bg-white/95 p-1.5 shadow-2xl shadow-black/35 sm:flex-row sm:items-center"
          >
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                type="search"
                value={heroQuery}
                onChange={(e) => setHeroQuery(e.target.value)}
                placeholder="Try “Kilimani 2br”, “Westlands office” or “under 45k”…"
                aria-label="Search homes and spaces"
                className="h-11 w-full rounded-xl bg-transparent pl-10 pr-3 text-sm font-medium text-zinc-950 placeholder:text-zinc-400 outline-none"
              />
            </div>
            <button
              type="submit"
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#5B21B6] to-[#6D28D9] px-6 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 active:scale-[0.98]"
            >
              Search homes
            </button>
          </form>

          <div className="mt-5 flex flex-col justify-center gap-2.5 sm:flex-row sm:gap-3">
            <button
              type="button"
              onClick={onBrowse}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-6 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-100 active:scale-[0.98]"
            >
              Browse listings
            </button>
            <button
              type="button"
              onClick={onStartLandlord}
              className="group inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/25 bg-black/25 px-6 text-sm font-semibold text-white backdrop-blur-xs transition hover:bg-white/15 active:scale-[0.98]"
            >
              List your property free
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </button>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-medium text-zinc-300">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-zinc-200" />
              Direct from landlords &amp; agents
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Smartphone className="h-3.5 w-3.5 text-zinc-200" />
              M-Pesa &amp; card reconciliation
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-zinc-200" />
              Free forever for your 1st unit
            </span>
          </div>
        </div>
      </div>

      <div className="absolute bottom-5 right-5 flex gap-2 sm:bottom-6 sm:right-10" role="tablist" aria-label="Background photos">
        {HERO_IMAGES.map((src, index) => (
          <button
            key={src}
            type="button"
            role="tab"
            aria-selected={index === slide}
            aria-label={`Show photo ${index + 1}`}
            onClick={() => setSlide(index)}
            className={`h-1.5 rounded-full transition-all ${
              index === slide ? 'w-7 bg-white' : 'w-1.5 bg-white/40 hover:bg-white/75'
            }`}
          />
        ))}
      </div>
    </section>
  );
}

/* Listings ----------------------------------------------------------------- */

const TYPE_TILES: { id: ListingType; label: string; subtitle: string; image: string }[] = [
  { id: 'residential', label: 'Homes', subtitle: 'Apartments & houses', image: '/categories/homes.webp' },
  { id: 'commercial', label: 'Commercial', subtitle: 'Offices & retail', image: '/categories/commercial.webp' },
  { id: 'bnb', label: 'Short stays', subtitle: 'Furnished & nightly', image: '/categories/short-stays.webp' },
];

interface ListingsProps {
  activeType: string;
  onTypeChange: (type: ListingType) => void;
  children: ReactNode;
}

export function ListingsSection({ activeType, onTypeChange, children }: ListingsProps) {
  return (
    <section id="homes" className="scroll-mt-16 bg-white px-2 py-14 sm:px-4 sm:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-7 px-2 lg:flex-row lg:items-end lg:justify-between">
          <Reveal className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">Available now</p>
            <h2 className="mt-2.5 text-2xl font-extrabold tracking-tight text-zinc-950 sm:text-5xl">
              Spaces listed directly on MyBoma
            </h2>
            <p className="mt-3 text-sm leading-6 text-zinc-600 sm:mt-4 sm:text-base sm:leading-7">
              Apartments, offices and short stays published by verified landlords and property managers. Tap any listing to inspect photos and enquire directly.
            </p>
          </Reveal>
          <Reveal delay={120} className="grid grid-cols-3 gap-2.5 sm:gap-3 lg:w-[460px]">
            {TYPE_TILES.map((tile) => {
              const selected = activeType === tile.id;
              return (
                <button
                  key={tile.id}
                  type="button"
                  onClick={() => onTypeChange(selected ? 'all' : tile.id)}
                  aria-pressed={selected}
                  className={`group relative aspect-[4/5] overflow-hidden rounded-2xl text-left ring-offset-2 transition ${
                    selected ? 'ring-2 ring-violet-700 shadow-md' : 'hover:ring-2 hover:ring-zinc-300'
                  }`}
                >
                  <img
                    src={tile.image}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    width="600"
                    height="740"
                    className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  />
                  <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  <span className="absolute bottom-2.5 left-2.5 right-2.5 sm:bottom-3 sm:left-3 sm:right-3">
                    <span className="block text-xs font-bold text-white sm:text-sm">{tile.label}</span>
                    <span className="hidden text-[11px] text-zinc-300 sm:block">{tile.subtitle}</span>
                  </span>
                </button>
              );
            })}
          </Reveal>
        </div>
        <Reveal delay={80} className="mt-8 sm:mt-10">{children}</Reveal>
      </div>
    </section>
  );
}

/* For landlords ------------------------------------------------------------ */

export function LandlordFeatures({ onStartLandlord }: { onStartLandlord: () => void }) {
  const features = [
    { icon: Building2, title: 'Unit-by-unit rent board', body: 'See which units have paid, who is overdue, and whose rent is due next at a single glance.' },
    { icon: Smartphone, title: 'M-Pesa & card reconciliation', body: 'Tenants pay from their phone. Invoices update and receipts issue automatically.' },
    { icon: Bell, title: 'Push & email rent reminders', body: 'Send reminders individually or to every unpaid unit by push notification, email, and in-app alert.' },
    { icon: Wrench, title: 'Caretakers & repair tracking', body: 'Add caretakers to resolve tenant house issues and send field reports with photos straight to you.' },
  ];

  const previewUnits = [
    { unit: 'A1 · Kilimani Heights', tenant: 'Grace Mwangi', amount: 'KES 48,000', status: 'paid' as const, meta: 'Paid via M-Pesa · 2nd' },
    { unit: 'B4 · Kilimani Heights', tenant: 'David Ochieng', amount: 'KES 52,000', status: 'due' as const, meta: 'Due in 2 days' },
    { unit: 'C2 · Kilimani Heights', tenant: 'Amina Hassan', amount: 'KES 45,000', status: 'overdue' as const, meta: '4 days overdue · Remind' },
  ];

  return (
    <section id="landlords" className="scroll-mt-16 border-y border-zinc-200/70 bg-[#F7F7F9] px-4 py-14 sm:px-6 sm:py-24">
      <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-2 lg:gap-16">
        {/* Crisp Architectural Rent Board Preview Card */}
        <Reveal className="order-2 lg:order-1">
          <div className="relative overflow-hidden rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Live Rent Board</p>
                <h3 className="mt-0.5 text-lg font-bold text-zinc-950">This month&apos;s collection</h3>
              </div>
              <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-800 ring-1 ring-violet-700/15">
                82% collected
              </span>
            </div>

            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
              <div className="h-full w-[82%] rounded-full bg-[#5B21B6]" />
            </div>

            <div className="mt-5 space-y-2.5">
              {previewUnits.map((row) => (
                <div
                  key={row.unit}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200/80 bg-[#FAFAFB] p-3.5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                        row.status === 'paid'
                          ? 'bg-violet-50 text-violet-700'
                          : row.status === 'due'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-rose-50 text-rose-600'
                      }`}
                    >
                      {row.status === 'paid' ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : row.status === 'due' ? (
                        <Clock className="h-4 w-4" />
                      ) : (
                        <AlertTriangle className="h-4 w-4" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-zinc-950">{row.unit}</p>
                      <p className="truncate text-xs text-zinc-500">
                        {row.tenant} · {row.meta}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold tabular-nums text-zinc-950">{row.amount}</p>
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        row.status === 'paid'
                          ? 'bg-violet-50 text-violet-700'
                          : row.status === 'due'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-rose-50 text-rose-700'
                      }`}
                    >
                      {row.status === 'paid' ? 'Paid' : row.status === 'due' ? 'Due soon' : 'Overdue'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>

        <Reveal delay={100} className="order-1 lg:order-2">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">
            For landlords &amp; property managers
          </p>
          <h2 className="mt-2.5 text-2xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
            Know every unit&apos;s rent status in seconds
          </h2>
          <p className="mt-3 text-sm leading-6 text-zinc-600 sm:mt-4 sm:text-base sm:leading-7">
            Leave scattered M-Pesa messages and spreadsheets behind. Start free with your first unit and scale cleanly to multi-building portfolios.
          </p>
          <div className="mt-7 grid gap-5 sm:grid-cols-2 sm:gap-6">
            {features.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-900 shadow-2xs">
                  <Icon className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-zinc-950">{title}</h3>
                  <p className="mt-1 text-xs leading-5 text-zinc-600 sm:text-sm sm:leading-6">{body}</p>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={onStartLandlord}
            className="mt-8 inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-[#5B21B6] to-[#6D28D9] px-6 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 active:scale-[0.98]"
          >
            List your property free
            <ArrowRight className="h-4 w-4" />
          </button>
        </Reveal>
      </div>
    </section>
  );
}

/* Get started -------------------------------------------------------------- */

export function GetStarted({ onStartLandlord, onSignIn }: { onStartLandlord: () => void; onSignIn: () => void }) {
  const steps = [
    { title: 'Add your property', body: 'Upload or snap photos from your camera with one-tap description templates. Free for your first unit.' },
    { title: 'Invite tenants & caretakers', body: 'Send secure setup links so tenants pay online and caretakers handle repairs and field reports.' },
    { title: 'Track rent & get paid', body: 'Monitor paid, due and overdue units at a glance with push reminders and M-Pesa reconciliation.' },
  ];
  return (
    <section className="bg-white px-4 py-14 sm:px-6 sm:py-20">
      <Reveal className="mx-auto max-w-7xl rounded-3xl border border-zinc-800 bg-[#14141A] px-5 py-8 text-white shadow-xl sm:px-10 sm:py-12">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">Quick onboarding</p>
            <h2 className="mt-2 max-w-md text-2xl font-extrabold tracking-tight sm:text-4xl">
              Go live with your rentals in 3 steps
            </h2>
          </div>
          <div className="flex flex-col gap-2.5 sm:flex-row sm:gap-3">
            <button
              type="button"
              onClick={onStartLandlord}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-100 active:scale-[0.98]"
            >
              Start free
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onSignIn}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-white/20 bg-white/[0.06] px-5 text-sm font-semibold text-white transition hover:bg-white/15 active:scale-[0.98]"
            >
              Sign in
            </button>
          </div>
        </div>
        <ol className="mt-8 grid gap-3 sm:grid-cols-3 sm:gap-4">
          {steps.map((step, index) => (
            <li key={step.title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:p-6">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-xs font-bold text-violet-300">
                0{index + 1}
              </span>
              <h3 className="mt-3 text-base font-bold text-white">{step.title}</h3>
              <p className="mt-1.5 text-xs leading-5 text-zinc-400 sm:text-sm sm:leading-6">{step.body}</p>
            </li>
          ))}
        </ol>
      </Reveal>
    </section>
  );
}
