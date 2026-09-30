import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { meetingHabits } from "@/db/schema";

export type MeetingHabitSource = "callie_booking" | "calendar_history";

export function normalizeMeetingName(name: string) {
  return name
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function getMeetingHabit(userId: string, meetingName: string) {
  const normalizedName = normalizeMeetingName(meetingName);
  if (!normalizedName) return null;

  const db = getDb();
  return db.query.meetingHabits.findFirst({
    where: (habit, { and: all, eq: equals }) => all(equals(habit.userId, userId), equals(habit.normalizedName, normalizedName)),
  });
}

export async function rememberMeetingHabit({
  userId,
  meetingName,
  durationMinutes,
  source,
  observedCount = 1,
}: {
  userId: string;
  meetingName: string;
  durationMinutes: number;
  source: MeetingHabitSource;
  observedCount?: number;
}) {
  const normalizedName = normalizeMeetingName(meetingName);
  // A generic fallback title is not a meaningful reusable preference.
  if (!normalizedName || normalizedName === "meeting") return;

  const db = getDb();
  const now = new Date();
  await db
    .insert(meetingHabits)
    .values({
      userId,
      normalizedName,
      displayName: meetingName.trim(),
      durationMinutes,
      source,
      observedCount,
      lastObservedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [meetingHabits.userId, meetingHabits.normalizedName],
      set: {
        displayName: meetingName.trim(),
        durationMinutes,
        source,
        observedCount: sql`${meetingHabits.observedCount} + ${observedCount}`,
        lastObservedAt: now,
        updatedAt: now,
      },
    });
}
