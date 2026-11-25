import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { uploadFile } from '../../lib/api';
import { resolveMediaUrl } from '../../lib/fileUrl';
import PhotoCaptureControl from '../PhotoCaptureControl';
import PropertyDescriptionPresets from '../PropertyDescriptionPresets';
import type { Building, Property, PropertyStatus, PropertyType } from './types';
import { ActionButton, Field, inputClass } from './ui';

export interface PropertyFormValues {
  title: string;
  unitNumber: string;
  buildingId: string;
  type: PropertyType;
  price: string;
  location: string;
  description: string;
  amenities: string;
  images: string[];
  status: PropertyStatus;
}

const EMPTY: PropertyFormValues = {
  title: '',
  unitNumber: '',
  buildingId: 'none',
  type: 'residential',
  price: '',
  location: '',
  description: '',
  amenities: '',
  images: [],
  status: 'available',
};

const fromProperty = (p: Property): PropertyFormValues => ({
  title: p.title,
  unitNumber: p.unitNumber ?? '',
  buildingId: p.buildingId ?? 'none',
  type: p.type,
  price: String(p.price ?? ''),
  location: p.location ?? '',
  description: p.description ?? '',
  amenities: (p.amenities ?? []).join(', '),
  images: p.images ?? [],
  status: p.status,
});

interface PropertyFormDialogProps {
  open: boolean;
  property: Property | null;
  buildings: Building[];
  allowBuildings: boolean;
  onClose: () => void;
  onSubmit: (values: PropertyFormValues) => Promise<void>;
}

export default function PropertyFormDialog({ open, property, buildings, allowBuildings, onClose, onSubmit }: PropertyFormDialogProps) {
  const [values, setValues] = useState<PropertyFormValues>(EMPTY);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValues(property ? fromProperty(property) : EMPTY);
      setError(null);
    }
  }, [open, property]);

  const set = <K extends keyof PropertyFormValues>(key: K, value: PropertyFormValues[K]) => setValues((v) => ({ ...v, [key]: value }));

  const onFiles = async (files: File[]) => {
    if (!files.length) return;
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of files.slice(0, 8)) {
        if (!file.type.startsWith('image/')) continue;
        if (file.size > 15 * 1024 * 1024) {
          toast.error(`${file.name} is larger than 15 MB`);
          continue;
        }
        // The server resizes and converts every photo to WebP.
        const { url } = await uploadFile(file, file.name);
        urls.push(url);
      }
      if (urls.length > 0) {
        setValues((v) => ({ ...v, images: [...v.images, ...urls] }));
        toast.success(urls.length === 1 ? 'Photo added' : `${urls.length} photos added`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Could not upload the photo');
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!values.title.trim()) return setError('Give the property a name, for example "2 bedroom, Kilimani".');
    if (!Number(values.price) || Number(values.price) <= 0) return setError('Enter the monthly rent (or nightly price for short stays).');
    if (!values.location.trim()) return setError('Enter the area or address.');
    setError(null);
    setSaving(true);
    try {
      await onSubmit(values);
    } finally {
      setSaving(false);
    }
  };

  const isEdit = Boolean(property);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit property' : 'Add property'}</DialogTitle>
          <DialogDescription>
            {isEdit ? 'Changes show on your listing straight away.' : 'Vacant properties appear on the public listings so house hunters can enquire.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <Field label="Name">
            <input className={inputClass} value={values.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. 2 bedroom apartment, Kilimani" maxLength={120} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={values.type === 'bnb' ? 'Price per night (KES)' : 'Monthly rent (KES)'}>
              <input className={inputClass} type="number" inputMode="numeric" min={0} value={values.price} onChange={(e) => set('price', e.target.value)} placeholder="e.g. 45000" />
            </Field>
            <Field label="Type">
              <select className={inputClass} value={values.type} onChange={(e) => set('type', e.target.value as PropertyType)}>
                <option value="residential">Home</option>
                <option value="commercial">Commercial (office or shop)</option>
                <option value="bnb">Short stay</option>
              </select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Area or address">
              <input className={inputClass} value={values.location} onChange={(e) => set('location', e.target.value)} placeholder="e.g. Kilimani, Nairobi" maxLength={160} />
            </Field>
            <Field label="Unit number (optional)">
              <input className={inputClass} value={values.unitNumber} onChange={(e) => set('unitNumber', e.target.value)} placeholder="e.g. B4" maxLength={40} />
            </Field>
          </div>

          {allowBuildings && buildings.length > 0 && (
            <Field label="Building (optional)">
              <select className={inputClass} value={values.buildingId} onChange={(e) => set('buildingId', e.target.value)}>
                <option value="none">Not in a building</option>
                {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
          )}

          {isEdit && values.status !== 'rented' && (
            <Field label="Availability" hint="To mark a home as occupied, assign a tenant from the property card.">
              <select className={inputClass} value={values.status} onChange={(e) => set('status', e.target.value as PropertyStatus)}>
                <option value="available">Vacant (shown on listings)</option>
                <option value="booked">Booked (hidden from listings)</option>
              </select>
            </Field>
          )}

          <Field label="Description">
            <div className="space-y-2.5">
              <PropertyDescriptionPresets
                type={values.type}
                location={values.location}
                description={values.description}
                onChangeDescription={(next) => set('description', next)}
                amenities={values.amenities}
                onChangeAmenities={(next) => set('amenities', next)}
              />
              <textarea
                className={`${inputClass} h-24 py-2.5`}
                value={values.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder="Bedrooms, parking, water, security, nearby roads or schools…"
                maxLength={2000}
              />
            </div>
          </Field>

          <Field label="Amenities" hint="Separate with commas.">
            <input className={inputClass} value={values.amenities} onChange={(e) => set('amenities', e.target.value)} placeholder="Parking, Borehole, Backup generator" />
          </Field>

          <div className="grid gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Photos</span>
              {values.images.length > 0 && (
                <span className="text-xs font-medium text-zinc-500">{values.images.length} attached</span>
              )}
            </div>
            {values.images.length > 0 && (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {values.images.map((url, index) => (
                  <div key={url + index} className="group relative aspect-[4/3] overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-800">
                    <img src={resolveMediaUrl(url)} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                    <button
                      type="button"
                      aria-label="Remove photo"
                      onClick={() => set('images', values.images.filter((_, i) => i !== index))}
                      className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/65 text-white"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    {index === 0 && <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/65 px-2 py-0.5 text-[11px] text-white">Cover</span>}
                  </div>
                ))}
              </div>
            )}
            <PhotoCaptureControl
              variant="tile"
              multiple
              defaultFacingMode="environment"
              uploading={uploading}
              uploadLabel={values.images.length > 0 ? 'Upload more' : 'Upload photos'}
              captureLabel="Take photo"
              onFiles={onFiles}
            />
          </div>

          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300" role="alert">{error}</p>}
        </div>

        <DialogFooter>
          <ActionButton variant="secondary" onClick={onClose} disabled={saving}>Cancel</ActionButton>
          <ActionButton onClick={submit} loading={saving} disabled={uploading}>{isEdit ? 'Save changes' : 'Add property'}</ActionButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
