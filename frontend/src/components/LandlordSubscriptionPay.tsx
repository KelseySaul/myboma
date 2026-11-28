import { useState } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { startLandlordSubscriptionCheckout } from '../lib/api';
import type { PendingLandlordSubscription } from '../../../shared/landlordSubscription';

import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

interface LandlordSubscriptionPayProps {
  payload: PendingLandlordSubscription;
  phone?: string;
  onSuccess?: () => void;
}

export default function LandlordSubscriptionPay({ payload, onSuccess }: LandlordSubscriptionPayProps) {
  const [paying, setPaying] = useState<'pesapal' | null>(null);

  const checkout = async () => {
    // The free plan is activated without checkout (see LandlordSubscriptionGate).
    const { tier } = payload;
    if (tier === 'free') return;
    setPaying('pesapal');
    try {
      const result = await startLandlordSubscriptionCheckout({
        ...payload,
        tier,
        paymentMethod: 'pesapal',
        successUrl: Capacitor.isNativePlatform() ? `https://myboma.org/?subscription_payment=success` : `${window.location.origin}/?subscription_payment=success`,
        cancelUrl: Capacitor.isNativePlatform() ? `https://myboma.org/?subscription_payment=cancelled` : `${window.location.origin}/?subscription_payment=cancelled`,
      });

      if (result.checkoutUrl) {
        if (Capacitor.isNativePlatform()) {
          try {
            await Browser.open({ url: result.checkoutUrl, presentationStyle: 'popover' });
          } catch (err) {
            console.error('Browser.open failed, falling back', err);
            // Fallback 1: system browser
            const newWindow = window.open(result.checkoutUrl, '_system');
            if (!newWindow) {
              // Fallback 2: webview navigation
              window.location.href = result.checkoutUrl;
            }
          }
        } else {
          window.location.href = result.checkoutUrl;
        }
        return;
      }
      onSuccess?.();
    } catch (error: any) {
      toast.error(error.message || 'Payment could not be started.');
    } finally {
      setPaying(null);
    }
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={Boolean(paying)}
        onClick={checkout}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-zinc-950 text-[15px] font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60"
      >
        {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
        Continue to payment
      </button>
      <p className="text-center text-xs leading-5 text-zinc-500">
        You'll pay on Pesapal's secure page with M-Pesa, Visa, Mastercard or bank transfer.
      </p>
    </div>
  );
}
