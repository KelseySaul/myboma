import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCreditCard, faMobileAlt, faSpinner, faWallet } from '@fortawesome/free-solid-svg-icons';
import { startLandlordSubscriptionCheckout } from '../lib/api';
import type { PendingLandlordSubscription } from '../lib/landlordSubscription';

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
    setPaying('pesapal');
    try {
      const result = await startLandlordSubscriptionCheckout({
        ...payload,
        paymentMethod: 'pesapal',
        successUrl: Capacitor.isNativePlatform() ? `https://myboma.vercel.app/?subscription_payment=success` : `${window.location.origin}/?subscription_payment=success`,
        cancelUrl: Capacitor.isNativePlatform() ? `https://myboma.vercel.app/?subscription_payment=cancelled` : `${window.location.origin}/?subscription_payment=cancelled`,
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
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
      <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
        Secure Checkout via Pesapal
      </Label>
      
      <div className="grid grid-cols-1">
        <Button
          type="button"
          className="h-12 rounded-xl bg-indigo-600 font-bold text-xs uppercase tracking-wider hover:bg-indigo-500 shadow-sm cursor-pointer"
          disabled={Boolean(paying)}
          onClick={checkout}
        >
          {paying === 'pesapal' ? (
            <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
          ) : (
            <FontAwesomeIcon icon={faWallet} className="mr-2" />
          )}
          Pay with Pesapal
        </Button>
      </div>
      <p className="text-[11px] font-normal leading-relaxed text-slate-500 text-center">
        Supports <span className="font-semibold text-slate-700 dark:text-slate-300">M-Pesa, Visa, Mastercard</span>, and Bank Transfers.
        You will be redirected to a secure checkout page.
      </p>
    </div>
  );
}
