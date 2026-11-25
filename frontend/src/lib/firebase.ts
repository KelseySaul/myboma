import type { ConfirmationResult, RecaptchaVerifier } from 'firebase/auth';

const firebaseConfig = {
  apiKey: (import.meta.env.VITE_FIREBASE_API_KEY || '').trim(),
  authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'myboma-c1c8b.firebaseapp.com').trim(),
  projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID || 'myboma-c1c8b').trim(),
  storageBucket: (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'myboma-c1c8b.firebasestorage.app').trim(),
  messagingSenderId: (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim(),
  appId: (import.meta.env.VITE_FIREBASE_APP_ID || '').trim(),
};

export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;

/** True once Firebase Web App credentials (API key + App ID) are configured in frontend/.env. */
export const isFirebasePhoneConfigured = () =>
  Boolean(firebaseConfig.apiKey && firebaseConfig.appId && firebaseConfig.projectId);

/** Converts Kenyan local (07xx / 01xx / 2547xx) or international numbers to E.164 (+254...). */
export const formatPhoneToE164 = (raw: string): string | null => {
  const cleaned = raw.replace(/[\s\-()]/g, '').trim();
  if (!cleaned) return null;
  if (/^\+\d{9,15}$/.test(cleaned)) return cleaned;
  if (/^0(7|1)\d{8}$/.test(cleaned)) return `+254${cleaned.slice(1)}`;
  if (/^254(7|1)\d{8}$/.test(cleaned)) return `+${cleaned}`;
  if (/^(7|1)\d{8}$/.test(cleaned)) return `+254${cleaned}`;
  return null;
};

let recaptchaInstance: RecaptchaVerifier | null = null;
let recaptchaContainerId: string | null = null;

async function getFirebaseAuth() {
  if (!isFirebasePhoneConfigured()) {
    throw new Error(
      `Firebase Phone OTP is almost ready — add VITE_FIREBASE_API_KEY and VITE_FIREBASE_APP_ID from Firebase project "${FIREBASE_PROJECT_ID}" to enable SMS codes.`,
    );
  }
  const [{ initializeApp, getApps, getApp }, { getAuth }] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
  ]);
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const auth = getAuth(app);
  auth.useDeviceLanguage();
  return auth;
}

export function clearPhoneRecaptcha() {
  if (recaptchaInstance) {
    try {
      recaptchaInstance.clear();
    } catch {
      /* ignore teardown errors */
    }
    recaptchaInstance = null;
    recaptchaContainerId = null;
  }
}

export async function sendFirebasePhoneOtp(phoneInput: string, containerId: string): Promise<{
  e164Phone: string;
  confirmation: ConfirmationResult;
}> {
  const e164Phone = formatPhoneToE164(phoneInput);
  if (!e164Phone) {
    throw new Error('Enter a valid phone number, e.g. 0712 345 678 or +254712345678.');
  }

  const auth = await getFirebaseAuth();
  const { RecaptchaVerifier, signInWithPhoneNumber } = await import('firebase/auth');

  if (recaptchaInstance && recaptchaContainerId !== containerId) {
    clearPhoneRecaptcha();
  }
  if (!recaptchaInstance) {
    recaptchaInstance = new RecaptchaVerifier(auth, containerId, {
      size: 'invisible',
    });
    recaptchaContainerId = containerId;
  }

  try {
    const confirmation = await signInWithPhoneNumber(auth, e164Phone, recaptchaInstance);
    return { e164Phone, confirmation };
  } catch (err: any) {
    clearPhoneRecaptcha();
    const code = String(err?.code || '');
    if (code === 'auth/too-many-requests') {
      throw new Error('Too many SMS attempts. Please wait a few minutes and try again.');
    }
    if (code === 'auth/invalid-phone-number') {
      throw new Error('Enter a valid phone number with country code (e.g. +254712345678).');
    }
    if (code === 'auth/operation-not-allowed') {
      throw new Error('Enable Phone sign-in in Firebase Console → Authentication → Sign-in method.');
    }
    if (code === 'auth/unauthorized-domain') {
      throw new Error('Add this domain under Firebase Console → Authentication → Settings → Authorized domains.');
    }
    throw new Error(err?.message || 'Could not send the SMS verification code.');
  }
}

export async function verifyFirebasePhoneOtp(confirmation: ConfirmationResult, code: string): Promise<string> {
  const digits = code.replace(/\D/g, '');
  if (digits.length !== 6) {
    throw new Error('Enter the 6-digit code sent to your phone.');
  }
  try {
    const credential = await confirmation.confirm(digits);
    return await credential.user.getIdToken(true);
  } catch (err: any) {
    const errCode = String(err?.code || '');
    if (errCode === 'auth/invalid-verification-code') {
      throw new Error('That 6-digit code is incorrect. Check your SMS and try again.');
    }
    if (errCode === 'auth/code-expired') {
      throw new Error('That code has expired. Tap Resend code to get a new one.');
    }
    throw new Error(err?.message || 'Verification failed. Please try again.');
  }
}
