import {eq} from 'drizzle-orm';
import {type Router} from 'express';
import {z} from 'zod';
import {db, schema} from '../../db/client.ts';
import {manualRentPaidSchema} from '../adminHandlers.ts';
import {landlordSubscriptionCheckoutSchema} from '../landlordSubscriptionHandlers.ts';
import type {RentPaymentRecord} from '../types.ts';
import {asyncHandler, getValidatedBody, paymentLimiter, recordAudit, requireAuth, validateBody} from '../http/middleware.ts';
import {
  assertTenantCanPay,
  createPesapalRentCheckout,
  createStripeCheckout,
  fetchPaymentContext,
  getTenantProfileForPayment,
  initiateLandlordSubscriptionCheckout,
  initiateMpesaRent,
  markRentPaid,
  mpesaRentSchema,
  pesapalCheckoutSchema,
  stripeCheckoutSchema,
} from '../services/payments.ts';

/** Authenticated payment initiation (rent + landlord subscription) and manual rent settlement. */
export function registerPaymentRoutes(bffRouter: Router) {
  bffRouter.post(
    '/payments/stripe/checkout-session',
    paymentLimiter,
    requireAuth,
    validateBody(stripeCheckoutSchema),
    createStripeCheckout,
  );
  bffRouter.post('/payments/mpesa/rent', paymentLimiter, requireAuth, validateBody(mpesaRentSchema), initiateMpesaRent);
  bffRouter.post(
    '/payments/pesapal/rent',
    paymentLimiter,
    requireAuth,
    validateBody(pesapalCheckoutSchema),
    createPesapalRentCheckout,
  );

  bffRouter.post(
    '/landlord/subscription/checkout',
    requireAuth,
    paymentLimiter,
    validateBody(landlordSubscriptionCheckoutSchema),
    initiateLandlordSubscriptionCheckout,
  );

  bffRouter.post(
    '/rent-payments/:paymentId/mark-manual',
    requireAuth,
    validateBody(manualRentPaidSchema),
    asyncHandler(async (req, res) => {
      const paymentId = req.params.paymentId;
      const {note} = getValidatedBody<z.infer<typeof manualRentPaidSchema>>(req);
      const actor = req.profile!;

      console.log(`[Manual Payment] Attempt by ${actor.email} for payment ${paymentId}`);

      const payment = await db.query.rentPayments.findFirst({where: eq(schema.rentPayments.id, paymentId)});

      if (!payment) {
        console.warn(`[Manual Payment] Payment ${paymentId} not found.`);
        res.status(404).json({error: 'Rent payment not found'});
        return;
      }

      const rentPayment = payment as unknown as RentPaymentRecord;
      const isOwner = rentPayment.landlordId === actor.uid;
      const isTenant = assertTenantCanPay(actor, rentPayment);
      // A platform admin is scoped to their own (non-null) platform; only super admins
      // reach across platforms.
      const isPlatformAdmin =
        Boolean(actor.isSuperAdmin) ||
        (Boolean(actor.isAdmin) && Boolean(actor.platformId) && rentPayment.platformId === actor.platformId);

      if (!isOwner && !isTenant && !actor.isSuperAdmin && !isPlatformAdmin) {
        console.warn(`[Manual Payment] Unauthorized attempt by ${actor.email} to mark payment ${paymentId} as paid.`);
        res.status(403).json({error: 'You cannot access this payment'});
        return;
      }

      if (isTenant && !isOwner && !actor.isSuperAdmin && !isPlatformAdmin) {
        // Tenant is submitting receipt for verification
        const existingMeta = (payment.paymentMetadata as Record<string, unknown>) || {};
        await db
          .update(schema.rentPayments)
          .set({
            status: 'verifying',
            paymentMetadata: {
              ...existingMeta,
              submittedReceipt: note ?? null,
              submittedAt: new Date().toISOString(),
            },
          })
          .where(eq(schema.rentPayments.id, paymentId));

        console.log(`[Manual Payment] Tenant ${actor.email} submitted payment ${paymentId} for verification`);
        res.json({status: 'verifying', paymentId: rentPayment.id});
        return;
      }

      const {landlord, property} = await fetchPaymentContext(rentPayment.id);
      const tenant = await getTenantProfileForPayment(rentPayment);

      await markRentPaid({
        payment: rentPayment,
        tenant,
        landlord,
        property,
        provider: 'manual',
        providerReference: `MANUAL-${Date.now()}`,
        metadata: {markedBy: actor.uid, note: note ?? null},
      });
      await recordAudit(actor, 'RENT_MARKED_PAID_MANUAL', 'rentPayment', rentPayment.id, {amount: rentPayment.amount, note: note ?? null});

      console.log(`[Manual Payment] Successfully marked payment ${paymentId} as paid by ${actor.email}`);
      res.json({status: 'paid', paymentId: rentPayment.id});
    }),
  );
}
