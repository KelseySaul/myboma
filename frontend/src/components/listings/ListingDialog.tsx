import { useState, type FormEvent, type TouchEvent } from 'react';
import { format, differenceInCalendarDays, parseISO } from 'date-fns';
import { CheckCircle2, ChevronLeft, ChevronRight, Home, Loader2, MapPin, X } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { submitEnquiry } from '../../lib/api';
import { TYPE_LABELS, formatKes, priceUnit, type Listing } from './types';

interface Prefill {
  name?: string;
  email?: string;
  phone?: string;
}

interface ListingDialogProps {
  listing: Listing | null;
  prefill?: Prefill;
  onClose: () => void;
}

export default function ListingDialog({ listing, prefill, onClose }: ListingDialogProps) {
  return (
    <Dialog open={Boolean(listing)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="bottom-0 left-0 top-auto max-h-[92dvh] w-full max-w-full translate-x-0 translate-y-0 gap-0 overflow-y-auto overscroll-contain rounded-b-none rounded-t-3xl border-0 p-0 data-open:slide-in-from-bottom-10 data-open:zoom-in-100 sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[90vh] sm:max-w-2xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl sm:border sm:data-open:slide-in-from-bottom-0 sm:data-open:zoom-in-95"
      >
        {listing && <ListingDetail key={listing.id} listing={listing} prefill={prefill} />}
      </DialogContent>
    </Dialog>
  );
}

function Gallery({ images, title }: { images: string[]; title: string }) {
  const [index, setIndex] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const count = images.length;

  if (count === 0) {
    return (
      <div className="flex aspect-[4/3] w-full items-center justify-center bg-zinc-100 text-zinc-300 dark:bg-zinc-800 sm:aspect-[16/9]">
        <Home className="h-12 w-12" />
      </div>
    );
  }

  const go = (delta: number) => setIndex((current) => (current + delta + count) % count);
  const onTouchEnd = (event: TouchEvent) => {
    if (touchStart === null) return;
    const distance = touchStart - event.changedTouches[0].clientX;
    if (Math.abs(distance) > 40) go(distance > 0 ? 1 : -1);
    setTouchStart(null);
  };

  return (
    <div
      className="relative aspect-[4/3] w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800 sm:aspect-[16/9]"
      onTouchStart={(event) => setTouchStart(event.touches[0].clientX)}
      onTouchEnd={onTouchEnd}
    >
      {images.map((src, i) => (
        <img
          key={src}
          src={src}
          alt={i === index ? `${title}, photo ${i + 1} of ${count}` : ''}
          loading={i === 0 ? 'eager' : 'lazy'}
          decoding="async"
          referrerPolicy="no-referrer"
          draggable={false}
          className={`absolute inset-0 h-full w-full select-none object-cover transition-opacity duration-300 ${i === index ? 'opacity-100' : 'opacity-0'}`}
        />
      ))}
      {count > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous photo"
            onClick={() => go(-1)}
            className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-zinc-950 shadow transition hover:bg-white"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Next photo"
            onClick={() => go(1)}
            className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-zinc-950 shadow transition hover:bg-white"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <span className="absolute bottom-3 right-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white">
            {index + 1} / {count}
          </span>
        </>
      )}
    </div>
  );
}

type FieldErrors = Partial<Record<'name' | 'email' | 'phone' | 'dates', string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ListingDetail({ listing, prefill }: { listing: Listing; prefill?: Prefill }) {
  const isBnb = listing.type === 'bnb';
  const today = format(new Date(), 'yyyy-MM-dd');
  const [name, setName] = useState(prefill?.name ?? '');
  const [email, setEmail] = useState(prefill?.email ?? '');
  const [phone, setPhone] = useState(prefill?.phone ?? '');
  const [message, setMessage] = useState('');
  const [checkIn, setCheckIn] = useState(today);
  const [checkOut, setCheckOut] = useState(format(new Date(Date.now() + 86400000), 'yyyy-MM-dd'));
  const [website, setWebsite] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const nights = isBnb ? differenceInCalendarDays(parseISO(checkOut), parseISO(checkIn)) : 0;

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    if (name.trim().length < 2) next.name = 'Enter your name.';
    if (!EMAIL_RE.test(email.trim())) next.email = 'Enter a valid email address.';
    if (phone.replace(/[^\d]/g, '').length < 9) next.phone = 'Enter a valid phone number.';
    if (isBnb && (!checkIn || !checkOut || nights <= 0)) next.dates = 'Check-out must be after check-in.';
    return next;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) return;
    // Bots fill hidden fields; real people never see this one.
    if (website) {
      setSent(true);
      return;
    }
    setSending(true);
    try {
      await submitEnquiry({
        propertyId: listing.id,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        message: message.trim() || undefined,
        checkIn: isBnb ? checkIn : undefined,
        checkOut: isBnb ? checkOut : undefined,
      });
      setSent(true);
    } catch (error: any) {
      toast.error(error?.message || 'Could not send your enquiry. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const inputClass = (invalid?: string) =>
    `h-11 w-full rounded-xl border bg-white px-3.5 text-sm text-zinc-950 placeholder:text-zinc-400 transition focus:outline-none focus:ring-2 focus:ring-zinc-950/15 dark:bg-zinc-900 dark:text-white ${
      invalid ? 'border-rose-400' : 'border-zinc-200 focus:border-zinc-950 dark:border-zinc-700'
    }`;

  return (
    <div>
      <div className="relative">
        <Gallery images={listing.images ?? []} title={listing.title} />
        <span className="pointer-events-none absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full bg-white/80 sm:hidden" aria-hidden />
        <DialogClose
          aria-label="Close"
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-zinc-950 shadow transition hover:bg-white"
        >
          <X className="h-4 w-4" />
        </DialogClose>
      </div>

      <div className="space-y-6 p-5 sm:p-7">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">{TYPE_LABELS[listing.type] ?? listing.type}</p>
          <DialogTitle className="mt-1.5 text-xl font-bold leading-tight text-zinc-950 dark:text-white sm:text-2xl">{listing.title}</DialogTitle>
          <DialogDescription className="mt-1.5 flex items-center gap-1.5 text-sm text-zinc-500">
            <MapPin className="h-4 w-4 shrink-0" />
            {listing.location}
          </DialogDescription>
          <p className="mt-4 text-2xl font-bold tabular-nums text-zinc-950 dark:text-white">
            {formatKes(listing.price)}
            <span className="ml-1.5 text-sm font-normal text-zinc-500">per {priceUnit(listing.type)}</span>
          </p>
        </div>

        {listing.description && <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{listing.description}</p>}

        {listing.amenities?.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-zinc-950 dark:text-white">What's included</h4>
            <ul className="mt-2.5 flex flex-wrap gap-2">
              {listing.amenities.map((amenity) => (
                <li key={amenity} className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-700 dark:border-zinc-700 dark:text-zinc-300">
                  {amenity}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-2xl bg-zinc-50 p-4 dark:bg-zinc-800/50 sm:p-5">
          {sent ? (
            <div className="flex flex-col items-center py-6 text-center" role="status">
              <CheckCircle2 className="h-10 w-10 text-zinc-950 dark:text-white" />
              <h4 className="mt-3 text-base font-semibold text-zinc-950 dark:text-white">Enquiry sent</h4>
              <p className="mt-1.5 max-w-sm text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                We've emailed you a copy and the landlord will contact you about availability.
              </p>
            </div>
          ) : (
            <form onSubmit={submit} noValidate className="space-y-3">
              <div>
                <h4 className="text-base font-semibold text-zinc-950 dark:text-white">
                  {isBnb ? 'Ask about these dates' : 'Ask about this place'}
                </h4>
                <p className="mt-0.5 text-sm text-zinc-500">No account needed. The landlord will get back to you.</p>
              </div>

              {isBnb && (
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Check-in</span>
                    <input type="date" min={today} value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className={inputClass(errors.dates)} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Check-out</span>
                    <input type="date" min={checkIn || today} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className={inputClass(errors.dates)} />
                  </label>
                  {errors.dates ? (
                    <p className="col-span-2 text-xs text-rose-600">{errors.dates}</p>
                  ) : (
                    nights > 0 && (
                      <p className="col-span-2 text-xs text-zinc-500">
                        {nights} {nights === 1 ? 'night' : 'nights'} · about {formatKes(nights * listing.price)}
                      </p>
                    )
                  )}
                </div>
              )}

              <Field label="Full name" error={errors.name}>
                <input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Wanjiku" className={inputClass(errors.name)} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Email" error={errors.email}>
                  <input type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={inputClass(errors.email)} />
                </Field>
                <Field label="Phone" error={errors.phone}>
                  <input type="tel" autoComplete="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712 345 678" className={inputClass(errors.phone)} />
                </Field>
              </div>
              <Field label="Message (optional)">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder="When would you like to view it?"
                  className="w-full resize-none rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-950 placeholder:text-zinc-400 focus:border-zinc-950 focus:outline-none focus:ring-2 focus:ring-zinc-950/15 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
                />
              </Field>

              <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
                <label>
                  Website
                  <input name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
                </label>
              </div>

              <button
                type="submit"
                disabled={sending}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-zinc-950 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-zinc-950"
              >
                {sending && <Loader2 className="h-4 w-4 animate-spin" />}
                {sending ? 'Sending…' : 'Send enquiry'}
              </button>
              <p className="text-center text-xs text-zinc-500">We'll email you a copy. Your details go only to this landlord.</p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-rose-600">{error}</span>}
    </label>
  );
}
