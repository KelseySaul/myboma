import { useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, Bell, Building2, CheckCircle2, Smartphone, Wrench } from 'lucide-react';
import Reveal from './Reveal';

/** Hero backgrounds, pre-blurred and compressed by scripts/build-hero-images.mjs. */
const HERO_IMAGES = ['/hero/hero-1.webp', '/hero/hero-2.webp', '/hero/hero-3.webp', '/hero/hero-4.webp', '/hero/hero-5.webp'];
const SLIDE_MS = 6000;

export type ListingType = 'all' | 'residential' | 'commercial' | 'bnb';

/* Hero --------------------------------------------------------------------- */

interface HeroProps {
  onBrowse: () => void;
  onStartLandlord: () => void;
}

export function LandingHero({ onBrowse, onStartLandlord }: HeroProps) {
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(() => setSlide((current) => (current + 1) % HERO_IMAGES.length), SLIDE_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="relative isolate flex min-h-[620px] items-center overflow-hidden bg-zinc-950 py-24 sm:h-[92svh] sm:max-h-[900px]">
      {HERO_IMAGES.map((src, index) => (
        <div
          key={src}
          aria-hidden
          className={`absolute inset-0 -z-20 bg-cover bg-center transition-[opacity,transform] duration-[1500ms] ease-in-out ${
            index === slide ? 'scale-105 opacity-100' : 'scale-110 opacity-0'
          }`}
          style={{ backgroundImage: `url('${src}')` }}
        />
      ))}
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-black/75 via-black/50 to-black/65" />
      <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-black/60 to-transparent" />

      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
        <div className="mx-auto max-w-3xl animate-in text-center fade-in slide-in-from-bottom-6 duration-1000">
          <h1 className="text-[2.6rem] font-extrabold leading-[1.02] tracking-tight text-white sm:text-7xl">
            Find a home.
            <br />
            <span className="text-white/70">Manage your rentals.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-zinc-200 sm:mt-6 sm:text-lg sm:leading-8">
            Browse houses across Kenya, or list your property and collect rent on{' '}
            <span className="whitespace-nowrap">M-Pesa</span>.
          </p>

          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={onBrowse}
              className="inline-flex h-12 items-center justify-center rounded-xl bg-white px-7 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200 active:scale-[0.98]"
            >
              Browse homes
            </button>
            <button
              type="button"
              onClick={onStartLandlord}
              className="group inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/40 bg-white/10 px-7 text-sm font-semibold text-white backdrop-blur-md transition hover:bg-white/20 active:scale-[0.98]"
            >
              List your property free
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </button>
          </div>
        </div>
      </div>

      <div className="absolute bottom-6 right-6 flex gap-2 sm:right-10" role="tablist" aria-label="Background photos">
        {HERO_IMAGES.map((src, index) => (
          <button
            key={src}
            type="button"
            role="tab"
            aria-selected={index === slide}
            aria-label={`Show photo ${index + 1}`}
            onClick={() => setSlide(index)}
            className={`h-1.5 rounded-full transition-all ${index === slide ? 'w-8 bg-white' : 'w-1.5 bg-white/50 hover:bg-white/80'}`}
          />
        ))}
      </div>
    </section>
  );
}

/* Listings ----------------------------------------------------------------- */

const TYPE_TILES: { id: ListingType; label: string; image: string }[] = [
  { id: 'residential', label: 'Homes', image: '/categories/homes.webp' },
  { id: 'commercial', label: 'Commercial', image: '/categories/commercial.webp' },
  { id: 'bnb', label: 'Short stays', image: '/categories/short-stays.webp' },
];

interface ListingsProps {
  activeType: string;
  onTypeChange: (type: ListingType) => void;
  children: ReactNode;
}

export function ListingsSection({ activeType, onTypeChange, children }: ListingsProps) {
  return (
    <section id="homes" className="scroll-mt-16 bg-white px-2 py-16 sm:px-4 sm:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-8 px-2 lg:flex-row lg:items-end lg:justify-between">
          <Reveal className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Available now</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-5xl">Homes and spaces listed on MyBoma</h2>
            <p className="mt-4 text-base leading-7 text-zinc-600">
              Apartments, offices and short stays, listed by their landlords and agents. Tap a home to see details and ask about it.
            </p>
          </Reveal>
          <Reveal delay={150} className="grid grid-cols-3 gap-3 lg:w-[460px]">
            {TYPE_TILES.map((tile) => {
              const selected = activeType === tile.id;
              return (
                <button
                  key={tile.id}
                  type="button"
                  onClick={() => onTypeChange(selected ? 'all' : tile.id)}
                  aria-pressed={selected}
                  className={`group relative aspect-[4/5] overflow-hidden rounded-2xl text-left ring-offset-2 transition ${
                    selected ? 'ring-2 ring-zinc-950' : 'hover:ring-2 hover:ring-zinc-300'
                  }`}
                >
                  <img
                    src={tile.image}
                    alt=""
                    loading="lazy"
                    width="600"
                    height="740"
                    className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  />
                  <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                  <span className="absolute bottom-3 left-3 right-3 text-sm font-semibold text-white">{tile.label}</span>
                </button>
              );
            })}
          </Reveal>
        </div>
        <Reveal delay={100} className="mt-10">{children}</Reveal>
      </div>
    </section>
  );
}

/* For landlords ------------------------------------------------------------ */

export function LandlordFeatures({ onStartLandlord }: { onStartLandlord: () => void }) {
  const features = [
    { icon: Smartphone, title: 'Rent on M-Pesa', body: 'Tenants pay by M-Pesa or card. Payments are recorded for you.' },
    { icon: Bell, title: 'Automatic reminders', body: 'Monthly invoices and rent reminders go out on their own.' },
    { icon: Building2, title: 'Tenants & leases', body: 'Every unit, tenant and payment in one place.' },
    { icon: Wrench, title: 'Repairs', body: 'Tenants report issues. You track them until fixed.' },
  ];
  return (
    <section id="landlords" className="scroll-mt-16 bg-zinc-50 px-4 py-12 sm:px-6 sm:py-20">
      <div className="mx-auto grid max-w-7xl items-center gap-8 lg:grid-cols-2 lg:gap-16">
        <Reveal className="relative hidden lg:block">
          <div className="overflow-hidden rounded-3xl">
            <img
              src="/categories/landlords.webp"
              alt="Modern rental home"
              loading="lazy"
              width="900"
              height="1100"
              className="aspect-[4/5] w-full object-cover sm:aspect-[5/4] lg:aspect-[4/5]"
            />
          </div>
          <div className="absolute -bottom-6 left-4 right-4 rounded-2xl bg-white p-4 shadow-xl shadow-zinc-900/10 ring-1 ring-zinc-200 sm:left-8 sm:right-auto sm:w-72">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-9 w-9 shrink-0 text-zinc-950" />
              <div>
                <p className="text-sm font-semibold text-zinc-950">Rent received</p>
                <p className="text-xs text-zinc-500">M-Pesa · invoice marked paid</p>
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal delay={150}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">For landlords & agents</p>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-zinc-950 sm:mt-3 sm:text-4xl">Run your rentals from your phone</h2>
          <p className="mt-3 text-sm leading-6 text-zinc-600 sm:mt-4 sm:text-base sm:leading-7">Start free with one house. Upgrade when your portfolio grows.</p>
          <div className="mt-7 grid gap-x-7 gap-y-5 sm:grid-cols-2 sm:gap-y-7">
            {features.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-950 text-white">
                  <Icon className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-zinc-950">{title}</h3>
                  <p className="mt-0.5 text-xs leading-5 text-zinc-600 sm:mt-1 sm:text-sm sm:leading-6">{body}</p>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={onStartLandlord}
            className="mt-7 inline-flex h-11 items-center gap-2 rounded-xl bg-zinc-950 px-5 text-sm font-semibold text-white transition hover:bg-zinc-800 active:scale-[0.98]"
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
    { title: 'Add your property', body: 'Free for your first house.' },
    { title: 'Invite your tenants', body: 'They get their own login.' },
    { title: 'Get paid on M-Pesa', body: 'Reminders do the chasing.' },
  ];
  return (
    <section className="bg-white px-4 py-12 sm:px-6 sm:py-20">
      <Reveal className="mx-auto max-w-7xl overflow-hidden rounded-3xl bg-zinc-950 px-5 py-7 text-white sm:px-10 sm:py-12">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="max-w-md text-2xl font-extrabold tracking-tight sm:text-4xl">Get started in 3 steps</h2>
          <div className="flex gap-2 sm:gap-3">
            <button
              type="button"
              onClick={onStartLandlord}
              className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200 active:scale-[0.98]"
            >
              Start free
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onSignIn}
              className="inline-flex h-10 flex-1 items-center justify-center rounded-xl border border-white/30 px-4 text-sm font-semibold text-white transition hover:bg-white/10 active:scale-[0.98]"
            >
              Sign in
            </button>
          </div>
        </div>
        <ol className="mt-7 grid grid-cols-3 gap-px overflow-hidden rounded-2xl bg-white/10">
          {steps.map((step, index) => (
            <li key={step.title} className="bg-zinc-950 p-3 sm:p-6">
              <span className="text-xs font-semibold text-zinc-500 sm:text-sm">0{index + 1}</span>
              <h3 className="mt-2 text-xs font-semibold sm:mt-3 sm:text-lg">{step.title}</h3>
              <p className="mt-1 hidden text-sm text-zinc-400 sm:block">{step.body}</p>
            </li>
          ))}
        </ol>
      </Reveal>
    </section>
  );
}
