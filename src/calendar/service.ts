import { randomUUID } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import { google } from "googleapis";
import { z } from "zod";
import { decryptSecret } from "@/lib/crypto";
import { getActiveCalendarConnection } from "@/lib/persistence";

type BusyInterval = { start: string; end: string };

type HistoricalDuration = { durationMinutes: number; observations: number };

export type CalendarEventReference = {
  id: string;
  title: string;
  start: string;
  end: string;
};

export type CalendarEventForAgent = Omit<CalendarEventReference, "id">;

export class CalendarConflictError extends Error {
  constructor() {
    super("This time was just taken. Please choose another option.");
    this.name = "CalendarConflictError";
  }
}

function requireGoogleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appUrl = process.env.NEXTAUTH_URL;
  if (!clientId || !clientSecret || !appUrl) {
    throw new Error("Google Calendar credentials and NEXTAUTH_URL must be configured.");
  }
  return { clientId, clientSecret, redirectUri: new URL("/api/auth/callback/google", appUrl).toString() };
}

async function getCalendarForUser(userId: string) {
  const connection = await getActiveCalendarConnection(userId);
  if (!connection) throw new Error("No active Google Calendar connection was found.");
  const config = requireGoogleConfig();
  const auth = new google.auth.OAuth2(config.clientId, config.clientSecret, config.redirectUri);
  auth.setCredentials({ refresh_token: decryptSecret(connection.refreshTokenEncrypted) });
  return { calendar: google.calendar({ version: "v3", auth }), calendarId: connection.selectedCalendarId };
}

function toCalendarEventReference(event: {
  id?: string | null;
  summary?: string | null;
  start?: { dateTime?: string | null; date?: string | null } | null;
  end?: { dateTime?: string | null; date?: string | null } | null;
}): CalendarEventReference {
  return {
    id: event.id ?? "",
    title: event.summary ?? "Untitled event",
    start: event.start?.dateTime ?? event.start?.date ?? "",
    end: event.end?.dateTime ?? event.end?.date ?? "",
  };
}

function normalizeEventTitle(value: string) {
  return value
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function findExactTitleMatches(events: CalendarEventReference[], title: string) {
  const normalizedTitle = normalizeEventTitle(title);
  return events.filter((event) => normalizeEventTitle(event.title) === normalizedTitle);
}

export function toAgentCalendarEvent({ title, start, end }: CalendarEventReference): CalendarEventForAgent {
  return { title, start, end };
}

export async function getBusyIntervals(userId: string, timeMin: string, timeMax: string): Promise<BusyInterval[]> {
  const { calendar, calendarId } = await getCalendarForUser(userId);
  const response = await calendar.freebusy.query({
    requestBody: { timeMin, timeMax, items: [{ id: calendarId }] },
  });
  return (response.data.calendars?.[calendarId]?.busy ?? [])
    .filter((interval): interval is { start: string; end: string } => Boolean(interval.start && interval.end))
    .map(({ start, end }) => ({ start, end }));
}

export async function searchCalendarEvents(userId: string, query: string | undefined, timeMin: string, timeMax: string) {
  const { calendar, calendarId } = await getCalendarForUser(userId);
  const response = await calendar.events.list({
    calendarId,
    ...(query ? { q: query } : {}),
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 2500,
  });
  return (response.data.items ?? []).map(toCalendarEventReference);
}

export async function findCalendarEventsByExactTitle(userId: string, title: string, timeMin: string, timeMax: string) {
  const events = await searchCalendarEvents(userId, undefined, timeMin, timeMax);
  return findExactTitleMatches(events, title);
}

export function inferUsualDuration(events: Array<{ start?: string | null; end?: string | null }>): HistoricalDuration | null {
  const frequencies = new Map<number, number>();
  for (const event of events) {
    if (!event.start || !event.end) continue;
    const durationMinutes = Math.round((Date.parse(event.end) - Date.parse(event.start)) / 60_000);
    if (!Number.isFinite(durationMinutes) || durationMinutes < 15 || durationMinutes > 480) continue;
    frequencies.set(durationMinutes, (frequencies.get(durationMinutes) ?? 0) + 1);
  }

  let usual: HistoricalDuration | null = null;
  for (const [durationMinutes, observations] of frequencies) {
    if (!usual || observations > usual.observations || (observations === usual.observations && durationMinutes < usual.durationMinutes)) {
      usual = { durationMinutes, observations };
    }
  }
  return usual;
}

export async function inferUsualDurationFromCalendar(userId: string, query: string) {
  const { calendar, calendarId } = await getCalendarForUser(userId);
  const timeMax = new Date();
  const timeMin = new Date(timeMax);
  timeMin.setDate(timeMin.getDate() - 180);
  const response = await calendar.events.list({
    calendarId,
    q: query,
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 25,
  });
  return inferUsualDuration(
    (response.data.items ?? []).map((event) => ({ start: event.start?.dateTime, end: event.end?.dateTime })),
  );
}

export const createEventSchema = z.object({
  title: z.string().trim().min(1).max(200).default("Meeting"),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  timezone: z.string().min(1),
  attendeeEmails: z.array(z.string().email()).max(20).default([]),
  createMeetLink: z.boolean().default(true),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;

function intervalsOverlap(start: string, end: string, busy: BusyInterval) {
  const candidateStart = Temporal.Instant.from(start);
  const candidateEnd = Temporal.Instant.from(end);
  return Temporal.Instant.compare(candidateStart, Temporal.Instant.from(busy.end)) < 0
    && Temporal.Instant.compare(candidateEnd, Temporal.Instant.from(busy.start)) > 0;
}

export async function createConfirmedEvent(userId: string, input: CreateEventInput) {
  const { calendar, calendarId } = await getCalendarForUser(userId);
  const busy = await getBusyIntervals(userId, input.startsAt, input.endsAt);
  if (busy.some((interval) => intervalsOverlap(input.startsAt, input.endsAt, interval))) {
    throw new CalendarConflictError();
  }

  const event = await calendar.events.insert({
    calendarId,
    conferenceDataVersion: input.createMeetLink ? 1 : 0,
    sendUpdates: input.attendeeEmails.length > 0 ? "all" : "none",
    requestBody: {
      summary: input.title,
      start: { dateTime: input.startsAt, timeZone: input.timezone },
      end: { dateTime: input.endsAt, timeZone: input.timezone },
      attendees: input.attendeeEmails.map((email) => ({ email })),
      ...(input.createMeetLink
        ? { conferenceData: { createRequest: { requestId: randomUUID() } } }
        : {}),
    },
  });

  return {
    id: event.data.id ?? "",
    htmlLink: event.data.htmlLink ?? "",
    meetLink: event.data.hangoutLink ?? event.data.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === "video")?.uri ?? null,
  };
}
