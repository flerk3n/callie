import { z } from "zod";
import { Temporal } from "@js-temporal/polyfill";
import {
  createConfirmedEvent,
  findCalendarEventsByExactTitle,
  getBusyIntervals,
  inferUsualDurationFromCalendar,
  searchCalendarEvents,
  toAgentCalendarEvent,
  type CalendarEventReference,
} from "@/calendar/service";
import { getDb } from "@/db";
import { bookings } from "@/db/schema";
import { markConversationStatus } from "@/agent/context";
import { findAvailableSlots, getSearchBoundaries } from "@/scheduler/availability";
import { slotSearchSchema } from "@/scheduler/types";
import { getMeetingHabit, rememberMeetingHabit } from "@/lib/meeting-memory";
import { getUserTimezone } from "@/lib/persistence";

const localTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM time.");
export const DEFAULT_AVAILABILITY_WINDOW = { start: "09:00", end: "21:00" } as const;
const agentDateRangeFields = z.object({
  startDate: z.string().date(),
  endDate: z.string().date(),
});

function hasValidDateRange({ startDate, endDate }: { startDate: string; endDate: string }) {
  return startDate <= endDate;
}

function minLocalTime(first: string, second: string) {
  return first < second ? first : second;
}

function maxLocalTime(first: string, second: string) {
  return first > second ? first : second;
}

const agendaSearchReferences = new Set([
  "agenda",
  "calendar",
  "event",
  "events",
  "my agenda",
  "my calendar",
  "my events",
  "my schedule",
  "schedule",
]);

function normalizeEventReference(query: string) {
  return query
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Google Calendar's `q` parameter is a text-match filter. A generic request
 * for the day's events must omit it so Calendar returns the complete agenda.
 * Keep non-generic terms such as “meeting” as a text query by design.
 */
export function getCalendarEventQuery(query: string | undefined) {
  if (!query || agendaSearchReferences.has(normalizeEventReference(query))) return undefined;
  return query;
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
    startDate: z.string().date().optional(),
    endDate: z.string().date().optional(),
    durationMinutes: z.number().int().min(15).max(480),
    exactStart: localTimeSchema.optional(),
    preferredStart: localTimeSchema.optional(),
    preferredEnd: localTimeSchema.optional(),
    anchorEventTitle: z.string().trim().min(1).max(200).optional(),
    anchorDate: z.string().date().optional(),
    anchorStartTime: localTimeSchema.optional(),
    relativePosition: z.enum(["before", "after"]).optional(),
  })
  .superRefine(({ startDate, endDate, exactStart, preferredStart, preferredEnd, durationMinutes, anchorEventTitle, anchorDate, anchorStartTime, relativePosition }, context) => {
    const hasRelativeAnchor = Boolean(anchorEventTitle && anchorDate && relativePosition);
    const hasAnyRelativeAnchorField = Boolean(anchorEventTitle || anchorDate || anchorStartTime || relativePosition);

    if (Boolean(startDate) !== Boolean(endDate)) {
      context.addIssue({ code: "custom", path: ["startDate"], message: "Provide both startDate and endDate, or neither." });
    }
    if (startDate && endDate && startDate > endDate) {
      context.addIssue({ code: "custom", path: ["endDate"], message: "The start date must not be after the end date." });
    }
    if (!hasRelativeAnchor && (!startDate || !endDate)) {
      context.addIssue({ code: "custom", path: ["startDate"], message: "Provide a date range unless scheduling relative to an event." });
    }
    if (hasAnyRelativeAnchorField && !hasRelativeAnchor) {
      context.addIssue({ code: "custom", path: ["anchorEventTitle"], message: "Provide anchorEventTitle, anchorDate, and relativePosition together." });
    }
    if (hasRelativeAnchor && (startDate || endDate)) {
      context.addIssue({ code: "custom", path: ["startDate"], message: "Do not provide a date range with a relative event anchor." });
    }
    if (Boolean(preferredStart) !== Boolean(preferredEnd)) {
      context.addIssue({ code: "custom", message: "Provide both preferredStart and preferredEnd, or neither." });
    }
    if (exactStart && (preferredStart || preferredEnd)) {
      context.addIssue({ code: "custom", message: "Use exactStart or a preferred time range, not both." });
    }
    if (exactStart && addMinutesToLocalTime(exactStart, durationMinutes) >= "24:00") {
      context.addIssue({ code: "custom", message: "The exact meeting time must end on the same day." });
    }
    if (hasRelativeAnchor && exactStart) {
      context.addIssue({ code: "custom", path: ["exactStart"], message: "Use a relative event or an exact start, not both." });
    }
    if (preferredStart && preferredEnd && preferredStart >= preferredEnd) {
      context.addIssue({ code: "custom", message: "The preferred time window must end after it starts." });
    }
  });

export class RelativeSchedulingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RelativeSchedulingError";
  }
}

function hasAnchorStartTime(event: CalendarEventReference, startTime: string, timezone: string) {
  try {
    return Temporal.Instant.from(event.start).toZonedDateTimeISO(timezone).toPlainTime().toString({ smallestUnit: "minute" }) === startTime;
  } catch {
    return false;
  }
}

async function resolveRelativeEvent(
  userId: string,
  { title, date, startTime }: { title: string; date: string; startTime?: string },
  timezone: string,
) {
  const boundaries = getSearchBoundaries({ timezone, dateRange: { startDate: date, endDate: date } });
  const titleMatches = await findCalendarEventsByExactTitle(userId, title, boundaries.start, boundaries.end);
  const matches = startTime
    ? titleMatches.filter((event) => hasAnchorStartTime(event, startTime, timezone))
    : titleMatches;

  if (matches.length === 0) {
    const timeReference = startTime ? ` at ${startTime}` : "";
    throw new RelativeSchedulingError(`No Calendar event titled “${title}” was found on ${date}${timeReference}. Ask the user to clarify the event.`);
  }
  if (matches.length > 1) {
    throw new RelativeSchedulingError(`More than one Calendar event titled “${title}” was found on ${date}. Ask the user for its start time, then include anchorStartTime.`);
  }
  if (!matches[0].start || !matches[0].end) {
    throw new RelativeSchedulingError("That event does not have a usable scheduled time.");
  }
  return matches[0];
}

function getRelativeDateAndTime(event: CalendarEventReference, position: "before" | "after", timezone: string) {
  const eventTime = position === "before" ? event.start : event.end;
  try {
    const local = Temporal.Instant.from(eventTime).toZonedDateTimeISO(timezone);
    return {
      date: local.toPlainDate().toString(),
      time: local.toPlainTime().toString({ smallestUnit: "minute" }),
    };
  } catch {
    throw new RelativeSchedulingError("An all-day event cannot be used as a before-or-after scheduling anchor.");
  }
}

export async function findSlotsForConversation(userId: string, conversationId: string, input: z.infer<typeof findSlotsToolSchema>) {
  const timezone = await getUserTimezone(userId);
  const relativeEvent = input.anchorEventTitle && input.anchorDate && input.relativePosition
    ? await resolveRelativeEvent(userId, {
      title: input.anchorEventTitle,
      date: input.anchorDate,
      startTime: input.anchorStartTime,
    }, timezone)
    : null;
  const relativeAnchor = relativeEvent && input.relativePosition
    ? getRelativeDateAndTime(relativeEvent, input.relativePosition, timezone)
    : null;
  const dateRange = relativeAnchor
    ? { startDate: relativeAnchor.date, endDate: relativeAnchor.date }
    : { startDate: input.startDate!, endDate: input.endDate! };
  const timeWindows = input.exactStart
    ? [{ start: input.exactStart, end: addMinutesToLocalTime(input.exactStart, input.durationMinutes) }]
    : relativeAnchor && input.relativePosition === "before"
      ? [{ start: input.preferredStart ?? DEFAULT_AVAILABILITY_WINDOW.start, end: minLocalTime(input.preferredEnd ?? relativeAnchor.time, relativeAnchor.time) }]
      : relativeAnchor && input.relativePosition === "after"
        ? [{ start: maxLocalTime(input.preferredStart ?? relativeAnchor.time, relativeAnchor.time), end: input.preferredEnd ?? DEFAULT_AVAILABILITY_WINDOW.end }]
        : [{ start: input.preferredStart ?? DEFAULT_AVAILABILITY_WINDOW.start, end: input.preferredEnd ?? DEFAULT_AVAILABILITY_WINDOW.end }];
  const presentation = relativeAnchor
    ? input.relativePosition === "before" ? "immediately_before_event" : "immediately_after_event"
    : input.exactStart
      ? "exact_match"
      : input.preferredStart
        ? "natural_options"
        : "ask_time_preference";
  const searchBoundaries = getSearchBoundaries({ timezone, dateRange });

  if (timeWindows.some((window) => window.start >= window.end)) {
    await markConversationStatus(conversationId, "collecting", { slots: [] });
    return {
      slots: [],
      searchedRange: searchBoundaries,
      presentation,
      message: "No time remains in the requested range on that side of the event. Ask whether another time or day works.",
    };
  }
  const schedulerInput = slotSearchSchema.parse({
    timezone,
    dateRange,
    durationMinutes: input.durationMinutes,
    timeWindows,
    selectionStrategy: relativeAnchor
      ? input.relativePosition === "before" ? "latest" : "earliest"
      : "balanced",
    maxResults: presentation === "natural_options" ? 3 : 1,
  });
  const boundaries = getSearchBoundaries(schedulerInput);
  const busyIntervals = await getBusyIntervals(userId, boundaries.start, boundaries.end);
  const search = slotSearchSchema.parse({ ...schedulerInput, busyIntervals });
  const slots = findAvailableSlots(search);
  const offeredSlots = presentation === "ask_time_preference" ? [] : slots;
  const message = slots.length === 0
    ? "No slots found. Ask before widening the preference or trying another day."
    : presentation === "immediately_before_event"
      ? "Offer the one returned slot as the closest available time before the named event. Do not list grid alternatives."
      : presentation === "immediately_after_event"
        ? "Offer the one returned slot as the closest available time after the named event. Do not list grid alternatives."
        : presentation === "exact_match"
          ? "Offer the exact returned time only."
          : presentation === "natural_options"
            ? "Offer at most the returned distinct, naturally spaced options. Do not describe them as a default list of three slots."
            : "Availability exists, but no time preference was supplied. Say the day has availability and ask whether morning, afternoon, or a particular time works. Do not offer or book a slot yet.";
  await markConversationStatus(conversationId, offeredSlots.length > 0 ? "offering" : "collecting", { ...input, slots: offeredSlots });
  return { slots: offeredSlots, searchedRange: boundaries, presentation, message };
}

export const findEventToolSchema = agentDateRangeFields
  .extend({
    query: z.string().trim().min(1).max(200).optional(),
  })
  .refine(hasValidDateRange, "The start date must not be after the end date.");

export async function findEventsForConversation(userId: string, input: z.infer<typeof findEventToolSchema>) {
  const timezone = await getUserTimezone(userId);
  const boundaries = getSearchBoundaries({ timezone, dateRange: { startDate: input.startDate, endDate: input.endDate } });
  const query = getCalendarEventQuery(input.query);
  const events = await searchCalendarEvents(userId, query, boundaries.start, boundaries.end);
  return {
    events: events.map(toAgentCalendarEvent),
    resultType: query ? "matching_events" : "agenda",
    message: query
      ? "These are the events matching the requested reference. An empty result means no matching event was found."
      : "This is the complete Calendar agenda for the requested date range. An empty result means no events are scheduled in that range.",
  };
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
