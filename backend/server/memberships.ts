import {db, schema} from '../db/client.ts';

type MembershipRole = (typeof schema.membershipRoleEnum.enumValues)[number];

/** Records (or upgrades) a user's membership of a platform. No-op without a platform. */
export const addPlatformMembership = async (platformId: string | null | undefined, userId: string, role: MembershipRole) => {
  if (!platformId) return;
  await db
    .insert(schema.platformMemberships)
    .values({platformId, userId, role})
    .onConflictDoUpdate({
      target: [schema.platformMemberships.platformId, schema.platformMemberships.userId],
      set: {role},
    });
};

/** Maps a profile's legacy role flags to a membership role. */
export const membershipRoleFor = (profile: {role?: string | null; isAdmin?: boolean | null}): MembershipRole => {
  if (profile.isAdmin) return 'admin';
  if (profile.role === 'landlord' || profile.role === 'tenant') return profile.role;
  return 'member';
};
