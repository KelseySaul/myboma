import { useState } from 'react';
import { ArrowRight, Building2, Check, KeyRound, Search, ShieldCheck, Smartphone, Users } from 'lucide-react';
import { SUBSCRIPTION_TIERS, formatPlanPrice, type SubscriptionTier } from '../../../shared/landlordSubscription';
import { tenantConfig } from '../config/tenant';
import Reveal from './landing/Reveal';

type GuideId = 'landlords' | 'tenants' | 'hunters';

interface Guide {
  label: string;
  icon: typeof KeyRound;
  intro: string;
  steps: { title: string; body: string }[];
  tips: string[];
}

const GUIDES: Record<GuideId, Guide> = {
  landlords: {
    label: 'Landlords & managers',
    icon: KeyRound,
    intro:
      'Use MyBoma to list vacant units, see paid and unpaid rent at a glance, add caretakers for on-site repairs and field reports, and collect rent on M-Pesa without matching SMS messages by hand.',
    steps: [
      {
        title: 'Create your account',
        body: 'Sign up with email, Google, or Phone SMS OTP and choose "Landlord / Owner". The Free plan covers one house unit at KES 0. Paid plans unlock more units, buildings, repairs, and team caretakers.',
      },
      {
        title: 'Choose how you receive rent',
        body: 'Pick M-Pesa, bank or cash. Your payout details are only used for the rent your tenants pay and are never shown publicly.',
      },
      {
        title: 'Add properties with presets & camera',
        body: 'Fill descriptions in seconds with one-tap templates, then upload photos from your gallery or take pictures straight from your camera.',
      },
      {
        title: 'Invite tenants & caretakers',
        body: 'Send secure setup links to tenants and caretakers. Caretakers can respond to tenant repair tickets and file photo reports directly to your dashboard.',
      },
      {
        title: 'Track payments & push reminders',
        body: 'Invoices generate automatically every month. See paid, due-soon and overdue units on your Rent Board and send push + email reminders in one tap.',
      },
    ],
    tips: [
      'Put the agreed rent, deposit and due date in writing before the tenant moves in.',
      'Issue a receipt for every payment, including cash. MyBoma records M-Pesa and card payments automatically.',
      'Keep clean digital rent records — residential rental income in Kenya is declarable to KRA.',
      'Give written notice before entering an occupied unit, except in an emergency.',
    ],
  },
  tenants: {
    label: 'Tenants',
    icon: Users,
    intro:
      'When your landlord uses MyBoma, you can see what is due, pay from your phone via M-Pesa or card, report repairs, and download every receipt in one place.',
    steps: [
      {
        title: 'Accept your setup link',
        body: 'Open the 7-day invitation link your landlord sent, or sign up with the exact email address your landlord used so your home links automatically.',
      },
      {
        title: 'Check your monthly invoice',
        body: 'Each month you receive a clear invoice showing your rent amount and due date, plus friendly push and email reminders before it is due.',
      },
      {
        title: 'Pay by M-Pesa or card',
        body: 'Open the invoice and pay. For M-Pesa, confirm the STK prompt on your phone — your invoice marks itself paid and generates a receipt.',
      },
      {
        title: 'Report repairs & track progress',
        body: 'Submit maintenance requests right from your phone and follow every update from your landlord or caretaker until fixed.',
      },
    ],
    tips: [
      'Always pay through the app or keep an official receipt so your payment history stays protected.',
      'Read your lease carefully before signing — verify rent, deposit, notice period and utility terms.',
      'Take move-in photos on day one to protect your security deposit at move-out.',
    ],
  },
  hunters: {
    label: 'House hunters',
    icon: Search,
    intro: 'Browse homes, commercial spaces and short stays across Kenya and reach landlords directly — no account required to enquire.',
    steps: [
      {
        title: 'Search naturally',
        body: 'Search by neighbourhood, building name, bedrooms or budget (like “Kilimani 2br under 50k”) and filter by category.',
      },
      {
        title: 'Inspect every detail',
        body: 'Tap any listing to view high-resolution photos, rent, area, amenities and description.',
      },
      {
        title: 'Contact the landlord directly',
        body: 'Send your name, phone and email in seconds. We email you a confirmation and forward your enquiry straight to the landlord or manager.',
      },
    ],
    tips: [
      'Always view a property in person before paying any deposit or rent.',
      'Never pay a "viewing fee" or deposit to someone you have not verified.',
      'Request a written tenancy agreement and receipt for every shilling paid.',
    ],
  },
};

const PLAN_ORDER: SubscriptionTier[] = ['free', 'basic', 'starter', 'pro', 'proplus'];

export default function AboutPage({ onSignUp }: { onSignUp: () => void }) {
  const [guide, setGuide] = useState<GuideId>('landlords');
  const current = GUIDES[guide];

  return (
    <div className="bg-white selection:bg-violet-200 selection:text-zinc-950">
      {/* Clean Architectural Photographic Hero */}
      <section className="relative isolate overflow-hidden bg-zinc-950 px-4 pb-16 pt-32 text-white sm:px-6 sm:pb-24 sm:pt-40">
        <img
          src="/hero/hero-2.webp"
          alt=""
          aria-hidden
          fetchPriority="high"
          decoding="async"
          className="pointer-events-none absolute inset-0 -z-20 h-full w-full scale-105 object-cover"
        />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-black/75 via-black/55 to-black/85" />

        <div className="mx-auto max-w-5xl animate-in fade-in slide-in-from-bottom-4 duration-700">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/30 px-3.5 py-1.5 text-xs font-medium text-zinc-200 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
            About {tenantConfig.appName}
          </p>
          <h1 className="mt-5 max-w-4xl text-3xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-6xl">
            Renting in Kenya, designed to be{' '}
            <span className="text-zinc-300">clear, fast, and reliable.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-zinc-300 sm:text-lg sm:leading-8">
            MyBoma brings landlords, caretakers, tenants and house hunters onto one connected workspace — from finding a home to M-Pesa rent collection, repairs, and digital receipts.
          </p>

          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { icon: Smartphone, stat: 'M-Pesa native', label: 'Automatic invoice matching & receipts' },
              { icon: ShieldCheck, stat: 'Connected roles', label: 'Landlords, caretakers, tenants & hunters' },
              { icon: Building2, stat: 'Free to start', label: 'Manage your first unit at KES 0 forever' },
            ].map(({ icon: Icon, stat, label }) => (
              <div key={stat} className="flex items-center gap-3 rounded-2xl border border-white/12 bg-black/35 p-4 backdrop-blur-sm">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-bold text-white">{stat}</p>
                  <p className="text-xs text-zinc-300">{label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Three Pillars */}
      <section className="px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto grid max-w-6xl gap-4 sm:gap-6 md:grid-cols-3">
          {[
            { icon: Search, title: 'Discover verified spaces', body: 'Browse homes, offices and short stays posted directly by the landlords and agents who run them.' },
            { icon: Building2, title: 'Operate from any phone', body: 'Units, tenants, caretakers, pending invites, repairs and camera photo uploads built mobile-first.' },
            { icon: KeyRound, title: 'Collect rent without chasing', body: 'Track every unit’s paid, due-soon and overdue status in real time with M-Pesa, card payments, and push reminders.' },
          ].map(({ icon: Icon, title, body }, index) => (
            <Reveal
              key={title}
              delay={index * 80}
              className="rounded-2xl border border-zinc-200/90 bg-white p-6 shadow-2xs transition hover:border-zinc-300 hover:shadow-sm"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-100 text-zinc-900">
                <Icon className="h-5 w-5" />
              </span>
              <h2 className="mt-5 text-lg font-bold text-zinc-950">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-600">{body}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Role-Based Interactive Guides */}
      <section id="guides" className="scroll-mt-24 border-y border-zinc-200/70 bg-[#F7F7F9] px-4 py-14 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">Step-by-step playbook</p>
            <h2 className="mt-2.5 text-2xl font-extrabold tracking-tight text-zinc-950 sm:text-5xl">
              How MyBoma works for you
            </h2>
            <p className="mt-2.5 text-sm text-zinc-600 sm:text-base">Choose your role to see the complete end-to-end flow.</p>
          </Reveal>

          <div role="tablist" aria-label="Guides" className="no-scrollbar mt-7 flex gap-2 overflow-x-auto pb-1 sm:flex-wrap">
            {(Object.keys(GUIDES) as GuideId[]).map((id) => {
              const { label, icon: Icon } = GUIDES[id];
              const selected = id === guide;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setGuide(id)}
                  className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold transition ${
                    selected
                      ? 'bg-zinc-950 text-white shadow-sm'
                      : 'bg-white text-zinc-600 ring-1 ring-zinc-200 hover:text-zinc-950'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              );
            })}
          </div>

          <div key={guide} role="tabpanel" className="mt-8 grid gap-8 animate-in fade-in duration-300 lg:grid-cols-[1.5fr_1fr]">
            <div>
              <p className="max-w-2xl text-sm leading-7 text-zinc-700 sm:text-base">{current.intro}</p>
              <ol className="mt-6 space-y-3.5">
                {current.steps.map((step, index) => (
                  <li key={step.title} className="flex gap-3.5 rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-2xs sm:gap-4 sm:p-5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-zinc-950 text-xs font-bold text-white">
                      {index + 1}
                    </span>
                    <div>
                      <h3 className="text-sm font-bold text-zinc-950 sm:text-base">{step.title}</h3>
                      <p className="mt-1 text-xs leading-5 text-zinc-600 sm:text-sm sm:leading-6">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <aside className="h-fit rounded-3xl border border-zinc-800 bg-[#14141A] p-6 text-white shadow-lg lg:sticky lg:top-28">
              <h3 className="text-base font-bold">Good practice</h3>
              <ul className="mt-4 space-y-3">
                {current.tips.map((tip) => (
                  <li key={tip} className="flex gap-3 text-sm leading-6 text-zinc-300">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-400" />
                    {tip}
                  </li>
                ))}
              </ul>
              <p className="mt-6 border-t border-white/10 pt-4 text-xs leading-5 text-zinc-400">
                General guidance only, not legal advice.
              </p>
            </aside>
          </div>
        </div>
      </section>

      {/* Mobile-First Pricing Cards */}
      <section className="px-4 py-14 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">Transparent pricing</p>
            <h2 className="mt-2.5 text-2xl font-extrabold tracking-tight text-zinc-950 sm:text-5xl">
              Simple prepaid plans for landlords
            </h2>
            <p className="mt-2.5 max-w-2xl text-sm text-zinc-600 sm:text-base">
              Tenants and house hunters always use MyBoma free. Landlord plans are prepaid — no surprise auto-renewals, with discounts on quarterly and yearly billing.
            </p>
          </Reveal>

          <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {PLAN_ORDER.map((id) => {
              const tier = SUBSCRIPTION_TIERS[id];
              const featured = id === 'pro';
              return (
                <div
                  key={id}
                  className={`relative flex flex-col justify-between rounded-2xl border p-5 transition ${
                    featured
                      ? 'border-zinc-900 bg-[#14141A] text-white shadow-xl'
                      : 'border-zinc-200 bg-white text-zinc-950 shadow-2xs hover:border-zinc-300'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-base font-bold">{tier.label}</h3>
                      {featured && (
                        <span className="rounded-full bg-violet-500/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-300">
                          Popular
                        </span>
                      )}
                    </div>
                    <p className="mt-3 text-2xl font-extrabold tabular-nums">
                      {tier.monthlyBaseKes === 0 ? 'Free' : formatPlanPrice(tier.monthlyBaseKes)}
                      {tier.monthlyBaseKes > 0 && (
                        <span className={`text-xs font-medium ${featured ? 'text-zinc-400' : 'text-zinc-500'}`}>/mo</span>
                      )}
                    </p>
                    <ul className="mt-4 space-y-2 border-t border-current/10 pt-4 text-xs leading-5">
                      {tier.highlights.map((item) => (
                        <li key={item} className={`flex items-start gap-2 ${featured ? 'text-zinc-300' : 'text-zinc-600'}`}>
                          <Check className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${featured ? 'text-violet-300' : 'text-violet-700'}`} />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <button
                    type="button"
                    onClick={onSignUp}
                    className={`mt-6 inline-flex h-10 w-full items-center justify-center rounded-xl text-xs font-semibold transition ${
                      featured
                        ? 'bg-gradient-to-r from-[#5B21B6] to-[#6D28D9] text-white hover:brightness-110'
                        : 'border border-zinc-200 bg-zinc-50 text-zinc-900 hover:bg-zinc-100'
                    }`}
                  >
                    {tier.monthlyBaseKes === 0 ? 'Start free' : `Choose ${tier.label}`}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Contact / Start CTA */}
      <section className="px-4 pb-16 sm:px-6 sm:pb-24">
        <Reveal className="mx-auto flex max-w-6xl flex-col gap-6 rounded-3xl border border-zinc-800 bg-[#14141A] px-6 py-10 text-white shadow-xl sm:flex-row sm:items-center sm:justify-between sm:px-12 sm:py-12">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight sm:text-4xl">Have questions or managing 20+ units?</h2>
            <p className="mt-2 text-sm text-zinc-300 sm:text-base">
              Email{' '}
              <a href={`mailto:${tenantConfig.supportEmail}`} className="font-semibold text-white underline decoration-violet-400 underline-offset-4">
                {tenantConfig.supportEmail}
              </a>
              , or create your free landlord account in under a minute.
            </p>
          </div>
          <button
            type="button"
            onClick={onSignUp}
            className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#5B21B6] to-[#6D28D9] px-6 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 active:scale-[0.98]"
          >
            List your property free
            <ArrowRight className="h-4 w-4" />
          </button>
        </Reveal>
      </section>
    </div>
  );
}
