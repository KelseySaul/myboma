import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { toast } from 'sonner';
import { CheckCircle2, CreditCard, Landmark, Loader2, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  createPesapalRentCheckout,
  createStripeRentCheckout,
  initiateMpesaRentPayment,
  markRentPaymentManual,
} from '../../lib/api';
import { formatMoney, returnUrl, type RentPayment, type TenantLandlord } from './helpers';

interface PayRentProps {
  payment: RentPayment;
  landlord: TenantLandlord | null;
  defaultPhone?: string;
  onSubmitted?: () => void;
}

const KENYAN_PHONE = /^(?:\+?254|0)?(7|1)\d{8}$/;

async function openCheckout(url: string) {
  if (Capacitor.isNativePlatform()) {
    try {
      await Browser.open({ url, presentationStyle: 'popover' });
    } catch {
      if (!window.open(url, '_system')) window.location.href = url;
    }
  } else {
    window.location.assign(url);
  }
}

/** Buttons and dialogs for paying one rent invoice. */
export default function PayRent({ payment, landlord, defaultPhone = '', onSubmitted }: PayRentProps) {
  const isNative = Capacitor.isNativePlatform();
  const directMpesaNumber = landlord?.rentPayoutMethod === 'mpesa' ? landlord.mpesaSettlementPhone || landlord.phone : undefined;
  const hasBankDetails = Boolean(landlord?.bankAccountNumber && landlord?.bankName);

  const [busy, setBusy] = useState<'card' | 'intl' | null>(null);
  const [stkOpen, setStkOpen] = useState(false);
  const [directOpen, setDirectOpen] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);

  const payByCard = async (provider: 'pesapal' | 'stripe') => {
    setBusy(provider === 'pesapal' ? 'card' : 'intl');
    try {
      const body = {
        rentPaymentId: payment.id,
        successUrl: returnUrl(`rent_payment=success&provider=${provider}`, isNative),
        cancelUrl: returnUrl(`rent_payment=cancelled&provider=${provider}`, isNative),
      };
      const { checkoutUrl } = provider === 'pesapal' ? await createPesapalRentCheckout(body) : await createStripeRentCheckout(body);
      if (!checkoutUrl) throw new Error('The payment page could not be opened. Please try again.');
      await openCheckout(checkoutUrl);
    } catch (error: any) {
      toast.error(error.message || 'Could not start the payment.');
    } finally {
      setBusy(null);
    }
  };

  // Landlord receives rent straight to their own M-Pesa: tenant sends money and enters the code.
  if (directMpesaNumber) {
    return (
      <>
        <Button className="finance-cta h-12 w-full text-base" onClick={() => setDirectOpen(true)}>
          <Smartphone /> Pay with M-Pesa
        </Button>
        <DirectMpesaDialog
          open={directOpen}
          onOpenChange={setDirectOpen}
          payment={payment}
          number={directMpesaNumber}
          onSubmitted={onSubmitted}
        />
      </>
    );
  }

  return (
    <div className="space-y-2">
      <Button className="finance-cta h-12 w-full text-base" onClick={() => payByCard('pesapal')} disabled={Boolean(busy)}>
        {busy === 'card' ? <Loader2 className="animate-spin" /> : <CreditCard />}
        {busy === 'card' ? 'Opening Pesapal…' : 'Pay with M-Pesa or Card (Pesapal)'}
      </Button>
      <div className={`grid gap-2 ${hasBankDetails ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <Button variant="outline" className="h-11" onClick={() => setStkOpen(true)} disabled={Boolean(busy)}>
          <Smartphone /> M-Pesa STK prompt
        </Button>
        {hasBankDetails && (
          <Button variant="outline" className="h-11" onClick={() => setBankOpen(true)} disabled={Boolean(busy)}>
            <Landmark /> Bank transfer
          </Button>
        )}
      </div>
      <button
        type="button"
        onClick={() => payByCard('stripe')}
        disabled={Boolean(busy)}
        className="w-full py-1 text-center text-xs text-zinc-500 underline-offset-4 hover:text-zinc-900 hover:underline disabled:opacity-50 dark:hover:text-white"
      >
        {busy === 'intl' ? 'Opening…' : 'Paying with a card from outside Kenya?'}
      </button>

      <StkDialog open={stkOpen} onOpenChange={setStkOpen} payment={payment} defaultPhone={defaultPhone} />
      {hasBankDetails && landlord && <BankDialog open={bankOpen} onOpenChange={setBankOpen} payment={payment} landlord={landlord} />}
    </div>
  );
}

function StkDialog({
  open,
  onOpenChange,
  payment,
  defaultPhone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: RentPayment;
  defaultPhone: string;
}) {
  const [phone, setPhone] = useState(defaultPhone);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const cleaned = phone.replace(/[\s-]/g, '');
  const valid = KENYAN_PHONE.test(cleaned);

  const send = async () => {
    if (!valid) return;
    setSending(true);
    try {
      await initiateMpesaRentPayment({ rentPaymentId: payment.id, phone: cleaned });
      setSent(true);
    } catch (error: any) {
      toast.error(error.message || 'Could not send the M-Pesa prompt.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setSent(false);
      }}
    >
      <DialogContent className="sm:max-w-md">
        {sent ? (
          <div className="py-4 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-zinc-950 dark:text-white" />
            <DialogTitle className="mt-4">Check your phone</DialogTitle>
            <DialogDescription className="mt-2">
              We sent an M-Pesa prompt to {cleaned}. Enter your M-Pesa PIN to pay {formatMoney(payment.amount)}. Your invoice is marked paid as soon as the payment goes through.
            </DialogDescription>
            <Button className="mt-6 w-full" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Pay {formatMoney(payment.amount)} with M-Pesa</DialogTitle>
              <DialogDescription>We will send a payment prompt to this number.</DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="stk-phone">M-Pesa phone number</Label>
              <Input
                id="stk-phone"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="0712 345 678"
                aria-invalid={phone.length > 0 && !valid}
                className="h-11"
              />
              {phone.length > 0 && !valid && <p className="text-xs text-rose-600">Enter a Safaricom number like 0712 345 678.</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={send} disabled={!valid || sending}>
                {sending && <Loader2 className="animate-spin" />} Send prompt
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DirectMpesaDialog({
  open,
  onOpenChange,
  payment,
  number,
  onSubmitted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: RentPayment;
  number: string;
  onSubmitted?: () => void;
}) {
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const valid = /^[A-Z0-9]{8,12}$/.test(code);

  const submit = async () => {
    if (!valid) return;
    setSubmitting(true);
    try {
      await markRentPaymentManual(payment.id, `M-Pesa receipt: ${code}`);
      toast.success('Thanks. Your landlord will confirm the payment.');
      setCode('');
      onOpenChange(false);
      onSubmitted?.();
    } catch (error: any) {
      toast.error(error.message || 'Could not submit the M-Pesa code.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pay {formatMoney(payment.amount)} with M-Pesa</DialogTitle>
          <DialogDescription>Your landlord receives rent directly on M-Pesa.</DialogDescription>
        </DialogHeader>
        <ol className="space-y-2 rounded-xl bg-zinc-50 p-4 text-sm text-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-200">
          <li>1. Open M-Pesa and choose <strong>Send Money</strong>.</li>
          <li>
            2. Send <strong>{formatMoney(payment.amount)}</strong> to <strong className="font-mono">{number}</strong>.
          </li>
          <li>3. Enter the code from the M-Pesa confirmation message below.</li>
        </ol>
        <div className="space-y-1.5">
          <Label htmlFor="mpesa-code">M-Pesa code</Label>
          <Input
            id="mpesa-code"
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase().replace(/\s/g, ''))}
            placeholder="e.g. SKL4ABC123"
            className="h-11 font-mono uppercase"
            aria-invalid={code.length > 0 && !valid}
          />
          {code.length > 0 && !valid && <p className="text-xs text-rose-600">M-Pesa codes are 10 letters and numbers.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid || submitting}>
            {submitting && <Loader2 className="animate-spin" />} Submit code
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BankDialog({
  open,
  onOpenChange,
  payment,
  landlord,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: RentPayment;
  landlord: TenantLandlord;
}) {
  const rows: [string, string][] = [
    ['Bank', landlord.bankName ?? ''],
    ['Account name', landlord.bankAccountName || landlord.displayName],
    ['Account number', landlord.bankAccountNumber ?? ''],
    ['Amount', formatMoney(payment.amount)],
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pay by bank transfer</DialogTitle>
          <DialogDescription>Send the rent to your landlord's account, then share the bank receipt with them so they can mark it paid.</DialogDescription>
        </DialogHeader>
        <dl className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
              <dt className="text-zinc-500">{label}</dt>
              <dd className="text-right font-semibold text-zinc-950 dark:text-white">{value}</dd>
            </div>
          ))}
        </dl>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
