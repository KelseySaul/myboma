import { useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  HelpCircle,
  Home,
  KeyRound,
  Loader2,
  Mail,
  MessageSquare,
  Phone,
  RotateCcw,
  Send,
  Sparkles,
  Users,
  Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import { submitPublicContact } from '../lib/api';
import { tenantConfig } from '../config/tenant';

type Step = 1 | 2 | 3 | 4 | 5 | 6;

interface OptionItem {
  id: string;
  label: string;
  description: string;
  icon: typeof KeyRound;
}

const ROLE_OPTIONS: OptionItem[] = [
  { id: 'landlord', label: 'Landlord / Property Owner', description: 'I own rental units or apartments', icon: KeyRound },
  { id: 'agency', label: 'Property Manager / Agency', description: 'I manage units on behalf of landlords', icon: Building2 },
  { id: 'tenant', label: 'Tenant', description: 'I rent a home listed or billed on MyBoma', icon: Users },
  { id: 'hunter', label: 'House Hunter', description: 'I am looking for a home or space to rent', icon: Home },
  { id: 'partner', label: 'Partner / Enterprise', description: 'Custom integration, press, or partnership', icon: Sparkles },
];

const TOPIC_OPTIONS: OptionItem[] = [
  { id: 'plans', label: 'Pricing, plans & onboarding', description: 'Choosing a prepaid plan or getting set up', icon: Sparkles },
  { id: 'payments', label: 'M-Pesa, Pesapal & rent payments', description: 'Rent collection, payout routing, or receipts', icon: CreditCard },
  { id: 'support', label: 'Account or technical support', description: 'Login, invite links, or troubleshooting', icon: Wrench },
  { id: 'agency_setup', label: 'Property manager / agency setup', description: 'Inviting landlords & multi-building portfolios', icon: Building2 },
  { id: 'listing', label: 'Listing a property or enquiry help', description: 'Publishing vacancies or reaching a landlord', icon: Home },
  { id: 'other', label: 'General question', description: 'Anything else you want to ask our team', icon: HelpCircle },
];

const DETAIL_OPTIONS_BY_TOPIC: Record<string, { label: string; description: string }[]> = {
  plans: [
    { label: '1–2 units (Free plan)', description: 'Getting started with 1 building' },
    { label: '3–10 units (Starter)', description: 'Small plot or residential court' },
    { label: '11–20 units (Pro)', description: 'Apartment block with caretaker access' },
    { label: '20+ units or Agency / Enterprise', description: 'Large portfolio or custom prepaid tier' },
  ],
  payments: [
    { label: 'M-Pesa or Pesapal rent checkout', description: 'Setting up or troubleshooting rent payments' },
    { label: 'Landlord subscription payment or receipt', description: 'Plan renewal, activation, or billing receipt' },
    { label: 'Payout routing (M-Pesa / Bank / Cash)', description: 'Where tenant rent settles' },
    { label: 'Arrears, advance rent, or invoice dates', description: 'Adjusting tenant balances or due dates' },
  ],
  support: [
    { label: 'Sign in, Google login, or SMS OTP', description: 'Trouble signing into my account' },
    { label: 'Invitation link or email issue', description: 'Accepting or resending a setup link' },
    { label: 'Caretaker or tenant permissions', description: 'Managing access on buildings and units' },
    { label: 'Bug report or feature feedback', description: 'Something did not work as expected' },
  ],
  agency_setup: [
    { label: 'Onboarding 1–5 landlords', description: 'Small agency getting started' },
    { label: 'Onboarding 6–20 landlords', description: 'Growing management firm' },
    { label: '20+ landlords / custom branding', description: 'Whitelabel logo, colours & enterprise support' },
    { label: 'Request a live walkthrough', description: 'Walk our team through agency features' },
  ],
  listing: [
    { label: 'Help listing my vacant units', description: 'Photos, pricing, or publishing' },
    { label: 'Question about a specific listing', description: 'Availability or landlord contact' },
    { label: 'Report an inaccurate listing', description: 'Flag outdated price or unavailable unit' },
    { label: 'Short-stay / commercial space enquiry', description: 'Offices, retail, or furnished stays' },
  ],
  other: [
    { label: 'Demo or product walkthrough', description: 'See how MyBoma works for my team' },
    { label: 'Business partnership or integration', description: 'Payments, banking, or estate partners' },
    { label: 'Feedback or suggestion', description: 'Share an idea for MyBoma' },
    { label: 'General support question', description: 'Speak directly with support' },
  ],
};

const URGENCY_OPTIONS = [
  { label: 'Normal (within 24 hours)', description: 'Standard response from our support desk' },
  { label: 'Urgent (today)', description: 'Time-sensitive payment or access issue' },
  { label: 'Just exploring', description: 'No rush — comparing options for later' },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ContactPage() {
  const [step, setStep] = useState<Step>(1);
  const [role, setRole] = useState('');
  const [topicId, setTopicId] = useState('');
  const [topicLabel, setTopicLabel] = useState('');
  const [detail, setDetail] = useState('');
  const [urgency, setUrgency] = useState('');
  const [preferredContact, setPreferredContact] = useState<'Email' | 'Email & Phone call'>('Email');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticketRef, setTicketRef] = useState<string | null>(null);

  const detailOptions = DETAIL_OPTIONS_BY_TOPIC[topicId] ?? DETAIL_OPTIONS_BY_TOPIC.other;
  const progressPct = step >= 6 ? 100 : Math.round(((step - 1) / 5) * 100);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim();

    if (cleanName.length < 2) {
      setError('Please enter your name so we know who we are replying to.');
      return;
    }
    if (!EMAIL_RE.test(cleanEmail)) {
      setError('Please enter a valid email address so we can send your confirmation and reply.');
      return;
    }
    if (preferredContact === 'Email & Phone call' && cleanPhone.replace(/[^\d]/g, '').length < 9) {
      setError('Please enter your phone number for a callback, or switch to Email reply.');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const res = await submitPublicContact({
        role,
        topic: topicLabel,
        detail,
        urgency,
        preferredContact,
        name: cleanName,
        email: cleanEmail,
        phone: cleanPhone || undefined,
        note: note.trim() || undefined,
      });
      setTicketRef(res.ticketRef);
      setStep(6);
      toast.success('Enquiry sent! Check your email for confirmation.');
    } catch (err: any) {
      setError(err?.message || 'Could not send your enquiry. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const resetFlow = () => {
    setStep(1);
    setRole('');
    setTopicId('');
    setTopicLabel('');
    setDetail('');
    setUrgency('');
    setPreferredContact('Email');
    setName('');
    setEmail('');
    setPhone('');
    setNote('');
    setShowNote(false);
    setError(null);
    setTicketRef(null);
  };

  const summaryChips = [
    role ? { step: 1 as Step, text: role } : null,
    topicLabel ? { step: 2 as Step, text: topicLabel } : null,
    detail ? { step: 3 as Step, text: detail } : null,
    urgency ? { step: 4 as Step, text: urgency } : null,
  ].filter(Boolean) as { step: Step; text: string }[];

  return (
    <div className="min-h-screen bg-[#F8F8FA] selection:bg-violet-200 selection:text-zinc-950">
      {/* Compact Photographic Hero Header */}
      <section className="relative isolate overflow-hidden bg-zinc-950 px-4 pb-16 pt-28 text-white sm:px-6 sm:pb-20 sm:pt-36">
        <img
          src="/hero/hero-4.webp"
          alt=""
          aria-hidden
          fetchPriority="high"
          decoding="async"
          className="pointer-events-none absolute inset-0 -z-20 h-full w-full scale-105 object-cover"
        />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-black/75 via-black/60 to-black/85" />

        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">
            How can we help you?
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-zinc-300 sm:text-base sm:leading-7">
            Tap a few quick options below — no long forms. Our team at{' '}
            <a href={`mailto:${tenantConfig.supportEmail}`} className="font-semibold text-white underline decoration-violet-400 underline-offset-4">
              {tenantConfig.supportEmail}
            </a>{' '}
            will follow up directly and send you an instant email confirmation.
          </p>
        </div>
      </section>

      {/* Interactive Guided Flow Card */}
      <section className="-mt-8 px-4 pb-20 sm:px-6">
        <div className="mx-auto max-w-2xl rounded-3xl border border-zinc-200/90 bg-white shadow-xl shadow-zinc-950/5 overflow-hidden">
          {/* Progress Bar */}
          <div className="border-b border-zinc-100 bg-zinc-50/70 px-6 py-4 sm:px-8">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                {step > 1 && step < 6 && (
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setStep((prev) => (prev > 1 ? ((prev - 1) as Step) : 1));
                    }}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back
                  </button>
                )}
                <span className="text-xs font-semibold text-zinc-500">
                  {step === 6 ? 'Completed' : `Step ${step} of 5`}
                </span>
              </div>
              <span className="text-xs font-medium text-zinc-400 tabular-nums">{progressPct}%</span>
            </div>

            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200/80">
              <div
                className="h-full rounded-full bg-[#5B21B6] transition-all duration-300"
                style={{ width: `${Math.max(progressPct, step === 1 ? 15 : progressPct)}%` }}
              />
            </div>

            {/* Interactive Breadcrumb Chips — tap any earlier choice to change it */}
            {summaryChips.length > 0 && step < 6 && (
              <div className="mt-3.5 flex flex-wrap gap-1.5">
                {summaryChips.map((chip) => (
                  <button
                    key={chip.step}
                    type="button"
                    onClick={() => {
                      setError(null);
                      setStep(chip.step);
                    }}
                    title="Click to change this choice"
                    className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-800 transition hover:bg-violet-100"
                  >
                    <CheckCircle2 className="h-3 w-3 text-violet-600" />
                    {chip.text}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="p-6 sm:p-8">
            {/* STEP 1: Who are you? */}
            {step === 1 && (
              <div className="space-y-5 animate-in fade-in slide-in-from-right-2 duration-200">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-zinc-950 sm:text-2xl">
                    First, which best describes you?
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500">Tap an option to continue.</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {ROLE_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    const selected = role === opt.label;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setRole(opt.label);
                          setStep(2);
                        }}
                        className={`group flex items-start gap-3.5 rounded-2xl border p-4 text-left transition ${
                          selected
                            ? 'border-[#5B21B6] bg-violet-50/70 ring-1 ring-[#5B21B6]'
                            : 'border-zinc-200 bg-white hover:border-violet-400 hover:bg-violet-50/30'
                        }`}
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-800 transition group-hover:bg-[#5B21B6] group-hover:text-white">
                          <Icon className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-zinc-950">{opt.label}</span>
                          <span className="mt-0.5 block text-xs leading-5 text-zinc-500">{opt.description}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* STEP 2: What do you need help with? */}
            {step === 2 && (
              <div className="space-y-5 animate-in fade-in slide-in-from-right-2 duration-200">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-zinc-950 sm:text-2xl">
                    What can we help you with?
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500">Choose the topic closest to your enquiry.</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {TOPIC_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    const selected = topicId === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setTopicId(opt.id);
                          setTopicLabel(opt.label);
                          setDetail('');
                          setStep(3);
                        }}
                        className={`group flex items-start gap-3.5 rounded-2xl border p-4 text-left transition ${
                          selected
                            ? 'border-[#5B21B6] bg-violet-50/70 ring-1 ring-[#5B21B6]'
                            : 'border-zinc-200 bg-white hover:border-violet-400 hover:bg-violet-50/30'
                        }`}
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-800 transition group-hover:bg-[#5B21B6] group-hover:text-white">
                          <Icon className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-zinc-950">{opt.label}</span>
                          <span className="mt-0.5 block text-xs leading-5 text-zinc-500">{opt.description}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* STEP 3: Context-aware predetermined follow-up */}
            {step === 3 && (
              <div className="space-y-5 animate-in fade-in slide-in-from-right-2 duration-200">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-zinc-950 sm:text-2xl">
                    Tell us a bit more
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    Pick the option that best matches your {topicLabel.toLowerCase()} enquiry.
                  </p>
                </div>

                <div className="grid gap-3">
                  {detailOptions.map((opt) => {
                    const selected = detail === opt.label;
                    return (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() => {
                          setDetail(opt.label);
                          setStep(4);
                        }}
                        className={`group flex items-center justify-between gap-4 rounded-2xl border p-4 text-left transition ${
                          selected
                            ? 'border-[#5B21B6] bg-violet-50/70 ring-1 ring-[#5B21B6]'
                            : 'border-zinc-200 bg-white hover:border-violet-400 hover:bg-violet-50/30'
                        }`}
                      >
                        <div>
                          <span className="block text-sm font-bold text-zinc-950">{opt.label}</span>
                          <span className="mt-0.5 block text-xs text-zinc-500">{opt.description}</span>
                        </div>
                        <ArrowRight className="h-4 w-4 shrink-0 text-zinc-400 transition group-hover:translate-x-1 group-hover:text-[#5B21B6]" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* STEP 4: Urgency & preferred reply channel */}
            {step === 4 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-200">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-zinc-950 sm:text-2xl">
                    How soon &amp; how should we reply?
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500">Choose your reply preference, then tap a priority level.</p>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  {(['Email', 'Email & Phone call'] as const).map((channel) => {
                    const selected = preferredContact === channel;
                    return (
                      <button
                        key={channel}
                        type="button"
                        onClick={() => setPreferredContact(channel)}
                        className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-xs font-semibold transition sm:text-sm ${
                          selected
                            ? 'border-zinc-950 bg-zinc-950 text-white'
                            : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400'
                        }`}
                      >
                        {channel === 'Email' ? <Mail className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
                        {channel}
                      </button>
                    );
                  })}
                </div>

                <div className="grid gap-3">
                  {URGENCY_OPTIONS.map((opt) => {
                    const selected = urgency === opt.label;
                    return (
                      <button
                        key={opt.label}
                        type="button"
                        onClick={() => {
                          setUrgency(opt.label);
                          setStep(5);
                        }}
                        className={`group flex items-center justify-between gap-4 rounded-2xl border p-4 text-left transition ${
                          selected
                            ? 'border-[#5B21B6] bg-violet-50/70 ring-1 ring-[#5B21B6]'
                            : 'border-zinc-200 bg-white hover:border-violet-400 hover:bg-violet-50/30'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700 transition group-hover:bg-[#5B21B6] group-hover:text-white">
                            <Clock className="h-4 w-4" />
                          </span>
                          <div>
                            <span className="block text-sm font-bold text-zinc-950">{opt.label}</span>
                            <span className="mt-0.5 block text-xs text-zinc-500">{opt.description}</span>
                          </div>
                        </div>
                        <ArrowRight className="h-4 w-4 shrink-0 text-zinc-400 transition group-hover:translate-x-1 group-hover:text-[#5B21B6]" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* STEP 5: Type ONLY your Name & Email (plus phone if callback requested) */}
            {step === 5 && (
              <form onSubmit={handleSubmit} noValidate className="space-y-5 animate-in fade-in slide-in-from-right-2 duration-200">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-zinc-950 sm:text-2xl">
                    Last step — where should we reply?
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    Just enter your name and email. We&apos;ll send you an instant confirmation and our team will reach out.
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label htmlFor="contact-name" className="text-xs font-semibold text-zinc-700">
                      Your name *
                    </label>
                    <input
                      id="contact-name"
                      type="text"
                      autoComplete="name"
                      required
                      placeholder="e.g. Jane Wanjiku"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="h-12 w-full rounded-xl border border-zinc-200 bg-white px-4 text-sm text-zinc-950 outline-none transition focus:border-[#5B21B6] focus:ring-2 focus:ring-violet-500/15"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="contact-email" className="text-xs font-semibold text-zinc-700">
                      Your email *
                    </label>
                    <input
                      id="contact-email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      required
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-12 w-full rounded-xl border border-zinc-200 bg-white px-4 text-sm text-zinc-950 outline-none transition focus:border-[#5B21B6] focus:ring-2 focus:ring-violet-500/15"
                    />
                  </div>
                </div>

                {preferredContact === 'Email & Phone call' && (
                  <div className="space-y-1.5">
                    <label htmlFor="contact-phone" className="text-xs font-semibold text-zinc-700">
                      Phone number for callback *
                    </label>
                    <input
                      id="contact-phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="e.g. 0712 345 678"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="h-12 w-full rounded-xl border border-zinc-200 bg-white px-4 text-sm text-zinc-950 outline-none transition focus:border-[#5B21B6] focus:ring-2 focus:ring-violet-500/15"
                    />
                  </div>
                )}

                {!showNote ? (
                  <button
                    type="button"
                    onClick={() => setShowNote(true)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-700 hover:underline"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    Add a short extra note (optional)
                  </button>
                ) : (
                  <div className="space-y-1.5">
                    <label htmlFor="contact-note" className="text-xs font-semibold text-zinc-700">
                      Extra note (optional)
                    </label>
                    <textarea
                      id="contact-note"
                      rows={3}
                      maxLength={1000}
                      placeholder="Any property name, receipt number, or quick context…"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      className="w-full rounded-xl border border-zinc-200 bg-white p-3.5 text-sm text-zinc-950 outline-none transition focus:border-[#5B21B6] focus:ring-2 focus:ring-violet-500/15"
                    />
                  </div>
                )}

                {error && (
                  <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#5B21B6] px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-[#4C1D95] disabled:opacity-60"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {submitting ? 'Sending to MyBoma Support…' : 'Send to MyBoma Support'}
                </button>
              </form>
            )}

            {/* STEP 6: Sent Confirmation */}
            {step === 6 && (
              <div className="py-4 text-center space-y-5 animate-in fade-in zoom-in-95 duration-200">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
                  <CheckCircle2 className="h-7 w-7" />
                </div>
                <div>
                  <h2 className="text-2xl font-extrabold tracking-tight text-zinc-950">
                    We&apos;ve got your message
                  </h2>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-600">
                    We&apos;ve sent a confirmation email to <strong className="text-zinc-950">{email}</strong> and forwarded your enquiry to{' '}
                    <strong className="text-zinc-950">{tenantConfig.supportEmail}</strong>. Our team will be in touch shortly.
                  </p>
                </div>

                {ticketRef && (
                  <div className="mx-auto max-w-md rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-left text-xs space-y-1.5">
                    <div className="flex items-center justify-between border-b border-zinc-200/80 pb-2">
                      <span className="font-semibold text-zinc-500">Reference</span>
                      <span className="font-mono font-bold text-zinc-950">{ticketRef}</span>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-zinc-500">Topic</span>
                      <span className="font-semibold text-zinc-900">{topicLabel}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-500">Detail</span>
                      <span className="font-semibold text-zinc-900">{detail}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-500">Priority</span>
                      <span className="font-semibold text-zinc-900">{urgency}</span>
                    </div>
                  </div>
                )}

                <div className="flex flex-col justify-center gap-2.5 pt-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={resetFlow}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-5 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Send another enquiry
                  </button>
                  <a
                    href="/"
                    className="inline-flex h-11 items-center justify-center rounded-xl bg-zinc-950 px-6 text-sm font-semibold text-white transition hover:bg-zinc-800"
                  >
                    Back to MyBoma
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
