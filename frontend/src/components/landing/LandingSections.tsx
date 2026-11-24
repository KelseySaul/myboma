import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRight, Bell, Building2, CheckCircle2, MapPin, Search, Smartphone, Wrench } from 'lucide-react';
import { useAvailableProperties } from '../../lib/queries';

/** Hero backgrounds, pre-blurred and compressed by scripts/build-hero-images.mjs. */
const HERO_IMAGES = ['/hero/hero-1.webp', '/hero/hero-2.webp', '/hero/hero-3.webp', '/hero/hero-4.webp', '/hero/hero-5.webp'];
const SLIDE_MS = 6000;

export type ListingType = 'all' | 'residential' | 'commercial' | 'bnb';

const LISTING_TYPES: { id: ListingType; label: string }[] = [
  { id: 'all', label: 'All types' },
  { id: 'residential', label: 'Homes' },
  { id: 'commercial', label: 'Commercial' },
  { id: 'bnb', label: 'Short stays' },
];

/* Hero --------------------------------------------------------------------- */

interface HeroProps {
  onSearch: (query: string, type: ListingType) => void;
  onStartLandlord: () => void;
}

export function LandingHero({ onSearch, onStartLandlord }: HeroProps) {
  const [slide, setSlide] = useState(0);
  const [query, setQuery] = useState('');
  const [type, setType] = useState<ListingType>('all');
  const { data: listings } = useAvailableProperties();
  const listingCount = Array.isArray(listings) ? listings.length : 0;

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(() => setSlide((current) => (current + 1) % HERO_IMAGES.length), SLIDE_MS);
    return () => clearInterval(timer);
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSearch(query.trim(), type);
  };

  return (
    <section className="relative isolate flex h-[86svh] min-h-[600px] max-h-[900px] items-center overflow-hidden bg-zinc-950">
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
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-black/80 via-black/55 to-black/30" />
      <div aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-black/60 to-transparent" />

      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
        <div className="max-w-3xl">
          {listingCount > 0 && (
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-white backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
              {listingCount} {listingCount === 1 ? 'home' : 'homes'} available now
            </span>
          )}
          <h1 className="mt-5 text-[2.6rem] font-extrabold leading-[1.02] tracking-tight text-white sm:text-7xl">
            Find a home.
            <br />
            <span className="text-white/70">Manage your rentals.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-zinc-200">
            Browse houses across Kenya, or list your property and collect rent on{' '}
            <span className="whitespace-nowrap">M-Pesa</span>.
          </p>

          <form
            onSubmit={submit}
            className="mt-9 flex w-full max-w-2xl flex-col gap-2 rounded-2xl bg-white p-2 shadow-2xl shadow-black/30 sm:flex-row sm:items-center"
            role="search"
          >
            <label className="flex flex-1 items-center gap-3 rounded-xl px-3 py-2.5 sm:py-0">
              <MapPin className="h-5 w-5 shrink-0 text-zinc-400" />
              <span className="sr-only">Location</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Where do you want to live? e.g. Kilimani"
                className="h-10 w-full bg-transparent text-sm text-zinc-950 placeholder:text-zinc-400 focus:outline-none"
              />
            </label>
            <div className="hidden h-8 w-px bg-zinc-200 sm:block" />
            <label className="flex items-center rounded-xl px-3 sm:w-40">
              <span className="sr-only">Property type</span>
              <select
                value={type}
                onChange={(event) => setType(event.target.value as ListingType)}
                className="h-10 w-full cursor-pointer bg-transparent text-sm font-medium text-zinc-950 focus:outline-none"
              >
                {LISTING_TYPES.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-6 text-sm font-semibold text-white transition hover:bg-zinc-800 active:scale-[0.98]"
            >
              <Search className="h-4 w-4" />
              Search
            </button>
          </form>

          <button
            type="button"
            onClick={onStartLandlord}
            className="group mt-6 inline-flex items-center gap-2 text-sm font-semibold text-white"
          >
            Own a property? List it for free
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
          </button>
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
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Available now</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-5xl">Homes and spaces listed on MyBoma</h2>
            <p className="mt-4 text-base leading-7 text-zinc-600">
              Apartments, commercial spaces and short stays, listed by their landlords and agents. Sign in to enquire or book a viewing.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 lg:w-[460px]">
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
          </div>
        </div>
        <div className="mt-10">{children}</div>
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
    <section id="landlords" className="scroll-mt-16 bg-zinc-50 px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <div className="relative">
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
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">For landlords & agents</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-5xl">Run your rentals from your phone</h2>
          <p className="mt-4 text-base leading-7 text-zinc-600">Start free with one house. Upgrade when your portfolio grows.</p>
          <div className="mt-10 grid gap-x-8 gap-y-7 sm:grid-cols-2">
            {features.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-950 text-white">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-base font-semibold text-zinc-950">{title}</h3>
                  <p className="mt-1 text-sm leading-6 text-zinc-600">{body}</p>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={onStartLandlord}
            className="mt-10 inline-flex h-12 items-center gap-2 rounded-xl bg-zinc-950 px-6 text-sm font-semibold text-white transition hover:bg-zinc-800 active:scale-[0.98]"
          >
            List your property free
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
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
    <section className="bg-white px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-zinc-950 px-6 py-12 text-white sm:px-12 sm:py-16">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
          <h2 className="max-w-md text-3xl font-extrabold tracking-tight sm:text-5xl">Get started in 3 steps</h2>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={onStartLandlord}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200 active:scale-[0.98]"
            >
              Start free
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onSignIn}
              className="inline-flex h-12 items-center justify-center rounded-xl border border-white/30 px-6 text-sm font-semibold text-white transition hover:bg-white/10 active:scale-[0.98]"
            >
              Sign in
            </button>
          </div>
        </div>
        <ol className="mt-12 grid gap-px overflow-hidden rounded-2xl bg-white/10 sm:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="bg-zinc-950 p-6 sm:p-8">
              <span className="text-sm font-semibold text-zinc-500">0{index + 1}</span>
              <h3 className="mt-3 text-lg font-semibold">{step.title}</h3>
              <p className="mt-1 text-sm text-zinc-400">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
