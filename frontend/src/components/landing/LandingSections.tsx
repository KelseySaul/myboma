import { useState, type ReactNode } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  Building2,
  CalendarClock,
  Check,
  ChevronDown,
  CreditCard,
  FileText,
  Home,
  KeyRound,
  LayoutDashboard,
  MessageSquareWarning,
  Palette,
  PhoneCall,
  Receipt,
  Search,
  ShieldCheck,
  Smartphone,
  Users,
  Wallet,
  Wrench,
} from 'lucide-react';
import { tenantConfig } from '../../config/tenant';

/* Shared layout primitives ------------------------------------------------ */

function Eyebrow({ children, tone = 'light' }: { children: ReactNode; tone?: 'light' | 'dark' }) {
  return (
    <p
      className={`text-[11px] font-bold uppercase tracking-[0.18em] ${
        tone === 'dark' ? 'text-emerald-300' : 'text-emerald-700'
      }`}
    >
      {children}
    </p>
  );
}

function SectionHeading({
  eyebrow,
  title,
  body,
  align = 'center',
}: {
  eyebrow: string;
  title: ReactNode;
  body?: ReactNode;
  align?: 'center' | 'left';
}) {
  return (
    <div className={align === 'center' ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">{title}</h2>
      {body && <p className="mt-4 text-base leading-7 text-slate-600">{body}</p>}
    </div>
  );
}

/* Hero --------------------------------------------------------------------- */

interface HeroProps {
  onStartLandlord: () => void;
  onFindHome: () => void;
  onInstall: () => void;
}

export function LandingHero({ onStartLandlord, onFindHome, onInstall }: HeroProps) {
  return (
    <section className="relative overflow-hidden bg-white">
      {/* soft grid texture + glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] [background-size:48px_48px] [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]"
      />
      <div aria-hidden className="pointer-events-none absolute -top-40 right-0 h-[480px] w-[480px] rounded-full bg-emerald-200/40 blur-[120px]" />

      <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-4 pb-16 pt-14 sm:px-6 sm:pt-20 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:pb-24 lg:pt-24">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Built for Kenyan landlords, agents &amp; tenants
          </span>
          <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
            Collect rent on <span className="whitespace-nowrap">M-Pesa.</span>
            <br />
            <span className="text-emerald-600">Know who has paid.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">
            {tenantConfig.appName} sends every tenant an invoice, takes payment by M-Pesa or card, and keeps one
            ledger for your units, tenants, repairs and vacancies. No more scrolling through M-Pesa messages.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={onStartLandlord}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-slate-950 px-6 text-sm font-semibold text-white shadow-lg shadow-slate-950/10 transition hover:bg-slate-800 active:scale-[0.98]"
            >
              List your property
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onFindHome}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-6 text-sm font-semibold text-slate-900 transition hover:border-slate-400 hover:bg-slate-50 active:scale-[0.98]"
            >
              <Search className="h-4 w-4" />
              Find a house
            </button>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-slate-500">
            <span className="inline-flex items-center gap-2">
              <Check className="h-4 w-4 text-emerald-600" /> Plans from KES 100
            </span>
            <span className="inline-flex items-center gap-2">
              <Check className="h-4 w-4 text-emerald-600" /> Prepaid, never auto-renews
            </span>
            <button type="button" onClick={onInstall} className="inline-flex items-center gap-2 font-medium text-slate-700 hover:text-slate-950">
              <Smartphone className="h-4 w-4 text-emerald-600" /> Get the app
            </button>
          </div>
        </div>

        <HeroMockup />
      </div>
    </section>
  );
}

const MOCK_INVOICES = [
  { unit: 'Kilimani · B4', tenant: 'J. Wanjiru', amount: 'KES 37,700', status: 'paid' as const, note: 'M-Pesa · matched' },
  { unit: 'Westlands · 2BR', tenant: 'A. Otieno', amount: 'KES 38,000', status: 'paid' as const, note: 'Card · Pesapal' },
  { unit: 'Syokimau · C2', tenant: 'M. Kiptoo', amount: 'KES 18,500', status: 'due' as const, note: 'Reminder sent' },
];

function HeroMockup() {
  return (
    <div className="relative mx-auto w-full max-w-xl lg:mx-0" aria-label="Illustration of the MyBoma rent dashboard" role="img">
      {/* Desktop ledger card */}
      <div className="relative rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-900/10 sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">November rent</p>
            <p className="mt-1 text-2xl font-extrabold tabular-nums text-slate-950">KES 94,200</p>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">83% collected</span>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full w-[83%] rounded-full bg-emerald-500" />
        </div>

        <ul className="mt-5 divide-y divide-slate-100">
          {MOCK_INVOICES.map((invoice) => (
            <li key={invoice.unit} className="flex items-center justify-between gap-3 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    invoice.status === 'paid' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                  }`}
                >
                  {invoice.status === 'paid' ? <BadgeCheck className="h-4 w-4" /> : <CalendarClock className="h-4 w-4" />}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{invoice.unit}</p>
                  <p className="truncate text-xs text-slate-500">
                    {invoice.tenant} · {invoice.note}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold tabular-nums text-slate-900">{invoice.amount}</p>
                <p className={`text-xs font-medium ${invoice.status === 'paid' ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {invoice.status === 'paid' ? 'Paid' : 'Due in 3 days'}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Floating M-Pesa confirmation */}
      <div className="absolute -bottom-16 -left-2 hidden w-64 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl sm:block lg:-left-10">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-white">
            <Smartphone className="h-4 w-4" />
          </span>
          <div>
            <p className="text-xs font-semibold text-slate-900">M-Pesa payment received</p>
            <p className="text-xs text-slate-500">Invoice marked paid automatically</p>
          </div>
        </div>
      </div>

    </div>
  );
}

/* Trust strip -------------------------------------------------------------- */

export function TrustStrip() {
  const items = [
    { icon: Smartphone, label: 'M-Pesa STK Push' },
    { icon: CreditCard, label: 'Visa & Mastercard' },
    { icon: Wallet, label: 'Rent to your M-Pesa or bank' },
    { icon: Bell, label: 'Automatic rent reminders' },
    { icon: ShieldCheck, label: 'Data kept private per landlord' },
  ];
  return (
    <section className="border-y border-slate-200 bg-slate-50">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-10 gap-y-4 px-4 py-6 sm:px-6">
        {items.map(({ icon: Icon, label }) => (
          <span key={label} className="inline-flex items-center gap-2 text-sm font-medium text-slate-600">
            <Icon className="h-4 w-4 text-emerald-600" />
            {label}
          </span>
        ))}
      </div>
    </section>
  );
}

/* Problem → outcome -------------------------------------------------------- */

export function ProblemSolution() {
  const rows = [
    {
      icon: MessageSquareWarning,
      problem: 'Matching M-Pesa messages to tenants by hand',
      fix: 'Tenants pay from their invoice with an STK push, and the payment is recorded against the right unit.',
    },
    {
      icon: PhoneCall,
      problem: '“How much do I owe?” calls every month',
      fix: 'Every tenant has their own login with invoices, balances and receipts.',
    },
    {
      icon: CalendarClock,
      problem: 'Chasing arrears one tenant at a time',
      fix: 'Invoices are generated every month and reminders go out automatically from 3 days before the due date.',
    },
  ];
  return (
    <section className="bg-white px-4 py-20 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          eyebrow="Why landlords switch"
          title="Stop running your rentals from your phone's inbox"
          body="Most landlords track rent across M-Pesa messages, notebooks and WhatsApp. That's where money gets missed."
        />
        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {rows.map(({ icon: Icon, problem, fix }) => (
            <article key={problem} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-5 text-base font-semibold text-slate-950">{problem}</h3>
              <div className="mt-4 flex gap-3 border-t border-slate-100 pt-4">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <p className="text-sm leading-6 text-slate-600">{fix}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* Audience tabs ------------------------------------------------------------ */

type AudienceId = 'landlords' | 'agencies' | 'tenants' | 'hunters';

interface AudienceProps {
  onStartLandlord: () => void;
  onSignIn: () => void;
  onFindHome: () => void;
}

export function AudienceTabs({ onStartLandlord, onSignIn, onFindHome }: AudienceProps) {
  const [active, setActive] = useState<AudienceId>('landlords');

  const audiences: Record<
    AudienceId,
    { label: string; icon: typeof Home; title: string; points: string[]; cta: string; action: () => void; image: string }
  > = {
    landlords: {
      label: 'Landlords',
      icon: KeyRound,
      title: 'Your units, tenants and rent in one place',
      points: [
        'Add buildings and units, then invite tenants by email',
        'Monthly invoices and a running ledger for every tenant',
        'Choose to receive rent on M-Pesa, in your bank account or in cash',
      ],
      cta: 'List your property',
      action: onStartLandlord,
      image: '/screenshots/mobile-dashboard.webp',
    },
    agencies: {
      label: 'Agencies & managers',
      icon: Building2,
      title: 'Manage many landlords from one account',
      points: [
        'Add the landlords you manage and keep each portfolio separate',
        'Admin rights for your team, plus a maintenance hub for repairs',
        'Your own logo and colours with white-label branding (Pro Plus)',
      ],
      cta: 'See Pro Plus',
      action: () => document.getElementById('landlord-plans')?.scrollIntoView({ behavior: 'smooth' }),
      image: '/screenshots/mobile-insights.webp',
    },
    tenants: {
      label: 'Tenants',
      icon: Users,
      title: 'Pay rent in seconds, keep every receipt',
      points: [
        'Pay from your phone with an M-Pesa prompt or by card',
        'See your balance and payment history whenever you need it',
        'Report a repair and follow it until it is fixed',
      ],
      cta: 'Sign in to pay rent',
      action: onSignIn,
      image: '/screenshots/mobile-tenants.webp',
    },
    hunters: {
      label: 'House hunters',
      icon: Search,
      title: 'Find a house without the runaround',
      points: [
        'Browse rentals, commercial spaces and short stays',
        'Listings come straight from the landlord or their agent',
        'Save time with photos, prices and amenities up front',
      ],
      cta: 'Browse homes',
      action: onFindHome,
      image: '/screenshots/mobile-tenants.webp',
    },
  };

  const current = audiences[active];

  return (
    <section className="bg-slate-50 px-4 py-20 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-7xl">
        <SectionHeading eyebrow="Who it's for" title="One platform, four ways to use it" />

        <div role="tablist" aria-label="Audience" className="mx-auto mt-10 flex max-w-3xl flex-wrap justify-center gap-2">
          {(Object.keys(audiences) as AudienceId[]).map((id) => {
            const { label, icon: Icon } = audiences[id];
            const selected = id === active;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActive(id)}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                  selected ? 'bg-slate-950 text-white shadow' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:text-slate-950'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            );
          })}
        </div>

        <div role="tabpanel" className="mt-10 grid items-center gap-10 rounded-3xl border border-slate-200 bg-white p-6 sm:p-10 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <h3 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{current.title}</h3>
            <ul className="mt-6 space-y-4">
              {current.points.map((point) => (
                <li key={point} className="flex gap-3 text-base text-slate-600">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                    <Check className="h-3 w-3 text-emerald-700" />
                  </span>
                  {point}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={current.action}
              className="mt-8 inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white transition hover:bg-emerald-500 active:scale-[0.98]"
            >
              {current.cta}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <div className="flex justify-center">
            <div className="w-52 overflow-hidden rounded-[2rem] border-[6px] border-slate-950 bg-slate-950 shadow-2xl sm:w-60">
              <img src={current.image} alt={`${tenantConfig.appName} app for ${current.label.toLowerCase()}`} className="aspect-[390/844] w-full object-cover" width="390" height="844" loading="lazy" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* Feature bento ------------------------------------------------------------ */

export function FeatureGrid() {
  return (
    <section id="features" className="scroll-mt-16 bg-white px-4 py-20 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-7xl">
        <SectionHeading
          eyebrow="Features"
          title="Everything a rental business runs on"
          body="Start with rent collection. Add maintenance, automations and team access as your portfolio grows."
        />

        <div className="mt-14 grid gap-5 md:grid-cols-6">
          <article className="relative overflow-hidden rounded-3xl bg-slate-950 p-7 text-white md:col-span-4">
            <Receipt className="h-6 w-6 text-emerald-400" />
            <h3 className="mt-5 text-xl font-bold">Rent invoices &amp; collection</h3>
            <p className="mt-2 max-w-md text-sm leading-6 text-slate-300">
              Invoices are created every month for each lease. Tenants pay with an M-Pesa STK push or card, and the
              invoice is marked paid the moment the payment lands.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {['Monthly invoices', 'M-Pesa STK Push', 'Card payments', 'Receipts'].map((tag) => (
                <span key={tag} className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-slate-200">
                  {tag}
                </span>
              ))}
            </div>
            <div aria-hidden className="pointer-events-none absolute -bottom-16 -right-16 h-56 w-56 rounded-full bg-emerald-500/25 blur-3xl" />
          </article>

          <FeatureCard className="md:col-span-2" icon={Bell} title="Automatic reminders" body="Email and app notifications go out from 3 days before rent is due, and keep going while it is overdue." />
          <FeatureCard className="md:col-span-2" icon={Wrench} title="Maintenance hub" body="Tenants report repairs with details. You assign, track and close each request." />
          <FeatureCard className="md:col-span-2" icon={FileText} title="Leases & tenant records" body="Lease dates, rent amounts and every payment kept on one tenant profile." />
          <FeatureCard className="md:col-span-2" icon={LayoutDashboard} title="Portfolio dashboard" body="Collected vs. pending rent, occupancy, short-stay income and expenses at a glance." />
          <FeatureCard className="md:col-span-3" icon={Home} title="Vacancy listings" body="Publish vacant units to the public directory so house hunters can find and enquire about them." />
          <FeatureCard className="md:col-span-3" icon={Palette} title="Your brand, your team" body="Agencies on Pro Plus get admin rights for staff and white-label branding for their own clients." />
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ icon: Icon, title, body, className = '' }: { icon: typeof Home; title: string; body: string; className?: string }) {
  return (
    <article className={`rounded-3xl border border-slate-200 bg-slate-50/60 p-7 ${className}`}>
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-emerald-600 ring-1 ring-slate-200">
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="mt-5 text-base font-semibold text-slate-950">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
    </article>
  );
}

/* How it works ------------------------------------------------------------- */

export function HowItWorks() {
  const steps = [
    { title: 'Add your property', body: 'Create your buildings and units, and set the rent for each one.' },
    { title: 'Invite your tenants', body: 'Tenants get an email invite and their own account with their lease and invoices.' },
    { title: 'Get paid', body: 'Tenants pay by M-Pesa or card. You see who has paid, and reminders handle the rest.' },
  ];
  return (
    <section className="bg-slate-950 px-4 py-20 text-white sm:px-6 sm:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow tone="dark">How it works</Eyebrow>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Up and running in an afternoon</h2>
        </div>
        <ol className="mt-14 grid gap-6 md:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="rounded-3xl border border-white/10 bg-white/[0.04] p-7">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-sm font-bold text-slate-950">
                {index + 1}
              </span>
              <h3 className="mt-5 text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* Listings wrapper --------------------------------------------------------- */

export function ListingsSection({ children }: { children: ReactNode }) {
  return (
    <section id="homes" className="scroll-mt-16 bg-white px-2 py-20 sm:px-4 sm:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="px-2 sm:px-2">
          <SectionHeading
            align="left"
            eyebrow="Available now"
            title="Homes and spaces listed on MyBoma"
            body="Apartments, commercial spaces and short stays, listed by their landlords and agents. Sign in to enquire or book a viewing."
          />
        </div>
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}

/* FAQ ---------------------------------------------------------------------- */

export function Faq() {
  const items = [
    {
      q: 'How much does MyBoma cost?',
      a: 'Plans start at KES 100 a month for a single unit. Starter, Pro and Pro Plus add more listings, the maintenance hub, automations and agency features. Quarterly and yearly prepaid plans cost less per month.',
    },
    {
      q: 'Will I be charged automatically?',
      a: 'No. Every plan is prepaid for the period you choose and does not auto-renew. You are only charged when you approve a new payment.',
    },
    {
      q: 'How do tenants pay rent?',
      a: 'From their invoice in the app: an M-Pesa STK push appears on their phone, or they can pay by Visa or Mastercard. The payment is recorded against their invoice automatically.',
    },
    {
      q: 'Where does the rent money go?',
      a: 'You choose at sign-up: your M-Pesa number, your bank account, or cash. Your payout details are kept private and only used for the rent your tenants pay.',
    },
    {
      q: 'Do my tenants need to install anything?',
      a: 'No. MyBoma works in any phone browser. There is also an Android app and it can be added to the home screen on iPhone.',
    },
    {
      q: 'Is my data private?',
      a: 'Yes. Each landlord can only see their own properties and tenants, and that separation is enforced in the database itself, not just in the app.',
    },
  ];
  return (
    <section id="faq" className="scroll-mt-16 bg-slate-50 px-4 py-20 sm:px-6 sm:py-24">
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1fr_1.4fr]">
        <SectionHeading
          align="left"
          eyebrow="FAQ"
          title="Questions landlords ask us"
          body={
            <>
              Still unsure? Email{' '}
              <a className="font-semibold text-emerald-700 hover:text-emerald-600" href={`mailto:${tenantConfig.supportEmail}`}>
                {tenantConfig.supportEmail}
              </a>
              .
            </>
          }
        />
        <div className="divide-y divide-slate-200 rounded-3xl border border-slate-200 bg-white">
          {items.map((item) => (
            <details key={item.q} className="group px-6 py-5 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-base font-semibold text-slate-950">
                {item.q}
                <ChevronDown className="h-5 w-5 shrink-0 text-slate-400 transition group-open:rotate-180" />
              </summary>
              <p className="mt-3 text-sm leading-6 text-slate-600">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* Final CTA ---------------------------------------------------------------- */

export function FinalCta({ onStartLandlord, onFindHome, updates }: { onStartLandlord: () => void; onFindHome: () => void; updates: ReactNode }) {
  return (
    <section id="waitlist" className="scroll-mt-16 bg-white px-4 py-20 sm:px-6 sm:py-24">
      <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[2rem] bg-emerald-700 px-6 py-14 text-white sm:px-12 sm:py-16">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-400/40 blur-3xl" />
        <div className="relative grid gap-10 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Ready to stop chasing rent?</h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-emerald-50">
              Set up your first property today. Your tenants can pay by M-Pesa this month.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={onStartLandlord}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-50 active:scale-[0.98]"
              >
                List your property
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onFindHome}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/40 px-6 text-sm font-semibold text-white transition hover:bg-white/10 active:scale-[0.98]"
              >
                Find a house
              </button>
            </div>
          </div>
          <div className="rounded-2xl bg-white/10 p-5 ring-1 ring-white/20 backdrop-blur sm:p-6">{updates}</div>
        </div>
      </div>
    </section>
  );
}
