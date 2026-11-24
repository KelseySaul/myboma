import { useState } from 'react';
import { ArrowRight, Building2, KeyRound, Search, Users } from 'lucide-react';
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
    label: 'Landlords & agents',
    icon: KeyRound,
    intro:
      'Use MyBoma to list vacant units, keep a record of every tenant and payment, and collect rent on M-Pesa without matching messages by hand.',
    steps: [
      {
        title: 'Create your account',
        body: 'Sign up and choose "Landlord / Owner". The Free plan covers one house unit and needs no payment. Paid plans add more units, buildings, the repairs hub and team access.',
      },
      {
        title: 'Tell us how you receive rent',
        body: 'Pick M-Pesa, bank or cash. Your payout details are only used for the rent your tenants pay and are never shown to them.',
      },
      {
        title: 'Add your property',
        body: 'Add each unit with its rent, location, photos and amenities. On paid plans you can group units under a building.',
      },
      {
        title: 'Publish vacant units',
        body: 'Units marked available appear on the public listings. House hunters can send you an enquiry, and you get their name, phone and email by email.',
      },
      {
        title: 'Invite your tenant',
        body: 'Create a lease with the tenant\'s email address. When they sign up with that email, the lease and invoices appear in their account.',
      },
      {
        title: 'Let invoicing run',
        body: 'Invoices are created every month. Reminders go out from three days before the due date and continue while rent is overdue. Record cash payments yourself so the ledger stays complete.',
      },
    ],
    tips: [
      'Put the agreed rent, deposit and due date in writing before the tenant moves in.',
      'Issue a receipt for every payment, including cash. MyBoma records M-Pesa and card payments automatically.',
      'Keep your rent records. Residential rental income in Kenya is taxable, and KRA expects landlords to declare it.',
      'Give notice in writing before entering a tenant\'s house, except in an emergency.',
    ],
  },
  tenants: {
    label: 'Tenants',
    icon: Users,
    intro:
      'If your landlord uses MyBoma, you can see what you owe, pay from your phone and keep every receipt in one place.',
    steps: [
      {
        title: 'Sign up with the email your landlord used',
        body: 'Your landlord adds you to a lease using your email address. Create your account with that same email and your lease appears automatically.',
      },
      {
        title: 'Check your invoice',
        body: 'Each month you get an invoice showing the amount and due date. You also get a reminder by email and app notification before it is due.',
      },
      {
        title: 'Pay by M-Pesa or card',
        body: 'Open the invoice and pay. For M-Pesa, a prompt appears on your phone; enter your PIN to confirm. The invoice is marked paid once the payment goes through.',
      },
      {
        title: 'Report repairs',
        body: 'If your landlord\'s plan includes the repairs hub, report problems in the app and follow them until they are fixed.',
      },
    ],
    tips: [
      'Always pay through the app or ask for a receipt, so there is a record of every payment.',
      'Read your lease before you sign. Check the rent, deposit, notice period and who pays for water and electricity.',
      'Take photos of the house when you move in. They help when the deposit is refunded.',
    ],
  },
  hunters: {
    label: 'House hunters',
    icon: Search,
    intro: 'Browse homes, offices and short stays across Kenya, and contact landlords directly. You do not need an account to ask about a listing.',
    steps: [
      {
        title: 'Search',
        body: 'Search by area or building name, and filter by homes, commercial spaces or short stays.',
      },
      {
        title: 'Open a listing',
        body: 'Tap any home to see photos, price, location, amenities and the description.',
      },
      {
        title: 'Send an enquiry',
        body: 'Enter your name, email and phone number. We email you a copy and send your details to the landlord, who will contact you about availability and viewing.',
      },
    ],
    tips: [
      'View the house in person before you pay anything.',
      'Never pay a deposit or "viewing fee" to someone you have not met or verified.',
      'Ask for a written lease and a receipt for every payment.',
    ],
  },
};

const PLAN_ORDER: SubscriptionTier[] = ['free', 'basic', 'starter', 'pro', 'proplus'];

export default function AboutPage({ onSignUp }: { onSignUp: () => void }) {
  const [guide, setGuide] = useState<GuideId>('landlords');
  const current = GUIDES[guide];

  return (
    <div className="bg-white">
      <section className="bg-zinc-950 px-4 pb-20 pt-36 text-white sm:px-6 sm:pb-28 sm:pt-44">
        <div className="mx-auto max-w-4xl animate-in fade-in slide-in-from-bottom-4 duration-700">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">About {tenantConfig.appName}</p>
          <h1 className="mt-4 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            Renting in Kenya, made simpler for everyone involved.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-300">
            MyBoma connects landlords, tenants and house hunters. Landlords list homes and collect rent. Tenants pay and keep their records. House hunters find a place and reach the landlord directly.
          </p>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-3">
          {[
            { icon: Search, title: 'Find', body: 'Public listings of homes, offices and short stays, posted by the people who manage them.' },
            { icon: Building2, title: 'Manage', body: 'Units, tenants, leases, invoices and repairs in one account, on any phone or computer.' },
            { icon: KeyRound, title: 'Get paid', body: 'Rent collected by M-Pesa or card, recorded against the right invoice automatically.' },
          ].map(({ icon: Icon, title, body }, index) => (
            <Reveal key={title} delay={index * 100} className="rounded-2xl border border-zinc-200 p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-950 text-white">
                <Icon className="h-5 w-5" />
              </span>
              <h2 className="mt-5 text-lg font-semibold text-zinc-950">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-600">{body}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="guides" className="scroll-mt-24 bg-zinc-50 px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <h2 className="text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-5xl">How to use MyBoma</h2>
            <p className="mt-3 text-base text-zinc-600">Pick who you are to see the steps.</p>
          </Reveal>

          <div role="tablist" aria-label="Guides" className="mt-8 flex flex-wrap gap-2">
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
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                    selected ? 'bg-zinc-950 text-white' : 'bg-white text-zinc-600 ring-1 ring-zinc-200 hover:text-zinc-950'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              );
            })}
          </div>

          <div key={guide} role="tabpanel" className="mt-10 grid gap-10 animate-in fade-in duration-500 lg:grid-cols-[1.5fr_1fr]">
            <div>
              <p className="max-w-2xl text-base leading-7 text-zinc-700">{current.intro}</p>
              <ol className="mt-8 space-y-4">
                {current.steps.map((step, index) => (
                  <li key={step.title} className="flex gap-4 rounded-2xl border border-zinc-200 bg-white p-5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-950 text-sm font-bold text-white">
                      {index + 1}
                    </span>
                    <div>
                      <h3 className="text-base font-semibold text-zinc-950">{step.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-zinc-600">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <aside className="h-fit rounded-2xl bg-zinc-950 p-6 text-white lg:sticky lg:top-28">
              <h3 className="text-base font-semibold">Good practice</h3>
              <ul className="mt-4 space-y-3">
                {current.tips.map((tip) => (
                  <li key={tip} className="flex gap-3 text-sm leading-6 text-zinc-300">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-white" />
                    {tip}
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-xs leading-5 text-zinc-500">General guidance only, not legal advice.</p>
            </aside>
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <h2 className="text-3xl font-extrabold tracking-tight text-zinc-950 sm:text-5xl">Plans for landlords</h2>
            <p className="mt-3 text-base text-zinc-600">
              Tenants and house hunters use MyBoma for free. Landlord plans are prepaid and never renew automatically.
            </p>
          </Reveal>
          <Reveal delay={100} className="mt-10 overflow-x-auto rounded-2xl border border-zinc-200">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Plan</th>
                  <th className="px-5 py-3 font-semibold">Monthly</th>
                  <th className="px-5 py-3 font-semibold">What you get</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {PLAN_ORDER.map((id) => {
                  const tier = SUBSCRIPTION_TIERS[id];
                  return (
                    <tr key={id}>
                      <td className="px-5 py-4 font-semibold text-zinc-950">{tier.label}</td>
                      <td className="px-5 py-4 tabular-nums text-zinc-950">
                        {tier.monthlyBaseKes === 0 ? 'Free' : formatPlanPrice(tier.monthlyBaseKes)}
                      </td>
                      <td className="px-5 py-4 text-zinc-600">{tier.highlights.join(' · ')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Reveal>
          <p className="mt-4 text-xs text-zinc-500">Quarterly and yearly prepaid periods cost less per month.</p>
        </div>
      </section>

      <section className="px-4 pb-20 sm:px-6 sm:pb-28">
        <Reveal className="mx-auto flex max-w-6xl flex-col gap-6 rounded-[2rem] bg-zinc-950 px-6 py-12 text-white sm:flex-row sm:items-center sm:justify-between sm:px-12">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight sm:text-4xl">Questions?</h2>
            <p className="mt-2 text-zinc-400">
              Email{' '}
              <a href={`mailto:${tenantConfig.supportEmail}`} className="font-semibold text-white underline underline-offset-4">
                {tenantConfig.supportEmail}
              </a>
              , or start with the free plan.
            </p>
          </div>
          <button
            type="button"
            onClick={onSignUp}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200"
          >
            List your property free
            <ArrowRight className="h-4 w-4" />
          </button>
        </Reveal>
      </section>
    </div>
  );
}
