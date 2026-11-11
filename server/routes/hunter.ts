import {and, eq, inArray, sql} from 'drizzle-orm';
import {type Router} from 'express';
import {z} from 'zod';
import {db, schema} from '../../db/client.ts';
import {canCreateBooking} from '../../db/authz.ts';
import {toActor} from '../types.ts';
import {asyncHandler, getValidatedBody, requireAuth, validateBody} from '../http/middleware.ts';
import {insertNotification} from '../services/notify.ts';

const createBookingSchema = z
  .object({
    propertyId: z.string().uuid(),
    landlordId: z.string().uuid(),
    platformId: z.string().uuid().nullable().optional(),
    startDate: z.string(),
    endDate: z.string(),
    totalPrice: z.number().min(0),
  })
  .strict();

export function registerHunterRoutes(bffRouter: Router) {
  /** Only returns contact info if the landlord owns at least one available property —
   * matches the "users" SELECT policy's property-relationship clause (db/authz.ts). */
  bffRouter.get(
    '/landlords/:uid/public-contact',
    requireAuth,
    asyncHandler(async (req, res) => {
      const hasAvailableProperty = await db.query.properties.findFirst({
        where: and(eq(schema.properties.landlordId, req.params.uid), eq(schema.properties.status, 'available')),
        columns: {id: true},
      });
      if (!hasAvailableProperty) {
        res.status(404).json({error: 'Not found'});
        return;
      }
      const landlord = await db.query.users.findFirst({
        where: eq(schema.users.uid, req.params.uid),
        columns: {uid: true, displayName: true, phone: true, email: true},
      });
      if (!landlord) {
        res.status(404).json({error: 'Not found'});
        return;
      }
      res.json(landlord);
    }),
  );

  bffRouter.post(
    '/hunter/bookings',
    requireAuth,
    validateBody(createBookingSchema),
    asyncHandler(async (req, res) => {
      const actor = toActor(req.profile!);
      const body = getValidatedBody<z.infer<typeof createBookingSchema>>(req);

      if (!canCreateBooking(actor, actor.id)) {
        res.status(403).json({error: 'Forbidden'});
        return;
      }

      // Landlord, platform and price are derived from the listing; client values are ignored
      // so nobody can plant bookings (or a fake "pay KES X" message) on another landlord.
      const property = await db.query.properties.findFirst({
        where: eq(schema.properties.id, body.propertyId),
        columns: {id: true, title: true, landlordId: true, platformId: true, price: true, type: true, status: true},
      });
      if (!property || property.status !== 'available') {
        res.status(404).json({error: 'This listing is not available'});
        return;
      }
      const start = new Date(body.startDate);
      const end = new Date(body.endDate);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
        res.status(400).json({error: 'End date must be after start date'});
        return;
      }
      // No double-booking: reject any overlap with a pending/confirmed stay.
      const overlapping = await db.query.bookings.findFirst({
        where: and(
          eq(schema.bookings.propertyId, property.id),
          inArray(schema.bookings.status, ['pending', 'confirmed']),
          sql`${schema.bookings.startDate} < ${body.endDate}`,
          sql`${schema.bookings.endDate} > ${body.startDate}`,
        ),
        columns: {id: true},
      });
      if (overlapping) {
        res.status(409).json({error: 'Those dates are already booked'});
        return;
      }
      const nights = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));
      const totalPrice = property.type === 'bnb' ? Number(property.price) * nights : Number(property.price);

      const [booking] = await db
        .insert(schema.bookings)
        .values({
          propertyId: property.id,
          landlordId: property.landlordId,
          platformId: property.platformId,
          startDate: body.startDate,
          endDate: body.endDate,
          hunterId: actor.id,
          totalPrice: String(totalPrice),
          status: 'pending',
        })
        .returning();

      const landlord = await db.query.users.findFirst({where: eq(schema.users.uid, property.landlordId), columns: {email: true}});
      if (landlord?.email) {
        await insertNotification({
          recipientEmail: landlord.email.toLowerCase(),
          platformId: property.platformId ?? null,
          type: 'booking',
          title: 'New booking request',
          message: `${req.profile!.displayName || req.profile!.email} requested ${property.title ?? 'a property'}. Total KES ${totalPrice.toLocaleString()}. Confirm after payment.`,
          propertyId: property.id,
          read: false,
        });
      }

      res.status(201).json({...booking, totalPrice: Number(booking.totalPrice)});
    }),
  );
}
