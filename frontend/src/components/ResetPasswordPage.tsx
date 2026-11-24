import { useRef, useState, type FormEvent } from 'react';
import { CheckCircle2, KeyRound } from 'lucide-react';
import { authClient } from '../lib/auth-client';
import { Field, PasswordInput, SubmitButton, friendlyAuthError } from './auth/fields';

/** Landing page for the link in the "Reset your password" email (Better Auth appends ?token=). */
export default function ResetPasswordPage({ onSignIn }: { onSignIn: () => void }) {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const linkError = params.get('error');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirm?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const inFlight = useRef(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (inFlight.current || !token) return;
    const next: typeof errors = {};
    if (password.length < 8) next.password = 'Use at least 8 characters.';
    if (confirm !== password) next.confirm = 'Passwords do not match.';
    setErrors(next);
    if (Object.keys(next).length) return;

    inFlight.current = true;
    setBusy(true);
    try {
      const { error } = await authClient.resetPassword({ newPassword: password, token });
      if (error) {
        setErrors({ form: friendlyAuthError(error, 'Could not reset your password. Request a new link.') });
        return;
      }
      window.history.replaceState({}, '', '/reset-password');
      setDone(true);
    } catch {
      setErrors({ form: 'Something went wrong. Check your connection and try again.' });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const invalidLink = !token || linkError;

  return (
    <div className="flex min-h-[calc(100svh-4rem)] items-center justify-center bg-zinc-50 px-4 pb-16 pt-28">
      <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-100 text-zinc-950">
          {done ? <CheckCircle2 className="h-5 w-5" /> : <KeyRound className="h-5 w-5" />}
        </span>

        {done ? (
          <>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight text-zinc-950">Password changed</h1>
            <p className="mt-1.5 text-sm leading-6 text-zinc-500">You've been signed out on other devices. Sign in with your new password.</p>
            <div className="mt-6">
              <SubmitButton type="button" loading={false} onClick={onSignIn}>
                Sign in
              </SubmitButton>
            </div>
          </>
        ) : invalidLink ? (
          <>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight text-zinc-950">This link doesn't work</h1>
            <p className="mt-1.5 text-sm leading-6 text-zinc-500">
              Reset links work once and expire after an hour. Request a new one from the sign-in screen.
            </p>
            <div className="mt-6">
              <SubmitButton type="button" loading={false} onClick={onSignIn}>
                Back to sign in
              </SubmitButton>
            </div>
          </>
        ) : (
          <>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight text-zinc-950">Choose a new password</h1>
            <p className="mt-1.5 text-sm leading-6 text-zinc-500">Use at least 8 characters. Avoid passwords you use elsewhere.</p>
            <form onSubmit={submit} noValidate className="mt-6 space-y-4">
              <Field id="new-password" label="New password" error={errors.password}>
                <PasswordInput id="new-password" value={password} onChange={setPassword} autoComplete="new-password" invalid={Boolean(errors.password)} />
              </Field>
              <Field id="confirm-password" label="Confirm new password" error={errors.confirm}>
                <PasswordInput id="confirm-password" value={confirm} onChange={setConfirm} autoComplete="new-password" invalid={Boolean(errors.confirm)} />
              </Field>
              {errors.form && (
                <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {errors.form}
                </p>
              )}
              <SubmitButton loading={busy}>Save new password</SubmitButton>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
