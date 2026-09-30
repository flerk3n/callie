import { z } from "zod";
import { getBusyIntervals, searchCalendarEvents, createConfirmedEvent, inferUsualDurationFromCalendar } from "@/calendar/service";
import { getDb } from "@/db";
import { bookings } from "@/db/schema";
import { markConversationStatus } from "@/agent/context";
import { findAvailableSlots, getSearchBoundaries } from "@/scheduler/availability";
import { slotSearchSchema } from "@/scheduler/types";
import { getMeetingHabit, rememberMeetingHabit } from "@/lib/meeting-memory";
import { getUserTimezone } from "@/lib/persistence";

const localTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM time.");
const agentDateRangeFields = z.object({
  startDate: z.string().date(),
  endDate: z.string().date(),
});

function hasValidDateRange({ startDate, endDate }: { startDate: string; endDate: string }) {
  return startDate <= endDate;
}

function addMinutesToLocalTime(time: string, durationMinutes: number) {
  const [hours, minutes] = time.split(":").map(Number);
  const totalMinutes = hours * 60 + minutes + durationMinutes;
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
}

// Keep the voice-agent contract deliberately flat. The ElevenLabs tool editor is
// optimized for primitive fields; Callie normalizes them into its richer internal
// scheduling model only after Zod validation.
export const findSlotsToolSchema = z
  .object({
    startDate: z.string().date(),
    endDate: z.string().date(),
    durationMinutes: z.number().int().min(15).max(480),
    exactStart: localTimeSchema.optional(),
    preferredStart: localTimeSchema.optional(),
    preferredEnd: localTimeSchema.optional(),
  })
  .refine(hasValidDateRange, "The start date must not be after the end date.")
  .superRefine(({ exactStart, preferredStart, preferredEnd, durationMinutes }, context) => {
    if (Boolean(preferredStart) !== Boolean(preferredEnd)) {
      context.addIssue({ code: "custom", message: "Provide both preferredStart and preferredEnd, or neither." });
    }
    if (exactStart && (preferredStart || preferredEnd)) {
      context.addIssue({ code: "custom", message: "Use exactStart or a preferred time range, not both." });
    }
    if (exactStart && addMinutesToLocalTime(exactStart, durationMinutes) >= "24:00") {
      context.addIssue({ code: "custom", message: "The exact meeting time must end on the same day." });
    }
    if (preferredStart && preferredEnd && preferredStart >= preferredEnd) {
      context.addIssue({ code: "custom", message: "The preferred time window must end after it starts." });
    }
  });

export async function findSlotsForConversation(userId: string, conversationId: string, input: z.infer<typeof findSlotsToolSchema>) {
  const timezone = await getUserTimezone(userId);
  const timeWindows = input.exactStart
    ? [{ start: input.exactStart, end: addMinutesToLocalTime(input.exactStart, input.durationMinutes) }]
    : [{ start: input.preferredStart ?? "09:00", end: input.preferredEnd ?? "17:00" }];
  const schedulerInput = slotSearchSchema.parse({
    timezone,
    dateRange: { startDate: input.startDate, endDate: input.endDate },
    durationMinutes: input.durationMinutes,
    timeWindows,
  });
  const boundaries = getSearchBoundaries(schedulerInput);
  const busyIntervals = await getBusyIntervals(userId, boundaries.start, boundaries.end);
  const search = slotSearchSchema.parse({ ...schedulerInput, busyIntervals });
  const slots = findAvailableSlots(search);
  await markConversationStatus(conversationId, slots.length > 0 ? "offering" : "collecting", { ...input, slots });
  return { slots, searchedRange: boundaries, message: slots.length > 0 ? "Offer these exact options to the user." : "No slots found. Ask before widening their preference." };
}

export const findEventToolSchema = agentDateRangeFields
  .extend({ query: z.string().trim().min(1).max(200) })
  .refine(hasValidDateRange, "The start date must not be after the end date.");

export async function findEventsForConversation(userId: string, input: z.infer<typeof findEventToolSchema>) {
  const timezone = await getUserTimezone(userId);
  const boundaries = getSearchBoundaries({ timezone, dateRange: { startDate: input.startDate, endDate: input.endDate } });
  const events = await searchCalendarEvents(userId, input.query, boundaries.start, boundaries.end);
  return { events };
}

export const usualMeetingToolSchema = z.object({
  meetingName: z.string().trim().min(1).max(120),
});

export async function getUsualMeetingForConversation(userId: string, input: z.infer<typeof usualMeetingToolSchema>) {
  const savedHabit = await getMeetingHabit(userId, input.meetingName);
  if (savedHabit) {
    return {
      found: true,
      meetingName: savedHabit.displayName,
      durationMinutes: savedHabit.durationMinutes,
      source: "saved_preference",
      observations: savedHabit.observedCount,
    };
  }

  const inferred = await inferUsualDurationFromCalendar(userId, input.meetingName);
  if (!inferred) {
    return { found: false, message: "No usual duration was found. Ask the user how long this meeting should be." };
  }

  await rememberMeetingHabit({
    userId,
    meetingName: input.meetingName,
    durationMinutes: inferred.durationMinutes,
    source: "calendar_history",
    observedCount: inferred.observations,
  });
  return {
    found: true,
    meetingName: input.meetingName,
    durationMinutes: inferred.durationMinutes,
    source: "calendar_history",
    observations: inferred.observations,
  };
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
  const durationMinutes = Math.round((new Date(slot.end).getTime() - new Date(slot.start).getTime()) / 60_000);
  try {
    await rememberMeetingHabit({
      userId,
      meetingName: input.title,
      durationMinutes,
      source: "callie_booking",
    });
  } catch (error) {
    // The Calendar event already exists; preference learning must never turn a
    // successful booking into an apparent failure.
    console.error("agent.meeting_habit_save_failed", error);
  }
  await db.insert(bookings).values({
    userId,
    conversationId,
    googleEventId: event.id,
    startsAt: new Date(slot.start),
    endsAt: new Date(slot.end),
  });
  await markConversationStatus(conversationId, "complete");
  return { booked: true, message: "Meeting booked successfully. Confirm the selected time concisely; never read URLs, event IDs, or technical details aloud." };
}
