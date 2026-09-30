import { z } from "zod";

const localTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected a 24-hour time such as 13:30.");

export const timeWindowSchema = z
  .object({ start: localTime, end: localTime })
  .refine(({ start, end }) => start < end, "A time window must end after it starts.");

export const dateRangeSchema = z
  .object({ startDate: z.string().date(), endDate: z.string().date() })
  .refine(({ startDate, endDate }) => startDate <= endDate, "The date range is invalid.");

export const busyIntervalSchema = z.object({
  start: z.string().datetime({ offset: true }),
  end: z.string().datetime({ offset: true }),
});

export const slotSearchSchema = z.object({
  timezone: z.string().min(1),
  dateRange: dateRangeSchema,
  durationMinutes: z.number().int().min(15).max(480),
  timeWindows: z.array(timeWindowSchema).min(1),
  excludedWeekdays: z.array(z.number().int().min(1).max(7)).default([]),
  bufferMinutes: z.number().int().min(0).max(120).default(0),
  intervalMinutes: z.number().int().min(5).max(60).default(15),
  maxResults: z.number().int().min(1).max(12).default(3),
  busyIntervals: z.array(busyIntervalSchema).default([]),
});

export type SlotSearch = z.infer<typeof slotSearchSchema>;

export type AvailableSlot = {
  /** A conversation-scoped identifier the agent can safely use to book this option. */
  id: string;
  start: string;
  end: string;
  timezone: string;
  localStart: string;
  localEnd: string;
};
