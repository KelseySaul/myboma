import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCreditCard, faMobileAlt, faSpinner, faWallet } from '@fortawesome/free-solid-svg-icons';
import { startLandlordSubscriptionCheckout } from '../lib/api';
import type { PendingLandlordSubscription } from '../lib/landlordSubscription';

interface LandlordSubscriptionPayProps {
  payload: PendingLandlordSubscription;
  phone?: string;
  onSuccess?: () => void;
}

export default function LandlordSubscriptionPay({ payload, phone = '', onSuccess }: LandlordSubscriptionPayProps) {
  const [payPhone, setPayPhone] = useState(phone);
  const [paying, setPaying] = useState<'stripe' | 'mpesa' | 'pesapal' | null>(null);

  const checkout = async (paymentMethod: 'stripe' | 'mpesa' | 'pesapal') => {
    setPaying(paymentMethod);
    try {
      const result = await startLandlordSubscriptionCheckout({
        ...payload,
        paymentMethod,
        phone: payPhone || phone,
        successUrl: `${window.location.origin}/?subscription_payment=success`,
        cancelUrl: `${window.location.origin}/?subscription_payment=cancelled`,
      });

      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
        return;
      }

      toast.success(
        result.customerMessage || 'Check your phone and enter your M-Pesa PIN to complete payment.',
        { duration: 8000 },
      );
      onSuccess?.();
    } catch (error: any) {
      toast.error(error.message || 'Payment could not be started.');
    } finally {
      setPaying(null);
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-zinc-100 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/40">
      <Label className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-400">
        Pay securely (funds go to MyBoma — account details never shown)
      </Label>
      <div className="space-y-1.5">
        <Label htmlFor="payPhone" className="text-xs font-bold">
          Phone for M-Pesa STK (if paying with M-Pesa)
        </Label>
        <Input
          id="payPhone"
          value={payPhone}
          onChange={(e) => setPayPhone(e.target.value)}
          placeholder="07XX XXX XXX"
          className="h-10 rounded-xl text-sm"
        />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Button
          type="button"
          className="h-11 rounded-xl bg-orange-600 font-black text-[10px] uppercase tracking-wide hover:bg-orange-500"
          disabled={Boolean(paying)}
          onClick={() => checkout('pesapal')}
        >
          {paying === 'pesapal' ? (
            <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
          ) : (
            <FontAwesomeIcon icon={faWallet} className="mr-1.5" />
          )}
          Pesapal
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11 rounded-xl border-indigo-200 font-black text-[10px] uppercase tracking-wide"
          disabled={Boolean(paying)}
          onClick={() => checkout('stripe')}
        >
          {paying === 'stripe' ? (
            <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
          ) : (
            <FontAwesomeIcon icon={faCreditCard} className="mr-1.5" />
          )}
          Card
        </Button>
        <Button
          type="button"
          className="h-11 rounded-xl bg-emerald-600 font-black text-[10px] uppercase tracking-wide hover:bg-emerald-500"
          disabled={Boolean(paying)}
          onClick={() => checkout('mpesa')}
        >
          {paying === 'mpesa' ? (
            <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
          ) : (
            <FontAwesomeIcon icon={faMobileAlt} className="mr-1.5" />
          )}
          M-Pesa STK
        </Button>
      </div>
      <p className="text-[10px] font-medium leading-relaxed text-zinc-500">
        Pesapal opens a secure checkout. Card checkout opens Stripe. M-Pesa sends an STK push to your phone. You will
        receive a receipt in-app and by email when payment succeeds.
      </p>
    </div>
  );
}
