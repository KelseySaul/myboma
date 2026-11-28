/**
 * Database-backed prepaid subscription plans service.
 * Loads plans from `subscription_plans`, keeps a short in-memory cache (invalidated on
 * every Super Admin create/update/delete), and resolves live prices and limits everywhere.
 */
import {asc, eq, sql} from 'drizzle-orm';
import {z} from 'zod';
import {rootDb as db, schema} from '../../db/client.ts';
import {
  DEFAULT_SUBSCRIPTION_PLANS,
  PLAN_SLUG_RE,
  SUBSCRIPTION_TIERS,
  getDynamicPlanAmount,
  parseSubscriptionPlan,
  type BillingPeriod,
  type BuiltInSubscriptionTier,
  type DynamicSubscriptionPlan,
  type PlanAudienceType,
} from '../../../shared/landlordSubscription.ts';

const CACHE_TTL_MS = 30_000;
let cachedPlans: {expiresAt: number; rows: DynamicSubscriptionPlan[]} | null = null;
let seededChecked = false;

export const invalidateSubscriptionPlansCache = () => {
  cachedPlans = null;
};

const normalizeAudience = (value: unknown): PlanAudienceType =>
  value === 'property_manager' || value === 'both' ? value : 'landlord';

const toDynamicPlan = (row: typeof schema.subscriptionPlans.$inferSelect): DynamicSubscriptionPlan => ({
  id: row.id,
  label: row.label,
  badge: row.badge ?? null,
  audienceType: normalizeAudience(row.audienceType),
  description: row.description || '',
  monthlyPriceKes: Number(row.monthlyPriceKes) || 0,
  quarterlyPriceKes: row.quarterlyPriceKes === null || row.quarterlyPriceKes === undefined ? null : Number(row.quarterlyPriceKes),
  yearlyPriceKes: row.yearlyPriceKes === null || row.yearlyPriceKes === undefined ? null : Number(row.yearlyPriceKes),
  maxListings: row.maxListings === null || row.maxListings === undefined ? null : Number(row.maxListings),
  maxBuildings: row.maxBuildings === null || row.maxBuildings === undefined ? null : Number(row.maxBuildings),
  maintenanceHub: Boolean(row.maintenanceHub),
  caretakerAccess: Boolean(row.caretakerAccess),
  agencyAccess: Boolean(row.agencyAccess),
  highlights: Array.isArray(row.highlights) ? row.highlights.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [],
  sortOrder: Number(row.sortOrder) || 0,
  isActive: Boolean(row.isActive),
  isSystem: Boolean(row.isSystem),
});

async function ensureSeededPlans() {
  if (seededChecked) return;
  try {
    // Ensure table exists idempotently (mirrors backend/migrations/14-subscription-plans.sql)
    // so deploys never fail even if a manual SQL migration step hasn't run yet.
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS subscription_plans (
        id text PRIMARY KEY,
        label text NOT NULL,
        badge text,
        "audienceType" text NOT NULL DEFAULT 'landlord',
        description text NOT NULL DEFAULT '',
        "monthlyPriceKes" integer NOT NULL DEFAULT 0,
        "quarterlyPriceKes" integer,
        "yearlyPriceKes" integer,
        "maxListings" integer,
        "maxBuildings" integer,
        "maintenanceHub" boolean NOT NULL DEFAULT true,
        "caretakerAccess" boolean NOT NULL DEFAULT false,
        "agencyAccess" boolean NOT NULL DEFAULT false,
        highlights jsonb NOT NULL DEFAULT '[]'::jsonb,
        "sortOrder" integer NOT NULL DEFAULT 0,
        "isActive" boolean NOT NULL DEFAULT true,
        "isSystem" boolean NOT NULL DEFAULT false,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await db
      .execute(sql`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'myboma_rls') THEN
            GRANT SELECT ON TABLE subscription_plans TO myboma_rls;
          END IF;
        END $$;
      `)
      .catch(() => undefined);

    const existing = await db.select({id: schema.subscriptionPlans.id}).from(schema.subscriptionPlans).limit(1);
    if (existing.length === 0) {
      await db
        .insert(schema.subscriptionPlans)
        .values(
          DEFAULT_SUBSCRIPTION_PLANS.map((p) => ({
            id: p.id,
            label: p.label,
            badge: p.badge ?? null,
            audienceType: p.audienceType,
            description: p.description,
            monthlyPriceKes: p.monthlyPriceKes,
            quarterlyPriceKes: p.quarterlyPriceKes,
            yearlyPriceKes: p.yearlyPriceKes,
            maxListings: p.maxListings,
            maxBuildings: p.maxBuildings,
            maintenanceHub: p.maintenanceHub,
            caretakerAccess: p.caretakerAccess,
            agencyAccess: p.agencyAccess,
            highlights: p.highlights,
            sortOrder: p.sortOrder,
            isActive: p.isActive,
            isSystem: p.isSystem,
          })),
        )
        .onConflictDoNothing();
    }
    seededChecked = true;
  } catch (err) {
    console.warn('[Plans] Could not verify/seed subscription_plans table yet:', err instanceof Error ? err.message : err);
  }
}

export async function listSubscriptionPlans(options: {includeInactive?: boolean} = {}): Promise<DynamicSubscriptionPlan[]> {
  const now = Date.now();
  if (!cachedPlans || cachedPlans.expiresAt <= now) {
    try {
      await ensureSeededPlans();
      const rows = await db
        .select()
        .from(schema.subscriptionPlans)
        .orderBy(asc(schema.subscriptionPlans.sortOrder), asc(schema.subscriptionPlans.monthlyPriceKes), asc(schema.subscriptionPlans.label));
      const mapped = rows.length > 0 ? rows.map(toDynamicPlan) : DEFAULT_SUBSCRIPTION_PLANS;
      cachedPlans = {expiresAt: now + CACHE_TTL_MS, rows: mapped};
    } catch (err) {
      console.warn('[Plans] Falling back to built-in default plans:', err instanceof Error ? err.message : err);
      return options.includeInactive ? DEFAULT_SUBSCRIPTION_PLANS : DEFAULT_SUBSCRIPTION_PLANS.filter((p) => p.isActive);
    }
  }
  return options.includeInactive ? cachedPlans.rows : cachedPlans.rows.filter((p) => p.isActive);
}

export async function getSubscriptionPlanById(tierId: string): Promise<DynamicSubscriptionPlan | null> {
  const normalized = tierId.trim().toLowerCase();
  const plans = await listSubscriptionPlans({includeInactive: true});
  const match = plans.find((p) => p.id === normalized);
  if (match) return match;

  // Legacy built-in fallback (e.g. 'basic' tier for older accounts)
  const legacy = SUBSCRIPTION_TIERS[normalized as BuiltInSubscriptionTier];
  if (legacy) {
    return {
      id: legacy.id,
      label: legacy.label,
      badge: legacy.badge ?? null,
      audienceType: legacy.features.agencyAccess ? 'property_manager' : 'landlord',
      description: legacy.audience,
      monthlyPriceKes: legacy.monthlyBaseKes,
      quarterlyPriceKes: legacy.monthlyBaseKes === 0 ? 0 : Math.round(legacy.monthlyBaseKes * 2.7),
      yearlyPriceKes: typeof legacy.yearlyKes === 'number' ? legacy.yearlyKes : Math.round(legacy.monthlyBaseKes * 10),
      maxListings: legacy.features.maxListings,
      maxBuildings: legacy.features.maxBuildings,
      maintenanceHub: legacy.features.maintenanceHub,
      caretakerAccess: legacy.features.caretakerAccess,
      agencyAccess: legacy.features.agencyAccess,
      highlights: [...legacy.highlights],
      sortOrder: 99,
      isActive: false,
      isSystem: false,
    };
  }
  return null;
}

export async function resolvePlanAmountKes(tierId: string, billing: BillingPeriod): Promise<number | null> {
  const plan = await getSubscriptionPlanById(tierId);
  if (!plan) return null;
  return getDynamicPlanAmount(plan, billing);
}

/**
 * Resolves live unit limit, building limit, and feature entitlements for a user profile
 * directly from the database-backed `subscription_plans` table.
 */
export async function resolveLivePlanEntitlements(profile: {
  isAdmin?: boolean | null;
  isSuperAdmin?: boolean | null;
  subscriptionPlan?: string | null;
  subscriptionStatus?: string | null;
  subscriptionExpiresAt?: Date | string | null;
}): Promise<{
  maxListings: number | null;
  maxBuildings: number | null;
  maintenanceHub: boolean;
  caretakerAccess: boolean;
  agencyAccess: boolean;
  planLabel: string;
}> {
  if (profile.isSuperAdmin || profile.isAdmin) {
    return {
      maxListings: null,
      maxBuildings: null,
      maintenanceHub: true,
      caretakerAccess: true,
      agencyAccess: true,
      planLabel: 'Admin',
    };
  }
  const active =
    profile.subscriptionStatus === 'active' &&
    (!profile.subscriptionExpiresAt || new Date(profile.subscriptionExpiresAt).getTime() > Date.now());
  const parsed = parseSubscriptionPlan(profile.subscriptionPlan ?? null);
  if (!parsed || !active) {
    return {
      maxListings: 0,
      maxBuildings: 0,
      maintenanceHub: false,
      caretakerAccess: false,
      agencyAccess: false,
      planLabel: 'No active plan',
    };
  }
  const plan = await getSubscriptionPlanById(parsed.tier);
  if (!plan) {
    return {
      maxListings: 0,
      maxBuildings: 0,
      maintenanceHub: false,
      caretakerAccess: false,
      agencyAccess: false,
      planLabel: parsed.tier,
    };
  }
  return {
    maxListings: plan.maxListings,
    maxBuildings: plan.maxBuildings,
    maintenanceHub: plan.maintenanceHub,
    caretakerAccess: plan.caretakerAccess,
    agencyAccess: plan.agencyAccess,
    planLabel: plan.label,
  };
}

export const slugifyPlanId = (raw: string): string =>
  raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

export const createSubscriptionPlanSchema = z
  .object({
    id: z.string().trim().min(2).max(48).optional(),
    label: z.string().trim().min(2).max(80),
    badge: z.string().trim().max(40).nullable().optional(),
    audienceType: z.enum(['landlord', 'property_manager', 'both']).default('landlord'),
    description: z.string().trim().max(280).optional().default(''),
    monthlyPriceKes: z.number().int().min(0).max(50_000_000),
    quarterlyPriceKes: z.number().int().min(0).max(150_000_000).nullable().optional(),
    yearlyPriceKes: z.number().int().min(0).max(500_000_000).nullable().optional(),
    maxListings: z.number().int().min(1).max(100_000).nullable(),
    maxBuildings: z.number().int().min(1).max(50_000).nullable(),
    maintenanceHub: z.boolean().default(true),
    caretakerAccess: z.boolean().default(false),
    agencyAccess: z.boolean().default(false),
    highlights: z.array(z.string().trim().min(1).max(160)).max(12).default([]),
    sortOrder: z.number().int().min(0).max(10_000).optional(),
    isActive: z.boolean().default(true),
  })
  .strict();

export const updateSubscriptionPlanSchema = createSubscriptionPlanSchema
  .omit({id: true})
  .partial()
  .strict();

export async function createSubscriptionPlan(
  input: z.infer<typeof createSubscriptionPlanSchema>,
): Promise<DynamicSubscriptionPlan> {
  await ensureSeededPlans();
  const candidateId = slugifyPlanId(input.id || input.label);
  if (!PLAN_SLUG_RE.test(candidateId)) {
    throw Object.assign(new Error('Plan ID must contain 2–48 lowercase letters, numbers, hyphens, or underscores.'), {
      statusCode: 400,
    });
  }
  const existing = await db.query.subscriptionPlans.findFirst({
    where: eq(schema.subscriptionPlans.id, candidateId),
    columns: {id: true},
  });
  if (existing) {
    throw Object.assign(new Error(`A plan with ID "${candidateId}" already exists.`), {statusCode: 409});
  }

  const allPlans = await listSubscriptionPlans({includeInactive: true});
  const nextSort =
    input.sortOrder ??
    (allPlans.reduce((max, p) => Math.max(max, p.sortOrder), 0) + 10);

  const [created] = await db
    .insert(schema.subscriptionPlans)
    .values({
      id: candidateId,
      label: input.label,
      badge: input.badge?.trim() || null,
      audienceType: input.audienceType,
      description: input.description,
      monthlyPriceKes: input.monthlyPriceKes,
      quarterlyPriceKes:
        input.quarterlyPriceKes !== undefined
          ? input.quarterlyPriceKes
          : input.monthlyPriceKes === 0
            ? 0
            : Math.round(input.monthlyPriceKes * 2.7),
      yearlyPriceKes:
        input.yearlyPriceKes !== undefined
          ? input.yearlyPriceKes
          : input.monthlyPriceKes === 0
            ? 0
            : Math.round(input.monthlyPriceKes * 10),
      maxListings: input.maxListings,
      maxBuildings: input.maxBuildings,
      maintenanceHub: input.maintenanceHub,
      caretakerAccess: input.caretakerAccess,
      agencyAccess: input.agencyAccess,
      highlights: input.highlights,
      sortOrder: nextSort,
      isActive: input.isActive,
      isSystem: false,
      updatedAt: new Date(),
    })
    .returning();

  invalidateSubscriptionPlansCache();
  return toDynamicPlan(created);
}

export async function updateSubscriptionPlan(
  planId: string,
  input: z.infer<typeof updateSubscriptionPlanSchema>,
): Promise<DynamicSubscriptionPlan> {
  await ensureSeededPlans();
  const id = planId.trim().toLowerCase();
  const existing = await db.query.subscriptionPlans.findFirst({
    where: eq(schema.subscriptionPlans.id, id),
  });
  if (!existing) {
    throw Object.assign(new Error('Plan not found.'), {statusCode: 404});
  }
  if (id === 'free' && input.monthlyPriceKes !== undefined && input.monthlyPriceKes > 0) {
    throw Object.assign(new Error('The Free plan must remain KES 0. Create a paid plan for charged tiers.'), {
      statusCode: 400,
    });
  }

  const [updated] = await db
    .update(schema.subscriptionPlans)
    .set({
      ...(input.label !== undefined ? {label: input.label} : {}),
      ...(input.badge !== undefined ? {badge: input.badge?.trim() || null} : {}),
      ...(input.audienceType !== undefined ? {audienceType: input.audienceType} : {}),
      ...(input.description !== undefined ? {description: input.description} : {}),
      ...(input.monthlyPriceKes !== undefined ? {monthlyPriceKes: input.monthlyPriceKes} : {}),
      ...(input.quarterlyPriceKes !== undefined ? {quarterlyPriceKes: input.quarterlyPriceKes} : {}),
      ...(input.yearlyPriceKes !== undefined ? {yearlyPriceKes: input.yearlyPriceKes} : {}),
      ...(input.maxListings !== undefined ? {maxListings: input.maxListings} : {}),
      ...(input.maxBuildings !== undefined ? {maxBuildings: input.maxBuildings} : {}),
      ...(input.maintenanceHub !== undefined ? {maintenanceHub: input.maintenanceHub} : {}),
      ...(input.caretakerAccess !== undefined ? {caretakerAccess: input.caretakerAccess} : {}),
      ...(input.agencyAccess !== undefined ? {agencyAccess: input.agencyAccess} : {}),
      ...(input.highlights !== undefined ? {highlights: input.highlights} : {}),
      ...(input.sortOrder !== undefined ? {sortOrder: input.sortOrder} : {}),
      ...(input.isActive !== undefined ? {isActive: id === 'free' ? true : input.isActive} : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.subscriptionPlans.id, id))
    .returning();

  invalidateSubscriptionPlansCache();
  return toDynamicPlan(updated);
}

export async function deleteSubscriptionPlan(planId: string): Promise<{deleted: true}> {
  await ensureSeededPlans();
  const id = planId.trim().toLowerCase();
  const existing = await db.query.subscriptionPlans.findFirst({
    where: eq(schema.subscriptionPlans.id, id),
  });
  if (!existing) {
    throw Object.assign(new Error('Plan not found.'), {statusCode: 404});
  }
  if (existing.isSystem || id === 'free') {
    throw Object.assign(new Error('The built-in Free plan cannot be deleted, though you can edit its unit and building limits.'), {
      statusCode: 400,
    });
  }

  const allUsers = await db
    .select({subscriptionPlan: schema.users.subscriptionPlan})
    .from(schema.users);
  const inUse = allUsers.some((u) => parseSubscriptionPlan(u.subscriptionPlan)?.tier === id);
  if (inUse) {
    throw Object.assign(
      new Error('Users are currently subscribed to this plan. Set it to Hidden/Inactive instead of deleting so active accounts keep their entitlements.'),
      {statusCode: 409},
    );
  }

  await db.delete(schema.subscriptionPlans).where(eq(schema.subscriptionPlans.id, id));
  invalidateSubscriptionPlansCache();
  return {deleted: true};
}
