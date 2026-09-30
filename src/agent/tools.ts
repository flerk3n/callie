import { z } from "zod";
import { getBusyIntervals, searchCalendarEvents, createConfirmedEvent, createEventSchema } from "@/calendar/service";
import { getDb } from "@/db";
import { bookings } from "@/db/schema";
import { markConversationStatus } from "@/agent/context";
import { findAvailableSlots, getSearchBoundaries } from "@/scheduler/availability";
import { slotSearchSchema } from "@/scheduler/types";

export const findSlotsToolSchema = slotSearchSchema.omit({ busyIntervals: true });

export async function findSlotsForConversation(userId: string, conversationId: string, input: z.infer<typeof findSlotsToolSchema>) {
  const boundaries = getSearchBoundaries(input);
  const busyIntervals = await getBusyIntervals(userId, boundaries.start, boundaries.end);
  const search = slotSearchSchema.parse({ ...input, busyIntervals });
  const slots = findAvailableSlots(search);
  await markConversationStatus(conversationId, slots.length > 0 ? "offering" : "collecting", { ...input, slots });
  return { slots, searchedRange: boundaries, message: slots.length > 0 ? "Offer these exact options to the user." : "No slots found. Ask before widening their preference." };
}

export const findEventToolSchema = z.object({
  query: z.string().trim().min(1).max(200),
  timeMin: z.string().datetime({ offset: true }),
  timeMax: z.string().datetime({ offset: true }),
});

export async function findEventsForConversation(userId: string, input: z.infer<typeof findEventToolSchema>) {
  const events = await searchCalendarEvents(userId, input.query, input.timeMin, input.timeMax);
  return { events };
}

export const bookEventToolSchema = createEventSchema.extend({ confirmed: z.literal(true) });

export async function bookEventForConversation(userId: string, conversationId: string, input: z.infer<typeof bookEventToolSchema>) {
  const event = await createConfirmedEvent(userId, input);
  const db = getDb();
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
