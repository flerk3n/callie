import { z } from "zod";
import { getBusyIntervals, searchCalendarEvents, createConfirmedEvent } from "@/calendar/service";
import { getDb } from "@/db";
import { bookings } from "@/db/schema";
import { markConversationStatus } from "@/agent/context";
import { findAvailableSlots, getSearchBoundaries } from "@/scheduler/availability";
import { slotSearchSchema } from "@/scheduler/types";

const localTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM time.");
const agentDateRangeFields = z.object({
  timezone: z.string().min(1),
  startDate: z.string().date(),
  endDate: z.string().date(),
});

function hasValidDateRange({ startDate, endDate }: { startDate: string; endDate: string }) {
  return startDate <= endDate;
}

// Keep the voice-agent contract deliberately flat. The ElevenLabs tool editor is
// optimized for primitive fields; Callie normalizes them into its richer internal
// scheduling model only after Zod validation.
export const findSlotsToolSchema = z
  .object({
    timezone: z.string().min(1),
    startDate: z.string().date(),
    endDate: z.string().date(),
    durationMinutes: z.number().int().min(15).max(480),
    preferredStart: localTimeSchema.optional(),
    preferredEnd: localTimeSchema.optional(),
  })
  .refine(
    ({ preferredStart, preferredEnd }) => Boolean(preferredStart) === Boolean(preferredEnd),
    "Provide both preferredStart and preferredEnd, or neither.",
  )
  .transform(({ timezone, startDate, endDate, durationMinutes, preferredStart, preferredEnd }) => ({
    timezone,
    dateRange: { startDate, endDate },
    durationMinutes,
    timeWindows: [{ start: preferredStart ?? "09:00", end: preferredEnd ?? "17:00" }],
  }))
  .pipe(slotSearchSchema.omit({ busyIntervals: true }));

export async function findSlotsForConversation(userId: string, conversationId: string, input: z.infer<typeof findSlotsToolSchema>) {
  const boundaries = getSearchBoundaries(input);
  const busyIntervals = await getBusyIntervals(userId, boundaries.start, boundaries.end);
  const search = slotSearchSchema.parse({ ...input, busyIntervals });
  const slots = findAvailableSlots(search);
  await markConversationStatus(conversationId, slots.length > 0 ? "offering" : "collecting", { ...input, slots });
  return { slots, searchedRange: boundaries, message: slots.length > 0 ? "Offer these exact options to the user." : "No slots found. Ask before widening their preference." };
}

export const findEventToolSchema = agentDateRangeFields
  .extend({ query: z.string().trim().min(1).max(200) })
  .refine(hasValidDateRange, "The start date must not be after the end date.")
  .transform(({ query, timezone, startDate, endDate }) => {
    const boundaries = getSearchBoundaries({ timezone, dateRange: { startDate, endDate } });
    return { query, timeMin: boundaries.start, timeMax: boundaries.end };
  });

export async function findEventsForConversation(userId: string, input: z.infer<typeof findEventToolSchema>) {
  const events = await searchCalendarEvents(userId, input.query, input.timeMin, input.timeMax);
  return { events };
}

export const bookEventToolSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    timezone: z.string().min(1),
    confirmed: z.literal(true),
  })
  .refine(({ startsAt, endsAt }) => new Date(startsAt) < new Date(endsAt), "The event must end after it starts.")
  .transform(({ title, ...event }) => ({
    ...event,
    title: title ?? "Meeting",
    attendeeEmails: [],
    createMeetLink: true,
  }));

export class BookingEligibilityError extends Error {
  constructor() {
    super("This slot was not offered in the current conversation.");
  }
}

export function isOfferedSlot(draft: unknown, startsAt: string, endsAt: string) {
  if (!draft || typeof draft !== "object" || !("slots" in draft) || !Array.isArray(draft.slots)) return false;
  return draft.slots.some(
    (slot) =>
      typeof slot === "object"
      && slot !== null
      && "start" in slot
      && "end" in slot
      && slot.start === startsAt
      && slot.end === endsAt,
  );
}

export async function bookEventForConversation(userId: string, conversationId: string, input: z.infer<typeof bookEventToolSchema>) {
  const db = getDb();
  const conversation = await db.query.conversations.findFirst({
    columns: { schedulingDraft: true },
    where: (conversation, { eq }) => eq(conversation.id, conversationId),
  });
  if (!conversation || !isOfferedSlot(conversation.schedulingDraft, input.startsAt, input.endsAt)) {
    throw new BookingEligibilityError();
  }

  const event = await createConfirmedEvent(userId, input);
  await db.insert(bookings).values({
    userId,
    conversationId,
    googleEventId: event.id,
    startsAt: new Date(input.startsAt),
    endsAt: new Date(input.endsAt),
  });
  await markConversationStatus(conversationId, "complete");
  return { event, message: "The event is created. Confirm only the details returned here." };
}
