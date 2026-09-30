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
    slotId: z.string().regex(/^slot_[1-9]\d*$/, "Use the exact slot ID returned by the availability tool."),
    confirmed: z.literal(true),
  })
  .transform(({ title, ...booking }) => ({
    ...booking,
    title: title ?? "Meeting",
  }));

export class BookingEligibilityError extends Error {
  constructor() {
    super("This slot was not offered in the current conversation.");
  }
}

type OfferedSlot = {
  id: string;
  start: string;
  end: string;
  timezone: string;
};

export function getOfferedSlot(draft: unknown, slotId: string): OfferedSlot | null {
  if (!draft || typeof draft !== "object" || !("slots" in draft) || !Array.isArray(draft.slots)) return null;
  const slot = draft.slots.find(
    (candidate): candidate is Record<string, unknown> =>
      typeof candidate === "object" && candidate !== null && "id" in candidate && candidate.id === slotId,
  );
  if (
    !slot
    || typeof slot.start !== "string"
    || typeof slot.end !== "string"
    || typeof slot.timezone !== "string"
  ) {
    return null;
  }
  return { id: slotId, start: slot.start, end: slot.end, timezone: slot.timezone };
}

export async function bookEventForConversation(userId: string, conversationId: string, input: z.infer<typeof bookEventToolSchema>) {
  const db = getDb();
  const conversation = await db.query.conversations.findFirst({
    columns: { schedulingDraft: true },
    where: (conversation, { eq }) => eq(conversation.id, conversationId),
  });
  const slot = conversation && getOfferedSlot(conversation.schedulingDraft, input.slotId);
  if (!slot) {
    throw new BookingEligibilityError();
  }

  const event = await createConfirmedEvent(userId, {
    title: input.title,
    startsAt: slot.start,
    endsAt: slot.end,
    timezone: slot.timezone,
    attendeeEmails: [],
    createMeetLink: true,
  });
  await db.insert(bookings).values({
    userId,
    conversationId,
    googleEventId: event.id,
    startsAt: new Date(slot.start),
    endsAt: new Date(slot.end),
  });
  await markConversationStatus(conversationId, "complete");
  return { event, message: "The event is created. Confirm only the details returned here." };
}
