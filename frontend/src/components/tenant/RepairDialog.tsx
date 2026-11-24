import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { createMaintenanceRequest } from '../../lib/api';
import { PRIORITY_LABELS, type MaintenanceRequest, type TenantProperty } from './helpers';

interface RepairDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  property: TenantProperty;
  onCreated: (request: MaintenanceRequest) => void;
}

const PRIORITIES: MaintenanceRequest['priority'][] = ['low', 'medium', 'high', 'urgent'];
const PRIORITY_HINTS: Record<MaintenanceRequest['priority'], string> = {
  low: 'Small things, e.g. a loose handle',
  medium: 'Needs fixing this week',
  high: 'Affects daily life, e.g. no water',
  urgent: 'Danger to people or the house',
};

export default function RepairDialog({ open, onOpenChange, property, onCreated }: RepairDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<MaintenanceRequest['priority']>('medium');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const titleError = title.trim().length < 3 ? 'Say what is broken in a few words.' : '';
  const descriptionError = description.trim().length < 10 ? 'Add a little more detail (at least 10 characters).' : '';

  const submit = async () => {
    setTouched(true);
    if (titleError || descriptionError) return;
    setSaving(true);
    try {
      const created = await createMaintenanceRequest({
        propertyId: property.id,
        landlordId: property.landlordId,
        title: title.trim(),
        description: description.trim(),
        priority,
      });
      onCreated(created as MaintenanceRequest);
      toast.success('Repair reported. Your landlord has been notified.');
      setTitle('');
      setDescription('');
      setPriority('medium');
      setTouched(false);
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || 'Could not report the repair.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Report a repair</DialogTitle>
          <DialogDescription>Your landlord gets this straight away and can update you here.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="repair-title">What is broken?</Label>
            <Input
              id="repair-title"
              value={title}
              maxLength={120}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Kitchen sink is leaking"
              className="h-11"
              aria-invalid={touched && Boolean(titleError)}
            />
            {touched && titleError && <p className="text-xs text-rose-600">{titleError}</p>}
          </div>

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium text-zinc-900 dark:text-zinc-100">How urgent is it?</legend>
            <div className="grid grid-cols-2 gap-2">
              {PRIORITIES.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPriority(value)}
                  aria-pressed={priority === value}
                  className={`rounded-xl border p-3 text-left transition ${
                    priority === value
                      ? 'border-zinc-950 bg-zinc-950 text-white dark:border-white dark:bg-white dark:text-zinc-950'
                      : 'border-zinc-200 hover:border-zinc-400 dark:border-zinc-700'
                  }`}
                >
                  <span className="block text-sm font-semibold">{PRIORITY_LABELS[value]}</span>
                  <span className={`block text-xs ${priority === value ? 'opacity-80' : 'text-zinc-500'}`}>{PRIORITY_HINTS[value]}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="repair-description">Details</Label>
            <Textarea
              id="repair-description"
              value={description}
              maxLength={2000}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Where is it, when did it start, and is anything damaged?"
              className="min-h-[110px]"
              aria-invalid={touched && Boolean(descriptionError)}
            />
            {touched && descriptionError && <p className="text-xs text-rose-600">{descriptionError}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="animate-spin" />} Send report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
