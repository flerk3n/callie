# Callie

Callie is a voice-first smart scheduling agent. It holds a natural, multi-turn conversation, understands scheduling intent, checks a connected Google Calendar, and offers real meeting times. It creates an event only after the user explicitly confirms an offered slot.

**Live app:** [callie-calls.vercel.app](https://callie-calls.vercel.app) · **Repository:** [github.com/flerk3n/callie](https://github.com/flerk3n/callie)

**Agent model:** GLM 5.2, selected for fast, accurate tool-use output with efficient token consumption.

## Assignment coverage

| Requirement | Callie implementation |
| --- | --- |
| Voice conversation | ElevenLabs Agents over WebRTC, with a custom Next.js voice UI and live transcript. |
| Multi-turn scheduling | The agent carries forward date, duration, time preference, and offered slots; it asks only for missing constraints. |
| Google Calendar integration | Google OAuth, Calendar FreeBusy for availability, Calendar event search, and confirmed event creation. |
| Ambiguous and relative time | Supports exact times, flexible windows, date ranges, “usual sync-up”, and before/after a named Calendar event. |
| Conflict handling | Returns no invented availability; asks to widen the time range or try another day when no suitable slot exists. |
| Low-latency interaction | WebRTC voice transport provides fast perceived response; Calendar tool calls remain factual server-side operations. |

## How it works

```text
Browser voice UI
      │ authenticated WebRTC session + local date context
      ▼
ElevenLabs conversational agent
      │ protected webhook tools
      ▼
Next.js backend ──► Google Calendar API
      │
      ├─ Supabase Postgres: users, encrypted Calendar connections,
      │  conversations, scheduling drafts, bookings, meeting habits
      └─ Zod + Temporal: validated, timezone-safe scheduling logic
```

The voice agent handles language. The backend is the source of truth for identity, timezone, Calendar data, availability, and booking eligibility.

## Design choices

- **Structured state, not LLM memory.** Conversation status, offered slot IDs, Calendar connections, and remembered meeting durations are stored in Postgres. The model can converse freely, but it cannot invent a bookable time.
- **Calendar data stays server-side.** Google refresh tokens are encrypted with AES-256-GCM before storage. The browser and ElevenLabs never receive Google credentials.
- **Validated tool boundary.** Every webhook payload is validated with Zod and tied to an authenticated user through the ElevenLabs conversation ID and a timing-safe webhook secret check.
- **Timezone-safe scheduling.** Browser timezone is persisted for the connected user; Temporal converts local date ranges to precise Calendar API boundaries.

## Agent tools

All tools are `POST` webhooks and require these headers:

```text
x-callie-webhook-secret: <ELEVENLABS_WEBHOOK_SECRET>
x-eleven-conversation-id: {{system__conversation_id}}
```

| Tool | Endpoint | Input |
| --- | --- | --- |
| `find_available_slots` | `/api/agent/tools/find-slots` | `durationMinutes` and either `startDate` + `endDate` or `anchorEventTitle` + `anchorDate` + `relativePosition`; optional `anchorStartTime`, exact, or flexible time preference. |
| `search_calendar_events` | `/api/agent/tools/find-events` | `startDate`, `endDate`, optional `query`. Omitting `query` returns the full agenda. |
| `get_usual_meeting_context` | `/api/agent/tools/usual-meeting` | `meetingName`. |
| `create_calendar_event` | `/api/agent/tools/book-event` | Exact offered `slotId`, `confirmed: true`, optional title. |

At session start, the browser supplies `{{callie_local_date}}`, `{{callie_local_time}}`, and `{{callie_timezone}}` as ElevenLabs dynamic variables. The system prompt uses them to turn “tomorrow” and other relative dates into exact `YYYY-MM-DD` tool values. For a one-day availability search, the agent must send the same date as both `startDate` and `endDate`. For relative scheduling, the backend resolves the event from its title and date; opaque Google event IDs are never returned to the agent.

### Availability policy

Exact requests, such as “at 9 PM tomorrow”, search only the requested time and can fall outside the default window. Flexible and before/after-event searches default to **9 AM–9 PM** unless the user gives a narrower time preference.

## Technical issues solved

| Problem | Resolution |
| --- | --- |
| Relative dates occasionally drifted to the wrong day. | Each voice session sends the user’s local date, time, and IANA timezone as dynamic variables; the prompt requires exact-date conversion before every tool call. |
| “What events are tomorrow?” missed events because it became a text search. | Generic agenda language omits Google’s `q` filter and returns the full date-range agenda. Named-event and “meetings” requests keep a text filter. |
| Availability sounded robotic by listing adjacent 15-minute increments. | The scheduler finds free blocks first, then ranks exact, relative, and flexible results differently: exact requests stay exact, relative requests choose the closest valid slot, and flexible results are naturally spaced. |
| A meeting created outside Callie could not be used as a before/after anchor. | The backend resolves an exact event title and date against the authenticated user’s connected Calendar, rather than trusting an LLM-selected opaque event ID. |
| A model could theoretically submit arbitrary booking timestamps. | Booking accepts only a conversation-scoped slot ID previously returned by Callie, then rechecks Google FreeBusy immediately before event creation. |
| Spoken delivery annotations appeared in the visible transcript. | Transcript rendering removes bracketed delivery tags while preserving the spoken conversation. |

## Local setup

### Prerequisites

- Node.js 20+
- A Supabase Postgres project
- Google OAuth web credentials with Google Calendar API enabled
- An ElevenLabs Agent and API key

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create `.env.local`:

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

Generate the credential-encryption key with:

```bash
openssl rand -base64 32
```

Use the Supabase **Transaction pooler** URL for `DATABASE_URL` at runtime. Use a **Session pooler** URL only when applying migrations.

### 3. Apply database migrations

```bash
supabase link --project-ref <project-ref>
supabase db push --db-url "<session-pooler-url>"
```

The migrations enable Row Level Security and revoke browser access to application tables. Callie accesses its data only through the server-side Postgres connection.

### 4. Configure Google OAuth

Enable the Google Calendar API and add this redirect URI for local development:

```text
http://localhost:3000/api/auth/callback/google
```

The app requests identity, Calendar events, FreeBusy, and calendar-list permissions. Add the deployed callback URL before production use.

### OAuth verification notice

Google may show an “app is not verified” warning while OAuth branding and sensitive Calendar-scope review are pending. This is a Google review status, not an authentication failure. Add evaluators as Google Cloud test users while review is in progress.

### 5. Configure ElevenLabs

Create a private agent, set its ID as `ELEVENLABS_AGENT_ID`, and add the four tools listed above using the deployed HTTPS base URL. Configure the two headers for every tool, and add the session date variables to the top of the agent’s system prompt. The app creates a short-lived conversation token server-side; the ElevenLabs API key never reaches the browser.

### 6. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), connect Google Calendar, and begin a voice session.

## Verification

```bash
npm run test
npm run lint
npm run build
```

The automated suite covers availability conflicts, buffers, excluded weekdays, daylight-saving boundaries, tool contracts, Calendar search behavior, meeting-duration memory, transcript sanitization, and local-date generation.

Manual validation covered every scenario listed in Assignment, followed by approximately 40 minutes of exploratory voice testing across changing constraints, empty calendars, busy calendars, relative-event scheduling, exact times, flexible windows, usual meetings, and booking confirmation.

## Deployment

Deploy the Next.js app to Vercel. Add every environment variable from `.env.local` to the Vercel production environment, apply Supabase migrations, then update:

1. Google OAuth redirect URI and `NEXTAUTH_URL`
2. ElevenLabs tool URLs
3. ElevenLabs webhook secret

Use a separate ElevenLabs agent or configuration for preview deployments so preview sessions cannot invoke production Calendar tools.
