import { useState } from 'react';
import { ArrowRight, Building2, Check, KeyRound, Search, ShieldCheck, Smartphone, Sparkles, Users } from 'lucide-react';
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
      'Use MyBoma to list vacant units, monitor every unit’s paid and unpaid rent at a glance, send one-tap reminders, and collect rent on M-Pesa without matching SMS messages by hand.',
    steps: [
      {
        title: 'Create your account',
        body: 'Sign up and choose "Landlord / Owner". The Free plan covers one house unit and needs no payment. Paid plans unlock more units, buildings, the repairs hub and team manager access.',
      },
      {
        title: 'Choose how you receive rent',
        body: 'Pick M-Pesa, bank or cash. Your payout details are only used for the rent your tenants pay and are never shown publicly.',
      },
      {
        title: 'Add properties with camera or gallery',
        body: 'Add each unit with its rent, location, amenities and photos — upload from your device or snap pictures straight from your phone camera.',
      },
      {
        title: 'Publish vacant units',
        body: 'Units marked available appear on the public listings. House hunters send enquiries directly to your inbox with their name, phone and email.',
      },
      {
        title: 'Invite your tenants',
        body: 'Send an invite by email and assign their unit. Track unaccepted links on Pending invites — resend or cancel anytime.',
      },
      {
        title: 'Track payments & send reminders',
        body: 'Invoices generate automatically every month. See paid, due-soon and overdue units on your Rent Board and nudge unpaid tenants individually or all at once.',
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
        body: 'Each month you receive a clear invoice showing your rent amount and due date, plus friendly reminders before it is due.',
      },
      {
        title: 'Pay by M-Pesa or card',
        body: 'Open the invoice and pay. For M-Pesa, confirm the STK prompt on your phone — your invoice marks itself paid and generates a receipt.',
      },
      {
        title: 'Report repairs & track progress',
        body: 'Submit maintenance requests right from your phone and follow every update until fixed.',
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
    <div className="bg-white selection:bg-violet-200 selection:text-violet-950">
      {/* Atmospheric Purple Gradient Hero */}
      <section className="relative isolate overflow-hidden bg-[#120926] px-4 pb-16 pt-32 text-white sm:px-6 sm:pb-24 sm:pt-40">
        <img
          src="/hero/hero-2.webp"
          alt=""
          aria-hidden
          fetchPriority="high"
          decoding="async"
          className="pointer-events-none absolute inset-0 -z-20 h-full w-full scale-105 object-cover"
        />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-[#120926]/90 via-[#251152]/75 to-[#0E0720]/95" />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-96 w-[680px] -translate-x-1/2 rounded-full bg-gradient-to-r from-violet-600/35 via-purple-500/25 to-fuchsia-500/30 blur-3xl"
        />

        <div className="mx-auto max-w-5xl animate-in fade-in slide-in-from-bottom-4 duration-700">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-violet-100">
            <Sparkles className="h-3.5 w-3.5 text-fuchsia-300" />
            About {tenantConfig.appName}
          </span>
          <h1 className="mt-5 max-w-4xl text-3xl font-extrabold leading-[1.06] tracking-tight sm:text-5xl lg:text-6xl">
            Renting in Kenya, redesigned to be{' '}
            <span className="bg-gradient-to-r from-violet-200 via-purple-200 to-fuchsia-300 bg-clip-text text-transparent">
              transparent, fast and effortless.
            </span>
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-violet-100/80 sm:text-lg sm:leading-8">
            MyBoma brings landlords, property managers, tenants and house hunters onto one connected workspace — from discovering a home to automated M-Pesa rent collection and receipts.
          </p>

          <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { icon: Smartphone, stat: 'M-Pesa native', label: 'Automatic invoice matching & receipts' },
              { icon: ShieldCheck, stat: '3 roles, 1 system', label: 'Landlords, tenants & house hunters synced' },
              { icon: Building2, stat: 'Free to start', label: 'Manage your first unit at KES 0 forever' },
            ].map(({ icon: Icon, stat, label }) => (
              <div key={stat} className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/[0.08] p-4 backdrop-blur-xs">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-bold text-white">{stat}</p>
                  <p className="text-xs text-violet-200/80">{label}</p>
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
            { icon: Building2, title: 'Operate from any phone', body: 'Units, tenants, leases, pending invites, repairs and camera photo uploads built mobile-first.' },
            { icon: KeyRound, title: 'Collect rent without chasing', body: 'Track every unit’s paid, due-soon and overdue status in real time with M-Pesa and card payments.' },
          ].map(({ icon: Icon, title, body }, index) => (
            <Reveal
              key={title}
              delay={index * 80}
              className="rounded-2xl border border-[#221844]/[0.09] bg-white p-6 shadow-xs transition hover:border-violet-300 hover:shadow-md hover:shadow-violet-900/5"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-violet-700 via-purple-600 to-fuchsia-600 text-white shadow-sm shadow-violet-700/20">
                <Icon className="h-5 w-5" />
              </span>
              <h2 className="mt-5 text-lg font-bold text-[#161426]">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-[#5D5A73]">{body}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Role-Based Interactive Guides */}
      <section id="guides" className="scroll-mt-24 bg-[#F6F4FB] px-4 py-14 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <span className="inline-flex items-center rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-800">
              Step-by-step playbook
            </span>
            <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-[#161426] sm:text-5xl">
              How MyBoma works for you
            </h2>
            <p className="mt-2.5 text-sm text-[#5D5A73] sm:text-base">Choose your role to see the complete end-to-end flow.</p>
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
                      ? 'bg-gradient-to-r from-violet-700 via-purple-600 to-fuchsia-600 text-white shadow-md shadow-violet-700/20'
                      : 'bg-white text-[#5D5A73] ring-1 ring-[#221844]/10 hover:text-[#161426]'
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
              <p className="max-w-2xl text-sm leading-7 text-[#433E5B] sm:text-base">{current.intro}</p>
              <ol className="mt-6 space-y-3.5">
                {current.steps.map((step, index) => (
                  <li key={step.title} className="flex gap-3.5 rounded-2xl border border-[#221844]/[0.08] bg-white p-4 shadow-2xs sm:gap-4 sm:p-5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-700 to-fuchsia-600 text-xs font-bold text-white shadow-xs">
                      {index + 1}
                    </span>
                    <div>
                      <h3 className="text-sm font-bold text-[#161426] sm:text-base">{step.title}</h3>
                      <p className="mt-1 text-xs leading-5 text-[#5D5A73] sm:text-sm sm:leading-6">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <aside className="h-fit rounded-3xl bg-gradient-to-br from-[#1A0D36] via-[#3B1679] to-[#5B21B6] p-6 text-white shadow-xl shadow-violet-950/15 lg:sticky lg:top-28">
              <h3 className="text-base font-bold">Good practice</h3>
              <ul className="mt-4 space-y-3">
                {current.tips.map((tip) => (
                  <li key={tip} className="flex gap-3 text-sm leading-6 text-violet-100/90">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-fuchsia-300" />
                    {tip}
                  </li>
                ))}
              </ul>
              <p className="mt-6 border-t border-white/15 pt-4 text-xs leading-5 text-violet-200/70">
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
            <span className="inline-flex items-center rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700 ring-1 ring-violet-600/15">
              Transparent pricing
            </span>
            <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-[#161426] sm:text-5xl">
              Simple prepaid plans for landlords
            </h2>
            <p className="mt-2.5 max-w-2xl text-sm text-[#5D5A73] sm:text-base">
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
                      ? 'border-transparent bg-gradient-to-b from-[#1F1042] via-[#3B1679] to-[#5B21B6] text-white shadow-xl shadow-violet-900/20'
                      : 'border-[#221844]/[0.10] bg-white text-[#161426] shadow-2xs hover:border-violet-300'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-base font-bold">{tier.label}</h3>
                      {featured && (
                        <span className="rounded-full bg-fuchsia-400/25 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-fuchsia-200">
                          Popular
                        </span>
                      )}
                    </div>
                    <p className="mt-3 text-2xl font-extrabold tabular-nums">
                      {tier.monthlyBaseKes === 0 ? 'Free' : formatPlanPrice(tier.monthlyBaseKes)}
                      {tier.monthlyBaseKes > 0 && (
                        <span className={`text-xs font-medium ${featured ? 'text-violet-200' : 'text-[#5D5A73]'}`}>/mo</span>
                      )}
                    </p>
                    <ul className="mt-4 space-y-2 border-t pt-4 text-xs leading-5 border-current/10">
                      {tier.highlights.map((item) => (
                        <li key={item} className={`flex items-start gap-2 ${featured ? 'text-violet-100' : 'text-[#5D5A73]'}`}>
                          <Check className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${featured ? 'text-fuchsia-300' : 'text-violet-600'}`} />
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
                        ? 'bg-white text-[#1F1042] hover:bg-violet-50'
                        : 'bg-violet-50 text-violet-800 hover:bg-violet-100'
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
        <Reveal className="relative mx-auto flex max-w-6xl flex-col gap-6 overflow-hidden rounded-3xl bg-gradient-to-br from-[#1A0D36] via-[#4C1D95] to-[#7E22CE] px-6 py-10 text-white shadow-2xl shadow-violet-950/20 sm:flex-row sm:items-center sm:justify-between sm:px-12 sm:py-12">
          <div aria-hidden className="pointer-events-none absolute -right-16 -bottom-16 h-56 w-56 rounded-full bg-fuchsia-400/25 blur-3xl" />
          <div className="relative">
            <h2 className="text-2xl font-extrabold tracking-tight sm:text-4xl">Have questions or managing 20+ units?</h2>
            <p className="mt-2 text-sm text-violet-100/85 sm:text-base">
              Email{' '}
              <a href={`mailto:${tenantConfig.supportEmail}`} className="font-semibold text-white underline decoration-fuchsia-300 underline-offset-4">
                {tenantConfig.supportEmail}
              </a>
              , or create your free landlord account in under a minute.
            </p>
          </div>
          <button
            type="button"
            onClick={onSignUp}
            className="relative inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-6 text-sm font-semibold text-[#1A0D36] shadow-lg transition hover:bg-violet-50 active:scale-[0.98]"
          >
            List your property free
            <ArrowRight className="h-4 w-4" />
          </button>
        </Reveal>
      </section>
    </div>
  );
}
