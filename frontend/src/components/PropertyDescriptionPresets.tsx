import { Sparkles, Check, RotateCcw } from 'lucide-react';

export type PresetPropertyType = 'residential' | 'commercial' | 'bnb';

interface TemplateOption {
  id: string;
  label: string;
  build: (location?: string) => string;
  suggestedAmenities: string[];
}

const TEMPLATES_BY_TYPE: Record<PresetPropertyType, TemplateOption[]> = {
  residential: [
    {
      id: 'modern-apt',
      label: 'Modern apartment',
      build: (loc) =>
        `Bright, spacious apartment${loc ? ` in ${loc}` : ''} featuring an open-plan living area, modern fitted kitchen, generous wardrobes, steady borehole water, and 24/7 manned security with CCTV.`,
      suggestedAmenities: ['24/7 Security', 'Borehole Water', 'Parking', 'Fibre Internet'],
    },
    {
      id: 'family-home',
      label: 'Family home',
      build: (loc) =>
        `Well-maintained family home${loc ? ` in ${loc}` : ''} with generous bedrooms, master en-suite, private compound, reliable water supply, and secure parking — close to schools, shops, and main roads.`,
      suggestedAmenities: ['Master En-suite', 'Private Compound', 'Parking', '24/7 Security'],
    },
    {
      id: 'studio-bedsitter',
      label: 'Studio / bedsitter',
      build: (loc) =>
        `Clean, modern studio unit${loc ? ` in ${loc}` : ''} with tiled floors, kitchenette cabinets, instant shower, pre-paid electricity token meter, and reliable water in a quiet, secure building.`,
      suggestedAmenities: ['Token Electricity', 'Instant Shower', '24/7 Security', 'Fibre Internet'],
    },
  ],
  commercial: [
    {
      id: 'exec-office',
      label: 'Executive office',
      build: (loc) =>
        `Professional commercial office space${loc ? ` in ${loc}` : ''} with ample natural light, high-speed fibre connectivity, backup generator, lift access, washrooms, and dedicated tenant/client parking.`,
      suggestedAmenities: ['Backup Generator', 'Fibre Internet', 'Lift Access', 'Parking', '24/7 Security'],
    },
    {
      id: 'retail-shop',
      label: 'Retail / shopfront',
      build: (loc) =>
        `Prime ground-floor retail space${loc ? ` in ${loc}` : ''} with high foot traffic, wide glass frontage, clean utilities, strong security, and easy road access for customers and deliveries.`,
      suggestedAmenities: ['Road Frontage', '24/7 Security', 'Parking', 'Steady Water'],
    },
    {
      id: 'warehouse-space',
      label: 'Warehouse / showroom',
      build: (loc) =>
        `Spacious commercial unit${loc ? ` in ${loc}` : ''} ideal for storage, distribution, or showroom use — high ceiling clearance, three-phase power, loading bay access, and 24/7 perimeter security.`,
      suggestedAmenities: ['3-Phase Power', 'Loading Access', '24/7 Security', 'Parking'],
    },
  ],
  bnb: [
    {
      id: 'furnished-stay',
      label: 'Furnished short stay',
      build: (loc) =>
        `Stylish fully furnished apartment${loc ? ` in ${loc}` : ''} with fast Wi-Fi, Smart TV, fully equipped kitchen, crisp hotel-grade linens, hot shower, and 24/7 self check-in security.`,
      suggestedAmenities: ['Fast Wi-Fi', 'Smart TV', 'Fully Furnished', 'Equipped Kitchen', '24/7 Security'],
    },
    {
      id: 'holiday-retreat',
      label: 'Holiday villa / retreat',
      build: (loc) =>
        `Relaxing getaway stay${loc ? ` in ${loc}` : ''} offering peaceful interiors, outdoor seating area, high-speed Wi-Fi, housekeeping support, backup power, and secure on-site parking.`,
      suggestedAmenities: ['Fast Wi-Fi', 'Backup Power', 'Housekeeping', 'Parking', 'Private Balcony'],
    },
  ],
};

const QUICK_HIGHLIGHTS: { label: string; snippet: string; amenity?: string }[] = [
  { label: '24/7 Security & CCTV', snippet: '24/7 security & CCTV surveillance', amenity: '24/7 Security' },
  { label: 'Borehole water', snippet: 'reliable borehole water supply', amenity: 'Borehole Water' },
  { label: 'Backup power', snippet: 'backup power for uninterrupted electricity', amenity: 'Backup Generator' },
  { label: 'Ample parking', snippet: 'ample secure parking', amenity: 'Parking' },
  { label: 'Fibre Wi-Fi ready', snippet: 'high-speed fibre internet ready', amenity: 'Fibre Internet' },
  { label: 'Master en-suite', snippet: 'master bedroom en-suite', amenity: 'Master En-suite' },
  { label: 'Modern kitchen', snippet: 'modern fitted kitchen with storage', amenity: 'Fitted Kitchen' },
  { label: 'Private balcony', snippet: 'private balcony with natural light', amenity: 'Balcony' },
  { label: 'Near main road', snippet: 'easy access to main roads, schools, and malls' },
  { label: 'Token electricity', snippet: 'individual KPLC pre-paid token meter', amenity: 'Token Electricity' },
];

interface PropertyDescriptionPresetsProps {
  type: PresetPropertyType;
  location?: string;
  description: string;
  onChangeDescription: (next: string) => void;
  amenities?: string;
  onChangeAmenities?: (next: string) => void;
}

/**
 * Predetermined templates + toggleable highlight chips so landlords can write polished,
 * accurate property descriptions in two taps instead of typing from scratch.
 */
export default function PropertyDescriptionPresets({
  type,
  location,
  description,
  onChangeDescription,
  amenities,
  onChangeAmenities,
}: PropertyDescriptionPresetsProps) {
  const templates = TEMPLATES_BY_TYPE[type] ?? TEMPLATES_BY_TYPE.residential;
  const cleanLocation = location?.trim() || undefined;

  const mergeAmenities = (toAdd: string[]) => {
    if (!onChangeAmenities || toAdd.length === 0) return;
    const current = (amenities ?? '')
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean);
    const seen = new Set(current.map((a) => a.toLowerCase()));
    for (const item of toAdd) {
      if (!seen.has(item.toLowerCase())) {
        current.push(item);
        seen.add(item.toLowerCase());
      }
    }
    onChangeAmenities(current.join(', '));
  };

  const applyTemplate = (tpl: TemplateOption) => {
    onChangeDescription(tpl.build(cleanLocation));
    mergeAmenities(tpl.suggestedAmenities);
  };

  const isSnippetIncluded = (snippet: string) =>
    description.toLowerCase().includes(snippet.toLowerCase());

  const toggleHighlight = (item: (typeof QUICK_HIGHLIGHTS)[number]) => {
    if (isSnippetIncluded(item.snippet)) {
      const escaped = item.snippet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const cleaned = description
        .replace(new RegExp(`(?:\\.\\s*Includes\\s+|,\\s*|\\s*•\\s*)?${escaped}\\.?`, 'i'), '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      onChangeDescription(cleaned);
      return;
    }

    const base = description.trim();
    const sentence = item.snippet.charAt(0).toUpperCase() + item.snippet.slice(1);
    const next = base
      ? `${base.replace(/[.!?\s]+$/, '')}. Includes ${item.snippet}.`
      : `${sentence}.`;
    onChangeDescription(next);
    if (item.amenity) mergeAmenities([item.amenity]);
  };

  return (
    <div className="space-y-2.5 rounded-xl border border-zinc-200/90 bg-zinc-50/75 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
          <Sparkles className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
          Quick-fill description
        </span>
        {description.trim().length > 0 && (
          <button
            type="button"
            onClick={() => onChangeDescription('')}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-500 transition hover:text-zinc-900 dark:hover:text-white"
          >
            <RotateCcw className="h-3 w-3" />
            Clear
          </button>
        )}
      </div>

      {/* Starter templates */}
      <div className="flex flex-wrap gap-1.5">
        {templates.map((tpl) => (
          <button
            key={tpl.id}
            type="button"
            onClick={() => applyTemplate(tpl)}
            className="rounded-lg border border-violet-200/80 bg-white px-2.5 py-1 text-xs font-semibold text-violet-800 shadow-2xs transition hover:border-violet-400 hover:bg-violet-50 dark:border-violet-500/30 dark:bg-zinc-900 dark:text-violet-300 dark:hover:bg-violet-950/40"
          >
            Use “{tpl.label}”
          </button>
        ))}
      </div>

      {/* Quick highlight toggles */}
      <div className="flex flex-wrap gap-1.5 pt-0.5">
        {QUICK_HIGHLIGHTS.map((item) => {
          const active = isSnippetIncluded(item.snippet);
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => toggleHighlight(item)}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                active
                  ? 'bg-violet-700 text-white shadow-2xs'
                  : 'border border-zinc-200 bg-white text-zinc-700 hover:border-violet-300 hover:text-violet-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'
              }`}
            >
              {active && <Check className="h-3 w-3" />}
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
