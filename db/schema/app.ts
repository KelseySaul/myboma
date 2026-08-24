import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  timestamp,
  numeric,
  date,
  jsonb,
  unique,
} from 'drizzle-orm/pg-core';
import { authUser } from './auth';

// Mirrors supabase-setup.sql 1:1. Every text column that previously had a
// Postgres CHECK against a fixed set becomes a pgEnum here; everything else
// (including deliberately loose columns like properties.tenantId /
// rentPayments.tenantId, which historically hold either a uid or an email)
// keeps its original type.

export const userRoleEnum = pgEnum('user_role', ['landlord', 'tenant', 'hunter', 'admin']);
export const activeSuspendedEnum = pgEnum('active_suspended_status', ['active', 'suspended']);
export const propertyTypeEnum = pgEnum('property_type', ['residential', 'commercial', 'bnb']);
export const propertyStatusEnum = pgEnum('property_status', ['available', 'rented', 'booked']);
export const maintenanceStatusEnum = pgEnum('maintenance_status', ['pending', 'in-progress', 'resolved']);
export const maintenancePriorityEnum = pgEnum('maintenance_priority', ['low', 'medium', 'high', 'urgent']);
// 'verifying' isn't in supabase-setup.sql's CHECK constraint but is genuinely used by
// the app (tenant-submitted manual receipts awaiting landlord confirmation) — see
// app.ts's /rent-payments/:paymentId/mark-manual and TenantDashboard.tsx. The checked-in
// SQL file was stale; this matches actual behavior.
export const rentPaymentStatusEnum = pgEnum('rent_payment_status', ['paid', 'pending', 'overdue', 'verifying']);
export const paymentProviderEnum = pgEnum('payment_provider', ['stripe', 'mpesa', 'manual', 'pesapal']);
export const settlementStatusEnum = pgEnum('settlement_status', ['pending', 'initiated', 'settled', 'failed']);
export const bookingStatusEnum = pgEnum('booking_status', ['pending', 'confirmed', 'cancelled']);
export const propertyManagerRoleEnum = pgEnum('property_manager_role', ['manager', 'co-owner']);
export const waitlistStatusEnum = pgEnum('waitlist_status', ['subscribed', 'unsubscribed']);
export const subscriptionStatusEnum = pgEnum('subscription_status', ['none', 'pending', 'active', 'expired', 'suspended']);
export const landlordSubPaymentChannelEnum = pgEnum('landlord_sub_payment_channel', ['mpesa', 'bank', 'stripe', 'pesapal']);
export const landlordSubPaymentStatusEnum = pgEnum('landlord_sub_payment_status', ['pending', 'confirmed', 'rejected']);
export const rentPayoutMethodEnum = pgEnum('rent_payout_method', ['cash', 'mpesa', 'bank']);

export const platforms = pgTable('platforms', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  ownerEmail: text('ownerEmail'),
  brandLogoUrl: text('brandLogoUrl'),
  brandPrimaryColor: text('brandPrimaryColor'),
  brandSecondaryColor: text('brandSecondaryColor'),
  status: activeSuspendedEnum('status').notNull().default('active'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable('users', {
  uid: uuid('uid').primaryKey().references(() => authUser.id, { onDelete: 'cascade' }),
  platformId: uuid('platformId').references(() => platforms.id, { onDelete: 'set null' }),
  managedByAdminId: uuid('managedByAdminId').references(() => authUser.id, { onDelete: 'set null' }),
  rentRecipientId: uuid('rentRecipientId').references(() => authUser.id, { onDelete: 'set null' }),
  email: text('email').notNull().unique(),
  displayName: text('displayName').notNull().default('User'),
  role: userRoleEnum('role').notNull().default('hunter'),
  isAdmin: boolean('isAdmin').notNull().default(false),
  isSuperAdmin: boolean('isSuperAdmin').notNull().default(false),
  phone: text('phone'),
  address: text('address'),
  avatarUrl: text('avatarUrl'),
  termsAcceptedAt: timestamp('termsAcceptedAt', { withTimezone: true }),
  termsVersion: text('termsVersion'),
  privacyVersion: text('privacyVersion'),
  stripeAccountId: text('stripeAccountId'),
  mpesaSettlementPhone: text('mpesaSettlementPhone'),
  mpesaSettlementShortCode: text('mpesaSettlementShortCode'),
  bankName: text('bankName'),
  bankAccountNumber: text('bankAccountNumber'),
  bankAccountName: text('bankAccountName'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  mustChangePassword: boolean('mustChangePassword').notNull().default(false),
  status: activeSuspendedEnum('status').notNull().default('active'),
  rentPayoutMethod: rentPayoutMethodEnum('rentPayoutMethod'),
  cashPayoutNotes: text('cashPayoutNotes'),
  subscriptionPlan: text('subscriptionPlan'),
  subscriptionStatus: subscriptionStatusEnum('subscriptionStatus').notNull().default('none'),
  subscriptionExpiresAt: timestamp('subscriptionExpiresAt', { withTimezone: true }),
});

export const buildings = pgTable('buildings', {
  id: uuid('id').primaryKey().defaultRandom(),
  platformId: uuid('platformId').references(() => platforms.id, { onDelete: 'cascade' }),
  landlordId: uuid('landlordId').notNull().references(() => users.uid, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  address: text('address'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
});

export const properties = pgTable('properties', {
  id: uuid('id').primaryKey().defaultRandom(),
  platformId: uuid('platformId').references(() => platforms.id, { onDelete: 'cascade' }),
  landlordId: uuid('landlordId').notNull().references(() => users.uid, { onDelete: 'cascade' }),
  buildingId: uuid('buildingId').references(() => buildings.id, { onDelete: 'set null' }),
  unitNumber: text('unitNumber'),
  title: text('title').notNull(),
  description: text('description'),
  type: propertyTypeEnum('type').notNull(),
  price: numeric('price', { precision: 14, scale: 2 }).notNull(),
  location: text('location').notNull(),
  images: text('images').array().notNull().default([]),
  status: propertyStatusEnum('status').notNull().default('available'),
  amenities: text('amenities').array().notNull().default([]),
  // Historically loose: holds either a uid or an email. Preserved as-is.
  tenantId: text('tenantId'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
});

export const maintenanceRequests = pgTable('maintenanceRequests', {
  id: uuid('id').primaryKey().defaultRandom(),
  platformId: uuid('platformId').references(() => platforms.id, { onDelete: 'cascade' }),
  tenantId: uuid('tenantId').notNull().references(() => users.uid, { onDelete: 'cascade' }),
  propertyId: uuid('propertyId').notNull().references(() => properties.id, { onDelete: 'cascade' }),
  landlordId: uuid('landlordId').notNull().references(() => users.uid, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').notNull(),
  status: maintenanceStatusEnum('status').notNull().default('pending'),
  priority: maintenancePriorityEnum('priority').notNull().default('medium'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
});

export const rentPayments = pgTable('rentPayments', {
  id: uuid('id').primaryKey().defaultRandom(),
  platformId: uuid('platformId').references(() => platforms.id, { onDelete: 'cascade' }),
  // Historically loose: holds either a uid or an email. Preserved as-is.
  tenantId: text('tenantId').notNull(),
  propertyId: uuid('propertyId').notNull().references(() => properties.id, { onDelete: 'cascade' }),
  landlordId: uuid('landlordId').notNull().references(() => users.uid, { onDelete: 'cascade' }),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  status: rentPaymentStatusEnum('status').notNull().default('pending'),
  dueDate: date('dueDate').notNull(),
  paidAt: timestamp('paidAt', { withTimezone: true }),
  receiptUrl: text('receiptUrl'),
  paymentProvider: paymentProviderEnum('paymentProvider'),
  providerReference: text('providerReference'),
  providerCheckoutRequestId: text('providerCheckoutRequestId'),
  providerMerchantRequestId: text('providerMerchantRequestId'),
  paymentMetadata: jsonb('paymentMetadata').notNull().default({}),
  settlementStatus: settlementStatusEnum('settlementStatus'),
  settlementReference: text('settlementReference'),
  settledAt: timestamp('settledAt', { withTimezone: true }),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
});

export const bookings = pgTable('bookings', {
  id: uuid('id').primaryKey().defaultRandom(),
  platformId: uuid('platformId').references(() => platforms.id, { onDelete: 'cascade' }),
  hunterId: uuid('hunterId').notNull().references(() => users.uid, { onDelete: 'cascade' }),
  propertyId: uuid('propertyId').notNull().references(() => properties.id, { onDelete: 'cascade' }),
  landlordId: uuid('landlordId').notNull().references(() => users.uid, { onDelete: 'cascade' }),
  startDate: date('startDate').notNull(),
  endDate: date('endDate').notNull(),
  totalPrice: numeric('totalPrice', { precision: 14, scale: 2 }).notNull(),
  status: bookingStatusEnum('status').notNull().default('confirmed'),
  paymentReference: text('paymentReference'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
});

export const expenses = pgTable('expenses', {
  id: uuid('id').primaryKey().defaultRandom(),
  platformId: uuid('platformId').references(() => platforms.id, { onDelete: 'cascade' }),
  landlordId: uuid('landlordId').notNull().references(() => users.uid, { onDelete: 'cascade' }),
  propertyId: uuid('propertyId').references(() => properties.id, { onDelete: 'set null' }),
  category: text('category').notNull().default('general'),
  description: text('description').notNull(),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  expenseDate: date('expenseDate').notNull().defaultNow(),
  receiptUrl: text('receiptUrl'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
});

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  platformId: uuid('platformId').references(() => platforms.id, { onDelete: 'cascade' }),
  recipientEmail: text('recipientEmail').notNull(),
  type: text('type'),
  title: text('title').notNull(),
  message: text('message'),
  propertyId: uuid('propertyId').references(() => properties.id, { onDelete: 'set null' }),
  read: boolean('read').notNull().default(false),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
});

export const invitations = pgTable('invitations', {
  email: text('email').primaryKey(),
  platformId: uuid('platformId').references(() => platforms.id, { onDelete: 'cascade' }),
  displayName: text('displayName'),
  phone: text('phone'),
  role: userRoleEnum('role').notNull().default('tenant'),
  landlordId: uuid('landlordId').references(() => users.uid, { onDelete: 'cascade' }),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
});

export const propertyManagers = pgTable('property_managers', {
  id: uuid('id').primaryKey().defaultRandom(),
  propertyId: uuid('propertyId').notNull().references(() => properties.id, { onDelete: 'cascade' }),
  userId: uuid('userId').notNull().references(() => users.uid, { onDelete: 'cascade' }),
  landlordId: uuid('landlordId').notNull().references(() => users.uid, { onDelete: 'cascade' }),
  role: propertyManagerRoleEnum('role').notNull().default('manager'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  unique().on(table.propertyId, table.userId),
]);

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  platformId: uuid('platformId').references(() => platforms.id, { onDelete: 'set null' }),
  userId: uuid('userId').references(() => authUser.id, { onDelete: 'set null' }),
  userEmail: text('userEmail'),
  action: text('action').notNull(),
  resource: text('resource'),
  resourceId: text('resourceId'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
});

export const waitlistSignups = pgTable('waitlistSignups', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  source: text('source').notNull().default('landing-page'),
  status: waitlistStatusEnum('status').notNull().default('subscribed'),
  unsubscribeToken: uuid('unsubscribeToken').notNull().defaultRandom(),
  consentAt: timestamp('consentAt', { withTimezone: true }).notNull().defaultNow(),
  unsubscribedAt: timestamp('unsubscribedAt', { withTimezone: true }),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
});

export const landlordSubscriptionPayments = pgTable('landlordSubscriptionPayments', {
  id: uuid('id').primaryKey().defaultRandom(),
  landlordId: uuid('landlordId').notNull().references(() => users.uid, { onDelete: 'cascade' }),
  plan: text('plan').notNull(),
  providerCheckoutRequestId: text('providerCheckoutRequestId'),
  paymentProvider: text('paymentProvider'),
  amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
  paymentChannel: landlordSubPaymentChannelEnum('paymentChannel').notNull(),
  paymentReference: text('paymentReference').notNull(),
  status: landlordSubPaymentStatusEnum('status').notNull().default('confirmed'),
  receiptNumber: text('receiptNumber').notNull().unique(),
  receiptText: text('receiptText'),
  periodStart: timestamp('periodStart', { withTimezone: true }).notNull().defaultNow(),
  periodEnd: timestamp('periodEnd', { withTimezone: true }).notNull(),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
});
