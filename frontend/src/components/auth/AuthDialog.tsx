import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ConfirmationResult } from 'firebase/auth';
import { ArrowLeft, Building2, Home, KeyRound, Mail, MailCheck, Phone, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  authClient,
  getAuthPersistence,
  getLastAuthHints,
  getLastAuthMethod,
  setAuthPersistence,
  setLastAuthMethod,
  type LastAuthMethod,
} from '../../lib/auth-client';
import { exchangeFirebaseGoogleToken, exchangeFirebasePhoneToken } from '../../lib/api';
import {
  clearPhoneRecaptcha,
  FIREBASE_PROJECT_ID,
  isFirebasePhoneConfigured,
  sendFirebasePhoneOtp,
  signInWithFirebaseGoogle,
  verifyFirebasePhoneOtp,
} from '../../lib/firebase';
import { LEGAL_DOCUMENTS, PRIVACY_VERSION, TERMS_VERSION } from '../../../../shared/legalDocuments';
import { PENDING_LANDLORD_SUBSCRIPTION_KEY, type PendingLandlordSubscription } from '../../../../shared/landlordSubscription';
import LandlordSignupFields, { defaultLandlordSignupState } from '../LandlordSignupFields';
import { tenantConfig } from '../../config/tenant';
import { Field, GoogleLogo, PasswordInput, SubmitButton, friendlyAuthError, inputClass } from './fields';

export type AuthMode = 'signin' | 'signup';
export type SignupRole = 'landlord' | 'hunter';

export interface AuthIntent {
  mode: AuthMode;
  role?: SignupRole;
}

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  intent: AuthIntent;
}

type View = AuthMode | 'forgot' | 'forgot-sent' | 'terms' | 'privacy';
type AuthMethod = 'email' | 'phone';
type Errors = Partial<Record<'name' | 'phone' | 'email' | 'password' | 'confirm' | 'otp' | 'terms' | 'payout' | 'form', string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (value: string) => value.normalize('NFKC').replace(/<[^>]*>/g, '').trim();
const cleanPhone = (value: string) => clean(value).replace(/[^\d+]/g, '');
const OTP_COOLDOWN_SECONDS = 60;
const RESET_COOLDOWN_SECONDS = 60;
const COOLDOWN_STORAGE_PREFIX = 'myboma_auth_cooldown_';

const readCooldownRemaining = (key: string): number => {
  try {
    const until = Number(sessionStorage.getItem(`${COOLDOWN_STORAGE_PREFIX}${key}`) || '0');
    return until > Date.now() ? Math.ceil((until - Date.now()) / 1000) : 0;
  } catch {
    return 0;
  }
};

const writeCooldown = (key: string, seconds: number) => {
  try {
    sessionStorage.setItem(`${COOLDOWN_STORAGE_PREFIX}${key}`, String(Date.now() + seconds * 1000));
  } catch {
    /* storage unavailable */
  }
};

const recordTermsAcceptance = () => {
  const acceptance = { acceptedAt: new Date().toISOString(), termsVersion: TERMS_VERSION, privacyVersion: PRIVACY_VERSION };
  try {
    localStorage.setItem('myboma_agreed_terms', 'true');
    localStorage.setItem('myboma_terms_acceptance', JSON.stringify(acceptance));
  } catch {
    /* storage unavailable */
  }
  return acceptance;
};

export default function AuthDialog({ open, onOpenChange, intent }: AuthDialogProps) {
  const [view, setView] = useState<View>(intent.mode);
  const [lastAuthMethod, setLastAuthMethodState] = useState<LastAuthMethod | null>(() => getLastAuthMethod());
  const [method, setMethod] = useState<AuthMethod>(() => (getLastAuthMethod() === 'phone' ? 'phone' : 'email'));
  const [role, setRole] = useState<SignupRole>(intent.role ?? 'hunter');
  const [accountTrack, setAccountTrack] = useState<'landlord' | 'agency' | 'hunter'>(intent.role === 'landlord' ? 'landlord' : 'hunter');
  const [landlord, setLandlord] = useState<PendingLandlordSubscription>(defaultLandlordSignupState);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpTargetPhone, setOtpTargetPhone] = useState<string | null>(null);
  const [otpConfirmation, setOtpConfirmation] = useState<ConfirmationResult | null>(null);
  const [rememberMe, setRememberMe] = useState(() => getAuthPersistence());
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState<'email' | 'google' | 'reset' | 'otp-send' | 'otp-verify' | null>(null);
  const [otpCooldown, setOtpCooldown] = useState<number>(() => readCooldownRemaining('otp'));
  const [resetCooldown, setResetCooldown] = useState<number>(() => readCooldownRemaining('reset'));
  const inFlight = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (otpCooldown <= 0 && resetCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setOtpCooldown((prev) => (prev > 1 ? prev - 1 : 0));
      setResetCooldown((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [otpCooldown > 0, resetCooldown > 0]);

  useEffect(() => {
    if (!open) {
      clearPhoneRecaptcha();
      setOtpConfirmation(null);
      setOtpTargetPhone(null);
      setOtpCode('');
      return;
    }
    setView(intent.mode);
    const savedMethod = getLastAuthMethod();
    const hints = getLastAuthHints();
    setLastAuthMethodState(savedMethod);
    if (intent.mode === 'signin') {
      setMethod(savedMethod === 'phone' ? 'phone' : 'email');
      if (savedMethod === 'email' && hints.email && !email) setEmail(hints.email);
      if (savedMethod === 'phone' && hints.phone && !phone) setPhone(hints.phone);
    }
    if (intent.role) {
      setRole(intent.role);
      setAccountTrack(intent.role === 'landlord' ? 'landlord' : 'hunter');
    }
    setErrors({});
  }, [open, intent.mode, intent.role]);

  const isSignup = view === 'signup';
  const formView: AuthMode = view === 'signup' ? 'signup' : 'signin';

  const switchMode = (mode: AuthMode) => {
    setView(mode);
    setOtpConfirmation(null);
    setOtpTargetPhone(null);
    setOtpCode('');
    setErrors({});
  };

  const switchMethod = (nextMethod: AuthMethod) => {
    setMethod(nextMethod);
    setOtpConfirmation(null);
    setOtpTargetPhone(null);
    setOtpCode('');
    setErrors({});
  };

  const validateEmailForm = (): Errors => {
    const next: Errors = {};
    if (!EMAIL_RE.test(clean(email))) next.email = 'Enter a valid email address.';
    if (!password) next.password = 'Enter your password.';
    if (isSignup) {
      if (clean(name).length < 2) next.name = 'Enter your full name.';
      if (cleanPhone(phone).replace('+', '').length < 9) next.phone = 'Enter a phone number, e.g. 0712 345 678.';
      if (password && password.length < 8) next.password = 'Use at least 8 characters.';
      if (confirm !== password) next.confirm = 'Passwords do not match.';
      if (!agreed) next.terms = 'Accept the terms to create an account.';
      if (role === 'landlord') {
        if (landlord.rentPayoutMethod === 'mpesa' && !landlord.mpesaSettlementPhone?.trim()) {
          next.payout = 'Enter the M-Pesa number where you receive rent.';
        }
        if (landlord.rentPayoutMethod === 'bank' && (!landlord.bankName?.trim() || !landlord.bankAccountNumber?.trim() || !landlord.bankAccountName?.trim())) {
          next.payout = 'Complete your bank details.';
        }
      }
    }
    return next;
  };

  const submitEmail = async (event: FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return;
    const found = validateEmailForm();
    setErrors(found);
    if (Object.keys(found).length) return;

    inFlight.current = true;
    setBusy('email');
    setAuthPersistence(isSignup ? true : rememberMe);
    try {
      if (!isSignup) {
        const normalizedEmail = clean(email).toLowerCase();
        const { error } = await authClient.signIn.email({ email: normalizedEmail, password, rememberMe });
        if (error) {
          setErrors({ form: friendlyAuthError(error, 'Could not sign you in. Try again.') });
          return;
        }
        setLastAuthMethod('email', { email: normalizedEmail });
        setLastAuthMethodState('email');
        onOpenChange(false);
        return;
      }

      if (role === 'landlord') localStorage.setItem(PENDING_LANDLORD_SUBSCRIPTION_KEY, JSON.stringify(landlord));
      const terms = recordTermsAcceptance();
      const normalizedEmail = clean(email).toLowerCase();
      const { error } = await authClient.signUp.email({
        email: normalizedEmail,
        password,
        name: clean(name),
        rememberMe: true,
        phone: cleanPhone(phone),
        intended_role: role,
        terms_accepted_at: terms.acceptedAt,
        terms_version: terms.termsVersion,
        privacy_version: terms.privacyVersion,
      } as Parameters<typeof authClient.signUp.email>[0]);
      if (error) {
        setErrors({ form: friendlyAuthError(error, 'Could not create your account. Try again.') });
        return;
      }
      setLastAuthMethod('email', { email: normalizedEmail });
      setLastAuthMethodState('email');
      toast.success(
        role === 'landlord'
          ? landlord.tier === 'free'
            ? 'Account created. Confirm your free plan on the next screen to enter your workspace.'
            : 'Account created. Complete payment on the next screen to unlock your workspace.'
          : 'Account created.',
      );
      onOpenChange(false);
    } catch {
      setErrors({ form: 'Something went wrong. Check your connection and try again.' });
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  const handleSendOtp = async (event: FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return;
    if (otpCooldown > 0) {
      setErrors({ form: `Please wait ${otpCooldown}s before requesting another SMS code.` });
      return;
    }
    const next: Errors = {};
    if (cleanPhone(phone).replace('+', '').length < 9) {
      next.phone = 'Enter a valid phone number, e.g. 0712 345 678.';
    }
    if (isSignup) {
      if (clean(name).length < 2) next.name = 'Enter your full name.';
      if (clean(email) && !EMAIL_RE.test(clean(email))) next.email = 'Enter a valid email address or leave blank.';
      if (!agreed) next.terms = 'Accept the terms to create an account.';
      if (role === 'landlord') {
        if (landlord.rentPayoutMethod === 'mpesa' && !landlord.mpesaSettlementPhone?.trim()) {
          next.payout = 'Enter the M-Pesa number where you receive rent.';
        }
        if (landlord.rentPayoutMethod === 'bank' && (!landlord.bankName?.trim() || !landlord.bankAccountNumber?.trim() || !landlord.bankAccountName?.trim())) {
          next.payout = 'Complete your bank details.';
        }
      }
    }
    setErrors(next);
    if (Object.keys(next).length) return;

    inFlight.current = true;
    setBusy('otp-send');
    try {
      const { e164Phone, confirmation } = await sendFirebasePhoneOtp(phone, 'firebase-recaptcha-container');
      setOtpConfirmation(confirmation);
      setOtpTargetPhone(e164Phone);
      setOtpCode('');
      setErrors({});
      writeCooldown('otp', OTP_COOLDOWN_SECONDS);
      setOtpCooldown(OTP_COOLDOWN_SECONDS);
      toast.success(`Verification code sent to ${e164Phone}`);
    } catch (err: any) {
      setErrors({ form: err?.message || 'Could not send SMS code.' });
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  const handleVerifyOtp = async (event: FormEvent) => {
    event.preventDefault();
    if (inFlight.current || !otpConfirmation) return;
    if (otpCode.replace(/\D/g, '').length !== 6) {
      setErrors({ otp: 'Enter the 6-digit SMS code.' });
      return;
    }

    inFlight.current = true;
    setBusy('otp-verify');
    setAuthPersistence(isSignup ? true : rememberMe);
    try {
      const idToken = await verifyFirebasePhoneOtp(otpConfirmation, otpCode);
      if (isSignup && role === 'landlord') {
        localStorage.setItem(PENDING_LANDLORD_SUBSCRIPTION_KEY, JSON.stringify(landlord));
      }
      if (isSignup) recordTermsAcceptance();

      const result = await exchangeFirebasePhoneToken({
        idToken,
        mode: isSignup ? 'signup' : 'signin',
        displayName: isSignup ? clean(name) : undefined,
        email: isSignup && clean(email) ? clean(email).toLowerCase() : undefined,
        intendedRole: isSignup ? role : undefined,
        rememberMe: isSignup ? true : rememberMe,
      });

      setLastAuthMethod('phone', { phone: otpTargetPhone || cleanPhone(phone) });
      setLastAuthMethodState('phone');
      toast.success(result.isNewUser ? 'Phone verified! Account created.' : 'Phone verified! Welcome back.');
      onOpenChange(false);
      // Reload cleanly so Better-Auth's useSession picks up the fresh session cookie immediately.
      window.location.reload();
    } catch (err: any) {
      setErrors({ form: err?.message || 'Could not verify the code. Try again.' });
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  const continueWithGoogle = async () => {
    if (inFlight.current) return;
    if (isSignup && !agreed) {
      setErrors({ terms: 'Accept the terms to create an account.' });
      return;
    }
    inFlight.current = true;
    setBusy('google');
    setErrors({});
    if (isSignup && role === 'landlord') localStorage.setItem(PENDING_LANDLORD_SUBSCRIPTION_KEY, JSON.stringify(landlord));
    if (isSignup) recordTermsAcceptance();
    setAuthPersistence(isSignup ? true : rememberMe);
    try {
      const loginHint = !isSignup && lastAuthMethod === 'google' ? getLastAuthHints().email : undefined;
      const { idToken, email: googleEmail } = await signInWithFirebaseGoogle(loginHint);
      const result = await exchangeFirebaseGoogleToken({
        idToken,
        mode: isSignup ? 'signup' : 'signin',
        intendedRole: isSignup ? role : undefined,
        rememberMe: isSignup ? true : rememberMe,
      });
      setLastAuthMethod('google', { email: googleEmail || result.user?.email });
      setLastAuthMethodState('google');
      toast.success(result.isNewUser ? 'Account created with Google.' : 'Signed in with Google.');
      onOpenChange(false);
      window.location.reload();
    } catch (err: any) {
      const message = err?.message || 'Google sign-in is not available right now.';
      if (message !== 'Google sign-in was cancelled.') {
        setErrors({ form: message });
      }
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  const requestReset = async (event: FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return;
    if (resetCooldown > 0) {
      setErrors({ form: `Please wait ${resetCooldown}s before requesting another reset link.` });
      return;
    }
    if (!EMAIL_RE.test(clean(email))) {
      setErrors({ email: 'Enter a valid email address.' });
      return;
    }
    inFlight.current = true;
    setBusy('reset');
    try {
      const { error } = await authClient.requestPasswordReset({
        email: clean(email).toLowerCase(),
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error && error.status === 429) {
        setErrors({ form: friendlyAuthError(error, '') });
        return;
      }
      writeCooldown('reset', RESET_COOLDOWN_SECONDS);
      setResetCooldown(RESET_COOLDOWN_SECONDS);
      setErrors({});
      setView('forgot-sent');
    } catch {
      setErrors({ form: 'Something went wrong. Check your connection and try again.' });
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  const legal = view === 'terms' || view === 'privacy' ? LEGAL_DOCUMENTS[view] : null;
  const wide = isSignup && role === 'landlord';
  const firebaseReady = isFirebasePhoneConfigured();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent initialFocus={panelRef} className={`gap-0 p-0 ${wide || legal ? 'sm:max-w-[560px]' : 'sm:max-w-[440px]'}`}>
        <div ref={panelRef} tabIndex={-1} className="outline-none">
          {/* Invisible reCAPTCHA mount point for Firebase Phone Auth */}
          <div id="firebase-recaptcha-container" />

          {legal ? (
            <div className="px-6 pb-6 pt-7 sm:px-8 sm:pt-8">
              <button type="button" onClick={() => setView('signup')} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-950">
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
              <DialogTitle className="text-xl">{legal.title}</DialogTitle>
              <DialogDescription className="mt-1">
                Effective {legal.effectiveDate} · Version {legal.version}
              </DialogDescription>
              <div className="mt-6 space-y-5">
                {legal.sections.map((section) => (
                  <section key={section.title}>
                    <h3 className="text-sm font-semibold text-zinc-950">{section.title}</h3>
                    <p className="mt-1 whitespace-pre-line text-sm leading-6 text-zinc-600">{section.body}</p>
                  </section>
                ))}
              </div>
            </div>
          ) : view === 'forgot' || view === 'forgot-sent' ? (
            <div className="px-6 pb-6 pt-7 sm:px-8 sm:pb-8 sm:pt-9">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-100 text-zinc-950">
                {view === 'forgot' ? <KeyRound className="h-5 w-5" /> : <MailCheck className="h-5 w-5" />}
              </span>
              {view === 'forgot' ? (
                <>
                  <DialogTitle className="mt-5 text-2xl">Reset your password</DialogTitle>
                  <DialogDescription className="mt-1.5">Enter your account email and we'll send you a link to choose a new password.</DialogDescription>
                  <form onSubmit={requestReset} noValidate className="mt-6 space-y-4">
                    <Field id="reset-email" label="Email" error={errors.email}>
                      <input
                        id="reset-email"
                        type="email"
                        autoComplete="email"
                        inputMode="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        aria-invalid={Boolean(errors.email) || undefined}
                        className={inputClass(Boolean(errors.email))}
                      />
                    </Field>
                    {errors.form && <FormError message={errors.form} />}
                    <SubmitButton loading={busy === 'reset'} disabled={resetCooldown > 0}>
                      {resetCooldown > 0 ? `Wait ${resetCooldown}s to resend` : 'Send reset link'}
                    </SubmitButton>
                  </form>
                </>
              ) : (
                <>
                  <DialogTitle className="mt-5 text-2xl">Check your email</DialogTitle>
                  <DialogDescription className="mt-1.5">
                    If an account exists for <span className="font-medium text-zinc-950">{clean(email)}</span>, we've sent a link to reset the password. It expires in one hour.
                  </DialogDescription>
                  {errors.form && <div className="mt-4"><FormError message={errors.form} /></div>}
                  <div className="mt-5 flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-xs text-zinc-600">
                    <span>Didn&apos;t receive the email?</span>
                    <button
                      type="button"
                      disabled={busy !== null || resetCooldown > 0}
                      onClick={(e) => void requestReset(e as unknown as FormEvent)}
                      className="font-semibold text-violet-700 hover:underline disabled:cursor-not-allowed disabled:text-zinc-400 disabled:no-underline"
                    >
                      {resetCooldown > 0 ? `Resend in ${resetCooldown}s` : 'Resend link'}
                    </button>
                  </div>
                </>
              )}
              <button type="button" onClick={() => switchMode('signin')} className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-950">
                <ArrowLeft className="h-4 w-4" /> Back to sign in
              </button>
            </div>
          ) : (
            <div className="px-6 pb-6 pt-7 sm:px-8 sm:pb-8 sm:pt-8">
              <div className="flex items-center gap-2.5">
                <img src={tenantConfig.logoUrl} alt="" width="32" height="32" className="h-8 w-8 object-contain" />
                <span className="font-brand text-2xl font-semibold leading-none tracking-tight text-zinc-950">{tenantConfig.appName}</span>
              </div>
              <DialogTitle className="mt-5 text-2xl">{isSignup ? 'Create your account' : 'Sign in to your account'}</DialogTitle>
              <DialogDescription className="mt-1">
                {isSignup ? 'Sign up with email, Google, or a free SMS OTP code.' : 'Welcome back. Sign in with email, Google, or Phone OTP.'}
              </DialogDescription>

              <div role="tablist" aria-label="Sign in or create account" className="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800">
                {(['signin', 'signup'] as AuthMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    role="tab"
                    aria-selected={formView === mode}
                    onClick={() => switchMode(mode)}
                    className={`h-10 rounded-lg text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950/25 ${
                      formView === mode ? 'bg-white text-zinc-950 shadow-sm dark:bg-zinc-950 dark:text-white' : 'text-zinc-500 hover:text-zinc-950'
                    }`}
                  >
                    {mode === 'signin' ? 'Sign in' : 'Create account'}
                  </button>
                ))}
              </div>

              {isSignup && (
                <div className="mt-5">
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">I am signing up as</p>
                  <div role="radiogroup" aria-label="Account type" className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {([
                      { id: 'landlord', title: 'Landlord', body: 'Own & manage units', icon: KeyRound },
                      { id: 'agency', title: 'Property manager', body: 'Invite & manage landlords', icon: Building2 },
                      { id: 'hunter', title: 'House hunter', body: 'Browse, like & enquire', icon: Home },
                    ] as const).map(({ id, title, body, icon: Icon }) => {
                      const selected = accountTrack === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => {
                            setAccountTrack(id);
                            if (id === 'hunter') {
                              setRole('hunter');
                            } else {
                              setRole('landlord');
                              setLandlord((prev) => ({
                                ...prev,
                                tier: id === 'agency' ? 'proplus' : prev.tier === 'proplus' ? 'free' : prev.tier,
                              }));
                            }
                          }}
                          className={`rounded-xl border p-3 text-left transition ${
                            selected
                              ? 'border-zinc-950 bg-zinc-950 text-white dark:border-white dark:bg-white dark:text-zinc-950'
                              : 'border-zinc-200 hover:border-zinc-400 dark:border-zinc-700'
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                          <span className="mt-2 block text-xs font-semibold leading-snug sm:text-sm">{title}</span>
                          <span className={`block text-[11px] leading-4 ${selected ? 'text-white/75 dark:text-zinc-600' : 'text-zinc-500'}`}>{body}</span>
                        </button>
                      );
                    })}
                  </div>
                  {accountTrack === 'agency' && (
                    <p className="mt-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] leading-4 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                      Property Manager accounts use the <strong>Agency / Enterprise</strong> plan so you can invite &amp; manage landlords, configure rent routing, and manage unlimited units.
                    </p>
                  )}
                </div>
              )}

              {/* Method Switcher: Email vs Phone OTP */}
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => switchMethod('email')}
                  className={`relative inline-flex h-10 items-center justify-center gap-2 rounded-xl border text-xs font-semibold transition ${
                    method === 'email'
                      ? 'border-violet-600 bg-violet-50 text-violet-800 dark:border-violet-400 dark:bg-violet-500/15 dark:text-violet-200'
                      : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'
                  }`}
                >
                  <Mail className="h-3.5 w-3.5" />
                  <span>Email &amp; password</span>
                  {!isSignup && lastAuthMethod === 'email' && <LastUsedTag />}
                </button>
                <button
                  type="button"
                  onClick={() => switchMethod('phone')}
                  className={`relative inline-flex h-10 items-center justify-center gap-2 rounded-xl border text-xs font-semibold transition ${
                    method === 'phone'
                      ? 'border-violet-600 bg-violet-50 text-violet-800 dark:border-violet-400 dark:bg-violet-500/15 dark:text-violet-200'
                      : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'
                  }`}
                >
                  <Phone className="h-3.5 w-3.5" />
                  <span>Phone SMS OTP</span>
                  {!isSignup && lastAuthMethod === 'phone' && <LastUsedTag />}
                </button>
              </div>

              {method === 'phone' ? (
                <div className="mt-5 space-y-4">
                  {!firebaseReady && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-5 text-amber-900">
                      <p className="font-semibold">Firebase SMS OTP almost ready ({FIREBASE_PROJECT_ID})</p>
                      <p className="mt-0.5 text-amber-800">
                        Add <code className="rounded bg-amber-100 px-1 font-mono">VITE_FIREBASE_API_KEY</code> and{' '}
                        <code className="rounded bg-amber-100 px-1 font-mono">VITE_FIREBASE_APP_ID</code> from Firebase Console → Project Settings to activate live SMS codes.
                      </p>
                    </div>
                  )}

                  {!otpConfirmation ? (
                    <form onSubmit={handleSendOtp} noValidate className="space-y-4">
                      {isSignup && (
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field id="otp-name" label="Full name" error={errors.name}>
                            <input
                              id="otp-name"
                              autoComplete="name"
                              value={name}
                              onChange={(e) => setName(e.target.value)}
                              aria-invalid={Boolean(errors.name) || undefined}
                              className={inputClass(Boolean(errors.name))}
                            />
                          </Field>
                          <Field id="otp-email" label="Email (optional)" error={errors.email}>
                            <input
                              id="otp-email"
                              type="email"
                              inputMode="email"
                              autoComplete="email"
                              placeholder="you@example.com"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              aria-invalid={Boolean(errors.email) || undefined}
                              className={inputClass(Boolean(errors.email))}
                            />
                          </Field>
                        </div>
                      )}

                      <Field id="otp-phone" label="Phone number" error={errors.phone}>
                        <input
                          id="otp-phone"
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
                          placeholder="0712 345 678 or +254712345678"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          aria-invalid={Boolean(errors.phone) || undefined}
                          className={inputClass(Boolean(errors.phone))}
                        />
                      </Field>

                      {isSignup && role === 'landlord' && (
                        <div className="border-t border-zinc-200 pt-5 dark:border-zinc-800">
                          <LandlordSignupFields value={landlord} onChange={setLandlord} />
                          {errors.payout && <p role="alert" className="mt-2 text-xs font-medium text-red-600">{errors.payout}</p>}
                        </div>
                      )}

                      {!isSignup && (
                        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-zinc-700">
                          <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="h-4 w-4 rounded border-zinc-300 accent-zinc-950" />
                          Keep me signed in
                        </label>
                      )}

                      {isSignup && (
                        <div>
                          <label className="flex cursor-pointer items-start gap-2.5 text-sm leading-6 text-zinc-600">
                            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 rounded border-zinc-300 accent-zinc-950" />
                            <span>
                              I agree to the{' '}
                              <button type="button" onClick={() => setView('terms')} className="font-medium text-zinc-950 underline underline-offset-4">Terms of Use</button> and{' '}
                              <button type="button" onClick={() => setView('privacy')} className="font-medium text-zinc-950 underline underline-offset-4">Privacy Policy</button>.
                            </span>
                          </label>
                          {errors.terms && <p role="alert" className="mt-1.5 text-xs font-medium text-red-600">{errors.terms}</p>}
                        </div>
                      )}

                      {errors.form && <FormError message={errors.form} />}

                      <SubmitButton loading={busy === 'otp-send'} disabled={(busy !== null && busy !== 'otp-send') || otpCooldown > 0}>
                        {otpCooldown > 0 ? `Wait ${otpCooldown}s before sending again` : 'Send 6-digit SMS code'}
                      </SubmitButton>
                    </form>
                  ) : (
                    <form onSubmit={handleVerifyOtp} noValidate className="space-y-4">
                      <div className="flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50/70 p-3.5 text-xs text-violet-900">
                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-violet-700" />
                        <div>
                          <p className="font-semibold">Code sent to {otpTargetPhone}</p>
                          <p className="mt-0.5 text-violet-700">Enter the 6-digit verification code from your SMS.</p>
                        </div>
                      </div>

                      <Field id="otp-code" label="6-digit verification code" error={errors.otp}>
                        <input
                          id="otp-code"
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={6}
                          placeholder="123456"
                          value={otpCode}
                          onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          aria-invalid={Boolean(errors.otp) || undefined}
                          className={`${inputClass(Boolean(errors.otp))} text-center font-mono text-lg tracking-[0.4em]`}
                        />
                      </Field>

                      {errors.form && <FormError message={errors.form} />}

                      <SubmitButton loading={busy === 'otp-verify'} disabled={busy !== null && busy !== 'otp-verify'}>
                        {isSignup ? 'Verify & create account' : 'Verify & sign in'}
                      </SubmitButton>

                      <div className="flex items-center justify-between text-xs text-zinc-500">
                        <button
                          type="button"
                          onClick={() => {
                            clearPhoneRecaptcha();
                            setOtpConfirmation(null);
                            setOtpCode('');
                            setErrors({});
                          }}
                          className="font-medium text-zinc-700 hover:text-zinc-950"
                        >
                          Change phone number
                        </button>
                        <button
                          type="button"
                          disabled={busy !== null || otpCooldown > 0}
                          onClick={(e) => void handleSendOtp(e as unknown as FormEvent)}
                          className="font-semibold text-violet-700 hover:underline disabled:cursor-not-allowed disabled:text-zinc-400 disabled:no-underline"
                        >
                          {otpCooldown > 0 ? `Resend in ${otpCooldown}s` : 'Resend code'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={continueWithGoogle}
                    disabled={busy !== null}
                    className={`relative mt-5 inline-flex h-12 w-full items-center justify-center gap-3 rounded-xl border text-[15px] font-medium transition disabled:opacity-60 ${
                      !isSignup && lastAuthMethod === 'google'
                        ? 'border-violet-500 bg-violet-50/40 text-zinc-950 hover:bg-violet-50 dark:border-violet-400 dark:bg-violet-500/10 dark:text-white'
                        : 'border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white'
                    }`}
                  >
                    <GoogleLogo />
                    <span>Continue with Google</span>
                    {!isSignup && lastAuthMethod === 'google' && (
                      <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-semibold leading-4 text-white">
                        Last used
                      </span>
                    )}
                  </button>

                  <div className="my-5 flex items-center gap-3 text-xs text-zinc-400">
                    <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
                    or with email
                    <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
                  </div>

                  <form onSubmit={submitEmail} noValidate className="space-y-4">
                    {isSignup && (
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field id="auth-name" label="Full name" error={errors.name}>
                          <input id="auth-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={Boolean(errors.name) || undefined} className={inputClass(Boolean(errors.name))} />
                        </Field>
                        <Field id="auth-phone" label="Phone" error={errors.phone}>
                          <input
                            id="auth-phone"
                            type="tel"
                            inputMode="tel"
                            autoComplete="tel"
                            placeholder="07XX XXX XXX"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            aria-invalid={Boolean(errors.phone) || undefined}
                            className={inputClass(Boolean(errors.phone))}
                          />
                        </Field>
                      </div>
                    )}

                    <Field id="auth-email" label="Email" error={errors.email}>
                      <input
                        id="auth-email"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        aria-invalid={Boolean(errors.email) || undefined}
                        className={inputClass(Boolean(errors.email))}
                      />
                    </Field>

                    <Field
                      id="auth-password"
                      label="Password"
                      error={errors.password}
                      aside={
                        !isSignup && (
                          <button type="button" onClick={() => { setErrors({}); setView('forgot'); }} className="text-sm font-medium text-zinc-600 underline-offset-4 hover:text-zinc-950 hover:underline">
                            Forgot password?
                          </button>
                        )
                      }
                    >
                      <PasswordInput
                        id="auth-password"
                        value={password}
                        onChange={setPassword}
                        autoComplete={isSignup ? 'new-password' : 'current-password'}
                        invalid={Boolean(errors.password)}
                        placeholder={isSignup ? 'At least 8 characters' : undefined}
                      />
                    </Field>

                    {isSignup && (
                      <Field id="auth-confirm" label="Confirm password" error={errors.confirm}>
                        <PasswordInput id="auth-confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" invalid={Boolean(errors.confirm)} />
                      </Field>
                    )}

                    {isSignup && role === 'landlord' && (
                      <div className="border-t border-zinc-200 pt-6 dark:border-zinc-800">
                        <LandlordSignupFields value={landlord} onChange={setLandlord} />
                        {errors.payout && <p role="alert" className="mt-2 text-xs font-medium text-red-600">{errors.payout}</p>}
                      </div>
                    )}

                    {!isSignup && (
                      <label className="flex cursor-pointer items-center gap-2.5 text-sm text-zinc-700">
                        <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} className="h-4 w-4 rounded border-zinc-300 accent-zinc-950" />
                        Keep me signed in
                      </label>
                    )}

                    {isSignup && (
                      <div>
                        <label className="flex cursor-pointer items-start gap-2.5 text-sm leading-6 text-zinc-600">
                          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 rounded border-zinc-300 accent-zinc-950" />
                          <span>
                            I agree to the{' '}
                            <button type="button" onClick={() => setView('terms')} className="font-medium text-zinc-950 underline underline-offset-4">Terms of Use</button> and{' '}
                            <button type="button" onClick={() => setView('privacy')} className="font-medium text-zinc-950 underline underline-offset-4">Privacy Policy</button>.
                          </span>
                        </label>
                        {errors.terms && <p role="alert" className="mt-1.5 text-xs font-medium text-red-600">{errors.terms}</p>}
                      </div>
                    )}

                    {errors.form && <FormError message={errors.form} />}

                    <SubmitButton loading={busy === 'email'} disabled={busy !== null && busy !== 'email'}>
                      {isSignup ? (role === 'landlord' && landlord.tier !== 'free' ? 'Create account and continue to payment' : 'Create account') : 'Sign in'}
                    </SubmitButton>
                  </form>
                </>
              )}

              <p className="mt-6 text-center text-sm text-zinc-500">
                {isSignup ? 'Already have an account? ' : "Don't have an account? "}
                <button type="button" onClick={() => switchMode(isSignup ? 'signin' : 'signup')} className="font-semibold text-zinc-950 underline-offset-4 hover:underline">
                  {isSignup ? 'Sign in' : 'Create one'}
                </button>
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LastUsedTag() {
  return (
    <span className="absolute -top-2 right-2 rounded-full bg-violet-600 px-1.5 py-0.5 text-[9px] font-semibold leading-none tracking-tight text-white shadow-xs">
      Last used
    </span>
  );
}

function FormError({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </p>
  );
}
