import type { Account, Profile } from "next-auth";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { calendarConnections, users } from "@/db/schema";
import { encryptSecret } from "@/lib/crypto";
import { isSupportedTimeZone } from "@/lib/timezone";

type GoogleProfile = Profile & { sub?: string; email?: string; name?: string; picture?: string };

export async function persistGoogleIdentity(profile: GoogleProfile, account: Account) {
  if (!profile.sub || !profile.email || !account.refresh_token) {
    throw new Error("Google did not return the identity and offline Calendar permission required by Callie.");
  }

  const db = getDb();
  await db
    .insert(users)
    .values({ id: profile.sub, email: profile.email, name: profile.name ?? null, image: profile.picture ?? null })
    .onConflictDoUpdate({
      target: users.id,
      set: { email: profile.email, name: profile.name ?? null, image: profile.picture ?? null, updatedAt: new Date() },
    });

  await db
    .insert(calendarConnections)
    .values({
      userId: profile.sub,
      providerAccountId: account.providerAccountId,
      calendarEmail: profile.email,
      refreshTokenEncrypted: encryptSecret(account.refresh_token),
      scope: account.scope ?? "",
    })
    .onConflictDoUpdate({
      target: calendarConnections.providerAccountId,
      set: {
        calendarEmail: profile.email,
        refreshTokenEncrypted: encryptSecret(account.refresh_token),
        scope: account.scope ?? "",
        disconnectedAt: null,
      },
    });
}

export async function getActiveCalendarConnection(userId: string) {
  const db = getDb();
  return db.query.calendarConnections.findFirst({
    where: (connection, { and, eq: equals, isNull }) => and(equals(connection.userId, userId), isNull(connection.disconnectedAt)),
  });
}

export async function updateUserTimezone(userId: string, timezone: string) {
  if (!isSupportedTimeZone(timezone)) throw new Error("Unsupported timezone.");
  const db = getDb();
  await db.update(users).set({ timezone, updatedAt: new Date() }).where(eq(users.id, userId));
}

export async function getUserTimezone(userId: string) {
  const db = getDb();
  const user = await db.query.users.findFirst({
    columns: { timezone: true },
    where: eq(users.id, userId),
  });
  return user?.timezone && isSupportedTimeZone(user.timezone) ? user.timezone : "UTC";
}
