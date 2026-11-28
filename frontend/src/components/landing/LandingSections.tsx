import { useEffect, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Search,
  ShieldCheck,
  Smartphone,
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
    <section className="relative isolate flex min-h-[580px] items-center overflow-hidden bg-zinc-950 pb-14 pt-28 sm:min-h-[84svh] sm:max-h-[860px] sm:py-24">
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
        className="absolute inset-0 -z-10 bg-gradient-to-b from-black/68 via-black/45 to-black/78"
      />

      <div className="mx-auto w-full max-w-7xl px-5 sm:px-8">
        <div className="mx-auto max-w-3xl text-center animate-in fade-in slide-in-from-bottom-5 duration-700">
          <h1 className="text-[2.4rem] font-extrabold leading-[1.14] tracking-tight text-white sm:text-6xl sm:leading-[1.1] lg:text-[4.25rem]">
            Find your next home.
            <span className="mt-2.5 block text-zinc-300 sm:mt-3.5">Manage rentals simply.</span>
          </h1>

          {/* Clean Hero Search Bar */}
          <form
            onSubmit={submitSearch}
            className="mx-auto mt-10 flex max-w-xl flex-col gap-2.5 rounded-2xl border border-white/15 bg-white/95 p-2 shadow-2xl shadow-black/35 sm:mt-12 sm:flex-row sm:items-center sm:gap-2"
          >
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                type="search"
                value={heroQuery}
                onChange={(e) => setHeroQuery(e.target.value)}
                placeholder="Try “Kilimani 2br”, “Westlands office” or “under 45k”…"
                aria-label="Search homes and spaces"
                className="h-12 w-full rounded-xl bg-transparent pl-11 pr-3 text-sm font-medium text-zinc-950 placeholder:text-zinc-400 outline-none"
              />
            </div>
            <button
              type="submit"
              className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#5B21B6] px-7 text-sm font-semibold text-white shadow-sm transition hover:bg-[#4C1D95] active:scale-[0.98]"
            >
              Search homes
            </button>
          </form>

          <div className="mt-7 flex flex-col justify-center gap-3.5 sm:mt-8 sm:flex-row sm:gap-4">
            <button
              type="button"
              onClick={onBrowse}
              className="inline-flex h-12 items-center justify-center rounded-xl bg-white px-7 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-100 active:scale-[0.98]"
            >
              Browse listings
            </button>
            <button
              type="button"
              onClick={onStartLandlord}
              className="group inline-flex h-12 items-center justify-center gap-2.5 rounded-xl border border-white/25 bg-black/25 px-7 text-sm font-semibold text-white backdrop-blur-xs transition hover:bg-white/15 active:scale-[0.98]"
            >
              List your property free
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </button>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3.5 text-xs font-medium text-zinc-300 sm:mt-12 sm:text-sm">
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-zinc-200" />
              Direct from landlords &amp; managers
            </span>
            <span className="inline-flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-zinc-200" />
              M-Pesa &amp; card reconciliation
            </span>
            <span className="inline-flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-zinc-200" />
              Free forever for up to 2 units
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
    <section id="homes" className="scroll-mt-16 bg-white px-2 py-12 sm:px-4 sm:py-20">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-6 px-2 lg:flex-row lg:items-end lg:justify-between">
          <Reveal className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Available now</p>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
              Spaces listed directly on MyBoma
            </h2>
            <p className="mt-2.5 text-sm leading-6 text-zinc-600 sm:text-base sm:leading-7">
              Apartments, offices and short stays published by landlords and property managers. Save houses for later anytime, or sign in to like and track them.
            </p>
          </Reveal>
          <Reveal delay={100} className="grid grid-cols-3 gap-2.5 sm:gap-3 lg:w-[440px]">
            {TYPE_TILES.map((tile) => {
              const selected = activeType === tile.id;
              return (
                <button
                  key={tile.id}
                  type="button"
                  onClick={() => onTypeChange(selected ? 'all' : tile.id)}
                  aria-pressed={selected}
                  className={`group relative aspect-[4/5] overflow-hidden rounded-2xl text-left ring-offset-2 transition ${
                    selected ? 'ring-2 ring-[#5B21B6] shadow-md' : 'hover:ring-2 hover:ring-zinc-300'
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
        <Reveal delay={60} className="mt-7 sm:mt-9">{children}</Reveal>
      </div>
    </section>
  );
}

/* Editorial Workspace Overview (Quiet, Architectural, Non-AI-Slop) --------- */

export function LandlordFeatures({ onStartLandlord }: { onStartLandlord: () => void }) {
  const roles = [
    {
      number: '01',
      title: 'Landlords',
      body: 'Start free with up to 2 units (1 building). Log rent, track arrears, issue receipts, and send reminders without spreadsheets.',
    },
    {
      number: '02',
      title: 'Property managers & agencies',
      body: 'Invite landlords under your agency, configure direct or agency-managed rent routing, and oversee multi-building portfolios from one account.',
    },
    {
      number: '03',
      title: 'Caretakers & tenants',
      body: 'Caretakers respond to repair tickets and send on-site photo reports. Tenants pay rent via M-Pesa or card and download receipts anytime.',
    },
  ];

  return (
    <section id="landlords" className="scroll-mt-16 border-y border-zinc-200/80 bg-[#F8F8FA] px-4 py-14 sm:px-6 sm:py-24">
      <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-12 lg:gap-14">
        <Reveal className="lg:col-span-5">
          <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-zinc-100">
            <img
              src="/hero/hero-3.webp"
              alt="Modern residential apartment building"
              loading="lazy"
              decoding="async"
              className="aspect-[4/3] w-full object-cover lg:aspect-[4/5]"
            />
          </div>
        </Reveal>

        <Reveal delay={80} className="lg:col-span-7">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Built for how rentals actually run
          </p>
          <h2 className="mt-2.5 text-2xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">
            One quiet workspace for landlords, managers, caretakers, and tenants.
          </h2>

          <div className="mt-8 divide-y divide-zinc-200/80 border-y border-zinc-200/80">
            {roles.map((item) => (
              <div key={item.number} className="grid gap-2 py-5 sm:grid-cols-[44px_180px_1fr] sm:items-baseline sm:gap-4">
                <span className="font-mono text-xs font-semibold text-zinc-400">{item.number}</span>
                <h3 className="text-sm font-bold text-zinc-950">{item.title}</h3>
                <p className="text-sm leading-6 text-zinc-600">{item.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onStartLandlord}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#5B21B6] px-5 text-sm font-semibold text-white transition hover:bg-[#4C1D95] active:scale-[0.98]"
            >
              Create a free account
              <ArrowRight className="h-4 w-4" />
            </button>
            <a
              href="/about"
              className="inline-flex h-11 items-center rounded-xl border border-zinc-200 bg-white px-5 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50"
            >
              View plans &amp; pricing
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* Get started -------------------------------------------------------------- */

export function GetStarted({ onStartLandlord, onSignIn }: { onStartLandlord: () => void; onSignIn: () => void }) {
  const steps = [
    { title: 'Add your property', body: 'Upload or snap photos from your camera with quick description presets. Free for up to 2 units (1 building).' },
    { title: 'Invite landlords, tenants & caretakers', body: 'Send secure setup links so tenants pay online, caretakers track repairs, and managed landlords stay in sync.' },
    { title: 'Collect rent & issue receipts', body: 'Track paid, due, and overdue invoices with push reminders, email notices, and M-Pesa reconciliation.' },
  ];
  return (
    <section className="bg-white px-4 py-14 sm:px-6 sm:py-20">
      <Reveal className="mx-auto max-w-7xl rounded-3xl border border-zinc-800 bg-[#14141A] px-5 py-8 text-white shadow-xl sm:px-10 sm:py-12">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">Getting started</p>
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
            <li key={step.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-xs font-bold text-zinc-200">
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
