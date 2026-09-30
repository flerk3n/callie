# Callie

A voice-first scheduling agent that understands natural meeting requests, checks the user's Google Calendar, offers real slots, and creates an event only after an explicit confirmation.

## Stack

- Next.js, TypeScript, Tailwind CSS, and GSAP
- ElevenLabs Agents + React SDK over authenticated WebRTC
- Google OAuth and Google Calendar API
- Supabase Postgres with Drizzle ORM (server-only database access)
- Zod contracts and `Temporal` for timezone-safe scheduling

## How it works

```text
Browser voice UI → ElevenLabs WebRTC agent → protected webhook tools
                                                ↓
                                      Callie Next.js backend
                                      ├─ structured scheduling draft
                                      ├─ Google Calendar FreeBusy
                                      ├─ event-reference search
                                      └─ final recheck + event creation
```

The agent handles conversation. The backend is the source of truth for identity, OAuth tokens, scheduling facts, availability, and bookings.

## Local setup

1. Install dependencies.

   ```bash
   npm install
   ```

2. Create a local `.env.local` file. Do not commit it.

   ```bash
   DATABASE_URL=
   GOOGLE_CLIENT_ID=
   GOOGLE_CLIENT_SECRET=
   NEXTAUTH_URL=http://localhost:3000
   NEXTAUTH_SECRET=
   CREDENTIAL_ENCRYPTION_KEY=
   ELEVENLABS_API_KEY=
   ELEVENLABS_AGENT_ID=
   ELEVENLABS_WEBHOOK_SECRET=
   ```

   Generate `CREDENTIAL_ENCRYPTION_KEY` with `openssl rand -base64 32`. It encrypts Google refresh tokens with AES-256-GCM before they enter Postgres.

3. Create or use a Supabase project and copy its **Transaction pooler** connection string from **Connect** into `DATABASE_URL`. The server client is configured for this serverless mode (`max: 1`, prepared statements disabled, TLS required). Use the **Session pooler** string only for the CLI migration command.

   ```bash
   supabase link --project-ref <your-project-ref>
   supabase db push --db-url "<session-pooler-connection-string>"
   ```

   The checked-in migration enables Row Level Security on every Callie table and intentionally creates no browser policies. Callie accesses scheduling data only through its server-side database connection.

4. Start the app.

   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000).

## Google Cloud setup

1. Create OAuth web credentials and enable the Google Calendar API.
2. Add this local redirect URI:

   ```text
   http://localhost:3000/api/auth/callback/google
   ```

3. Add the corresponding deployed callback URI before production use.
4. Add the Google client ID and secret to `.env.local`.

Callie requests profile/email identity plus Calendar event, free/busy, and calendar-list permissions. The sign-in flow forces consent and offline access so the backend can persist a refresh token securely.

## ElevenLabs Agent setup

Create a private ElevenLabs Agent, copy its ID to `ELEVENLABS_AGENT_ID`, and configure these blocking POST webhook tools. Use deployed HTTPS URLs for a real agent test.

| Tool | URL | Required fields |
| --- | --- | --- |
| `find_available_slots` | `/api/agent/tools/find-slots` | `durationMinutes` plus either `startDate` + `endDate`, or `anchorEventId` + `relativePosition`; optional `exactStart` or `preferredStart` + `preferredEnd` |
| `search_calendar_events` | `/api/agent/tools/find-events` | `startDate`, `endDate`; optional `query` |
| `get_usual_meeting_context` | `/api/agent/tools/usual-meeting` | `meetingName` |
| `create_calendar_event` | `/api/agent/tools/book-event` | `slotId`, `confirmed: true`; optional `title` |

Every tool needs these headers:

```text
x-callie-webhook-secret: Secret value matching ELEVENLABS_WEBHOOK_SECRET
x-eleven-conversation-id: Dynamic Variable system__conversation_id
```

For `get_usual_meeting_context`, use `POST /api/agent/tools/usual-meeting` with the same headers and one required String LLM Prompt property:

```text
meetingName: The concise name of the recurring meeting, without words such as “usual” or “our”; for example, “sync-up”.
```

Tool and request-body description:

```text
Find the user's usual meeting duration from saved Callie preferences or matching Calendar history. Use this only when the user calls a meeting “usual” or asks for their normal duration. If found is false, ask the user for a duration instead of guessing.
```

### Replace the tool properties

The browser automatically stores the user's IANA timezone at the start of every voice session. Delete the `timezone` property from both `find_available_slots` and `search_calendar_events`; Callie resolves it server-side.

For `find_available_slots`, make `startDate` and `endDate` optional. They must be supplied together for an ordinary date-based lookup, but omitted when the meeting is relative to a Calendar event. Keep `durationMinutes` required.

Add these optional String LLM Prompt properties:

```text
exactStart: Use only when the user asks for a precise start time, such as “at 9 AM”. Send HH:MM in 24-hour time, such as 09:00. Do not send preferredStart or preferredEnd with exactStart.

anchorEventId: Normally obtain this from search_calendar_events for the named event the user means. Copy its exact id without speaking it. Callie validates the event against the connected user's Calendar. Omit startDate and endDate when this is supplied.

relativePosition: Use only with anchorEventId. Send exactly before when the user asks to meet before that event, or after when they ask to meet after it.
```

Keep `preferredStart` and `preferredEnd` only for a flexible range: “between 2 and 5”, “after 5”, or “in the morning”. Do not use them for an exact requested time. The search tool description and request-body description should be:

```text
Check real Calendar availability as soon as the user has provided a duration plus either a date/date range or a relative Calendar event. For a precise time, use exactStart. For a flexible range, use preferredStart and preferredEnd together. For “before” or “after” a named event, first use search_calendar_events, then send anchorEventId and relativePosition and omit startDate/endDate. Never ask the user to confirm an availability lookup; confirm only before creating the event.
```

For `search_calendar_events`, use this description:

```text
List the user's actual Calendar events in a date range, or search that range for an event reference. The user's timezone is supplied by Callie; provide startDate and endDate. Omit query to return the complete agenda, for example when the user asks “what is on tomorrow?” Use query only to text-search a reference such as “design review” or “meetings”. An empty agenda result means no events are scheduled in the date range; an empty query result means only that no events matched the query.
```

Use this core system prompt:

```text
You are Callie, a composed, warm voice assistant who schedules meetings naturally. Be concise: one or two sentences at a time. Do not narrate internal reasoning, tool calls, IDs, URLs, or implementation details.

Timezone
- The user's timezone is already known to Callie. Never ask for it, never request it in a tool, and never mention it unless the user explicitly asks to schedule in another timezone.

Collecting constraints
- Collect only what is missing: date, duration, and a time preference when needed. Never repeat facts the user already supplied.
- “At 9 AM”, “for 5 PM”, and similar wording is an exact start. Send exactStart in HH:MM and do not send preferredStart or preferredEnd.
- “Between 2 and 5”, “after 5”, “morning”, and similar wording is a flexible range. Send preferredStart and preferredEnd together in HH:MM. Ask one brief follow-up only when a vague period needs bounds.
- A Calendar lookup is not a booking and never needs confirmation. As soon as date, duration, and a usable time preference are known, say a short acknowledgement such as “I’ll check that,” then call find_available_slots immediately.
- For a “usual” meeting, call get_usual_meeting_context first. If found is true, use durationMinutes and meetingName. If false, ask only for duration.
- For “before” or “after” a named Calendar event, first use search_calendar_events. If more than one event matches, ask which one the user means. Once one event is clear, call find_available_slots with durationMinutes, its exact anchorEventId, and relativePosition `before` or `after`; omit startDate and endDate. Never speak the event ID.
- For a request to see all events in a date range, call search_calendar_events with startDate and endDate and omit query. The result is the complete agenda for that range. If it is empty, say there are no events scheduled in that range.
- For a request relative to an existing event or to search meetings, call search_calendar_events with a relevant query such as “design review”, “standup”, or “meetings”. This is a text search, so an empty result means only that no events matched the query; never say the Calendar is clear because of it.
- For cancellation or changing an event, explain briefly that Callie cannot make that change. Do not make a claim about the user's Calendar unless a tool result supports it.

Availability and changes
- Offer only slots returned by find_available_slots. For an exact requested time that is available, say that exact time is open and ask whether to book it. Do not offer nearby 15-minute increments.
- Respect the tool response presentation guidance. For an immediately-before or immediately-after result, offer only that closest slot and say its relation naturally. For natural options, offer at most the returned distinct, spaced choices; never recite neighbouring 15-minute starts or use the same “Here are three slots” phrasing every time.
- When the tool says to ask for a time preference, say the requested day has availability and ask for morning, afternoon, or a specific time. Do not offer or book an unstated slot.
- If no slot is available, briefly name the conflict and ask permission to widen the range or try a nearby day.
- When any constraint changes, run a fresh availability search. Previous slot IDs are invalid.

Booking
- Ask for confirmation only after offering a specific slot, and only to create the event. A clear “yes”, “book it”, or selection of an offered option is confirmation.
- Call create_calendar_event only after that explicit confirmation. Pass the exact offered slotId and confirmed true. Never invent a slot ID.
- After a successful booking, respond naturally and briefly: “Done — your [meeting name] is booked for [day and time].” Never read or mention a Calendar event ID, a URL, a meeting link, Google Calendar, web addresses, or technical details.
```

The browser requests a short-lived WebRTC token from `/api/voice/session`; the ElevenLabs API key never reaches the client. That route persists the returned ElevenLabs conversation ID before the session starts, allowing the tools to resolve the correct application user securely.

## Verification

```bash
npm run test
npm run lint
npm run build
```

The scheduler tests cover busy-event conflicts, configurable buffers, excluded weekdays, and a daylight-saving timezone boundary.

## Deployment

Deploy the Next.js application to Vercel, provision Supabase Postgres, add the Transaction pooler `DATABASE_URL` and every other environment variable in the Vercel project settings, run `supabase db push --db-url "<session-pooler-connection-string>"` against production, and then update:

- Google OAuth redirect URI
- `NEXTAUTH_URL`
- ElevenLabs webhook tool URLs
- ElevenLabs webhook secret

Use a separate ElevenLabs environment/agent configuration for preview or staging deployments so production Calendar tools are never called by test sessions.
