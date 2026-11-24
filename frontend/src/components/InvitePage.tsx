import { useEffect, useState, type FormEvent } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { acceptInvite, getInvite } from '../lib/api';

type Invite = Awaited<ReturnType<typeof getInvite>>;

const ROLE_LABELS: Record<string, string> = {
  tenant: 'a tenant',
  landlord: 'a landlord',
  admin: 'an administrator',
  hunter: 'a member',
};

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; invite: Invite }
  | { status: 'error'; title: string; message: string };

const errorState = (status?: number, message?: string): LoadState => {
  if (status === 410) {
    return { status: 'error', title: 'This invitation has expired', message: 'Invitation links work for 7 days. Ask the person who invited you to send a new one.' };
  }
  return {
    status: 'error',
    title: 'This link can no longer be used',
    message: message || 'It may have been used already or copied incorrectly. If you already set up your account, sign in instead.',
  };
};

export default function InvitePage() {
  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setState(errorState(404, 'The invitation link is missing its code. Open the link from your email again.'));
      return;
    }
    getInvite(token)
      .then((invite) => {
        setState({ status: 'ready', invite });
        if (invite.displayName) setName(invite.displayName);
      })
      .catch((err: Error & { status?: number }) => setState(errorState(err.status)));
  }, [token]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (name.trim().length < 2) return setError('Enter your full name.');
    if (password.length < 8) return setError('Your password needs at least 8 characters.');
    if (password !== confirm) return setError('The passwords do not match.');
    if (!agreed) return setError('Please accept the Terms of Use and Privacy Policy.');

    setSubmitting(true);
    try {
      await acceptInvite({ token, name: name.trim(), phone: phone.trim() || undefined, password });
      // The session cookie is set; a full reload opens the dashboard and drops the token from the URL.
      window.location.replace('/');
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      if (status === 404 || status === 410) setState(errorState(status));
      else setError((err as Error).message);
      setSubmitting(false);
    }
  };

  return (
    <section className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 pb-16 pt-28">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        {state.status === 'loading' && (
          <div className="flex items-center justify-center gap-3 py-10 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking your invitation…
          </div>
        )}

        {state.status === 'error' && (
          <div className="py-4 text-center">
            <h1 className="text-xl font-bold tracking-tight text-zinc-950">{state.title}</h1>
            <p className="mt-3 text-sm leading-6 text-zinc-600">{state.message}</p>
            <a href="/" className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-zinc-950 px-5 text-sm font-semibold text-white hover:bg-zinc-800">
              Back to home
            </a>
          </div>
        )}

        {state.status === 'ready' && (
          <>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-950">Set up your account</h1>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              {state.invite.invitedByName} invited you to MyBoma as {ROLE_LABELS[state.invite.role] ?? 'a member'}. Your account will use{' '}
              <span className="font-semibold text-zinc-950">{state.invite.email}</span>.
            </p>

            <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
              <label className="block">
                <span className="text-sm font-medium text-zinc-800">Full name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  required
                  className="mt-1.5 h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm text-zinc-950 focus:border-zinc-950 focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-zinc-800">
                  Phone number <span className="font-normal text-zinc-400">(optional)</span>
                </span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="+254 7xx xxx xxx"
                  className="mt-1.5 h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm text-zinc-950 focus:border-zinc-950 focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-zinc-800">Password</span>
                <div className="relative mt-1.5">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    minLength={8}
                    required
                    className="h-11 w-full rounded-xl border border-zinc-300 px-3 pr-11 text-sm text-zinc-950 focus:border-zinc-950 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-950"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <span className="mt-1 block text-xs text-zinc-500">At least 8 characters.</span>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-zinc-800">Confirm password</span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  required
                  className="mt-1.5 h-11 w-full rounded-xl border border-zinc-300 px-3 text-sm text-zinc-950 focus:border-zinc-950 focus:outline-none"
                />
              </label>
              <label className="flex items-start gap-3 text-sm text-zinc-600">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-zinc-300 accent-zinc-950"
                />
                <span>
                  I accept the{' '}
                  <a href="/terms" target="_blank" rel="noopener" className="font-semibold text-zinc-950 underline underline-offset-2">
                    Terms of Use
                  </a>{' '}
                  and{' '}
                  <a href="/privacy" target="_blank" rel="noopener" className="font-semibold text-zinc-950 underline underline-offset-2">
                    Privacy Policy
                  </a>
                  .
                </span>
              </label>

              {error && (
                <p role="alert" className="rounded-xl bg-zinc-100 px-3 py-2.5 text-sm text-zinc-900">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-zinc-950 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {submitting ? 'Setting up your account…' : 'Create my account'}
              </button>
              <p className="text-center text-xs text-zinc-500">This link works once. Nobody else can use it after you do.</p>
            </form>
          </>
        )}
      </div>
    </section>
  );
}
