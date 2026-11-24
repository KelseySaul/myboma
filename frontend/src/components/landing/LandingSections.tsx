import { useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, Bell, Building2, Search, Smartphone, Wrench } from 'lucide-react';

/** Hero backgrounds, pre-blurred and compressed by scripts/build-hero-images.mjs. */
const HERO_IMAGES = ['/hero/hero-1.webp', '/hero/hero-2.webp', '/hero/hero-3.webp', '/hero/hero-4.webp', '/hero/hero-5.webp'];
const SLIDE_MS = 6000;

/* Hero --------------------------------------------------------------------- */

interface HeroProps {
  onStartLandlord: () => void;
  onFindHome: () => void;
}

export function LandingHero({ onStartLandlord, onFindHome }: HeroProps) {
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(() => setSlide((current) => (current + 1) % HERO_IMAGES.length), SLIDE_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="relative isolate flex h-[78svh] min-h-[520px] max-h-[860px] items-center overflow-hidden bg-zinc-950">
      {HERO_IMAGES.map((src, index) => (
        <div
          key={src}
          aria-hidden
          className={`absolute inset-0 -z-20 scale-105 bg-cover bg-center transition-opacity duration-[1500ms] ease-in-out ${
            index === slide ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ backgroundImage: `url('${src}')` }}
        />
      ))}
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-black/60 via-black/50 to-black/75" />

      <div className="mx-auto w-full max-w-7xl px-4 py-24 sm:px-6">
        <div className="max-w-2xl">
          <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-6xl">
            Find a home.
            <br />
            Manage your rentals.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-zinc-200">
            Browse houses for rent, or list your property and collect rent on <span className="whitespace-nowrap">M-Pesa</span>, all in one place.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={onFindHome}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200 active:scale-[0.98]"
            >
              <Search className="h-4 w-4" />
              Find a house
            </button>
            <button
              type="button"
              onClick={onStartLandlord}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/50 px-6 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/10 active:scale-[0.98]"
            >
              List your property
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-2" role="tablist" aria-label="Background photos">
        {HERO_IMAGES.map((src, index) => (
          <button
            key={src}
            type="button"
            role="tab"
            aria-selected={index === slide}
            aria-label={`Show photo ${index + 1}`}
            onClick={() => setSlide(index)}
            className={`h-1.5 rounded-full transition-all ${index === slide ? 'w-6 bg-white' : 'w-1.5 bg-white/50 hover:bg-white/80'}`}
          />
        ))}
      </div>
    </section>
  );
}

/* Listings ----------------------------------------------------------------- */

export function ListingsSection({ children }: { children: ReactNode }) {
  return (
    <section id="homes" className="scroll-mt-16 bg-white px-2 py-16 sm:px-4 sm:py-20">
      <div className="mx-auto max-w-7xl">
        <div className="max-w-2xl px-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Available now</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">Homes and spaces listed on MyBoma</h2>
          <p className="mt-3 text-base leading-7 text-zinc-600">
            Apartments, commercial spaces and short stays, listed by their landlords and agents. Sign in to enquire or book a viewing.
          </p>
        </div>
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}

/* For landlords ------------------------------------------------------------ */

export function LandlordFeatures() {
  const features = [
    { icon: Smartphone, title: 'Rent on M-Pesa', body: 'Tenants pay by M-Pesa or card. Payments are recorded for you.' },
    { icon: Bell, title: 'Automatic reminders', body: 'Monthly invoices and rent reminders go out on their own.' },
    { icon: Building2, title: 'Tenants & leases', body: 'Every unit, tenant and payment in one place.' },
    { icon: Wrench, title: 'Repairs', body: 'Tenants report issues. You track them until fixed.' },
  ];
  return (
    <section className="border-t border-zinc-200 bg-zinc-50 px-4 py-16 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-7xl">
        <h2 className="text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-4xl">For landlords</h2>
        <p className="mt-3 text-base text-zinc-600">Everything you need to run your rentals.</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ icon: Icon, title, body }) => (
            <article key={title} className="rounded-2xl border border-zinc-200 bg-white p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-950 text-white">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-5 text-base font-semibold text-zinc-950">{title}</h3>
              <p className="mt-1.5 text-sm leading-6 text-zinc-600">{body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* Get started -------------------------------------------------------------- */

export function GetStarted({ onStartLandlord, onSignIn }: { onStartLandlord: () => void; onSignIn: () => void }) {
  const steps = ['Add your property', 'Invite your tenants', 'Get paid on M-Pesa'];
  return (
    <section className="bg-zinc-950 px-4 py-16 text-white sm:px-6 sm:py-20">
      <div className="mx-auto flex max-w-7xl flex-col gap-10 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Get started in 3 steps</h2>
          <ol className="mt-8 flex flex-col gap-4 sm:flex-row sm:gap-8">
            {steps.map((step, index) => (
              <li key={step} className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-sm font-bold text-zinc-950">
                  {index + 1}
                </span>
                <span className="text-base font-medium text-zinc-100">{step}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onStartLandlord}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200 active:scale-[0.98]"
          >
            List your property
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
    </section>
  );
}
