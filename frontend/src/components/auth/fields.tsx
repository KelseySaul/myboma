import { useState, type ReactNode } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

/** Shared input styling for the sign-in, sign-up, invite and reset forms. */
export const inputClass = (invalid = false) =>
  `h-12 w-full rounded-xl border bg-white px-4 text-[15px] text-zinc-950 placeholder:text-zinc-400 transition-[border-color,box-shadow] focus:outline-none focus:ring-4 dark:bg-zinc-900 dark:text-white ${
    invalid
      ? 'border-red-500 focus:border-red-500 focus:ring-red-500/15'
      : 'border-zinc-300 focus:border-zinc-950 focus:ring-zinc-950/10 dark:border-zinc-700 dark:focus:border-white'
  }`;

interface FieldProps {
  id: string;
  label: string;
  error?: string | null;
  hint?: string;
  /** Extra element on the label row, e.g. a "Forgot password?" link. */
  aside?: ReactNode;
  children: ReactNode;
}

export function Field({ id, label, error, hint, aside, children }: FieldProps) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          {label}
          {hint && <span className="ml-1.5 font-normal text-zinc-400">{hint}</span>}
        </label>
        {aside}
      </div>
      {children}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs font-medium text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

interface PasswordInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
  invalid?: boolean;
  placeholder?: string;
}

export function PasswordInput({ id, value, onChange, autoComplete, invalid = false, placeholder }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-error` : undefined}
        className={`${inputClass(invalid)} pr-12`}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-zinc-500 transition hover:text-zinc-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950/20 dark:hover:text-white"
      >
        {visible ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
      </button>
    </div>
  );
}

interface SubmitButtonProps {
  loading: boolean;
  children: ReactNode;
  disabled?: boolean;
  type?: 'submit' | 'button';
  onClick?: () => void;
}

export function SubmitButton({ loading, children, disabled = false, type = 'submit', onClick }: SubmitButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={loading || disabled}
      aria-busy={loading || undefined}
      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-zinc-950 px-5 text-[15px] font-semibold text-white transition hover:bg-zinc-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200"
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

/** Google's multicolour "G" mark. */
export function GoogleLogo({ className = 'h-[18px] w-[18px]' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </svg>
  );
}

/** Turns Better Auth / HTTP errors into plain messages. */
export function friendlyAuthError(error: { status?: number; code?: string; message?: string } | null | undefined, fallback: string) {
  if (!error) return fallback;
  if (error.status === 429) {
    return error.message && !/^\[?[A-Z_]+\]?$/.test(error.message)
      ? error.message
      : 'Too many attempts. Please wait a few minutes and try again.';
  }
  switch (error.code) {
    case 'INVALID_EMAIL_OR_PASSWORD':
      return 'Wrong email or password.';
    case 'USER_ALREADY_EXISTS':
    case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
      return 'An account with this email already exists. Sign in instead.';
    case 'EMAIL_NOT_VERIFIED':
      return 'Confirm your email address first. We sent you a link when you signed up.';
    case 'PASSWORD_TOO_SHORT':
      return 'Use at least 8 characters for your password.';
    case 'INVALID_TOKEN':
      return 'This link is invalid or has expired. Request a new one.';
    default:
      return error.message && !/^\[?[A-Z_]+\]?$/.test(error.message) ? error.message : fallback;
  }
}
