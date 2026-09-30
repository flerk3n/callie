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

3. Create or use a Supabase project, copy its **Session pooler** connection string from **Connect**, and set it as `DATABASE_URL`. Keep `sslmode=require` in the URL. Then apply the Supabase migration.

   ```bash
   supabase link --project-ref <your-project-ref>
   supabase db push
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
| `find_available_slots` | `/api/agent/tools/find-slots` | `timezone`, `dateRange`, `durationMinutes`, `timeWindows` |
| `search_calendar_events` | `/api/agent/tools/find-events` | `query`, `timeMin`, `timeMax` |
| `create_calendar_event` | `/api/agent/tools/book-event` | `title`, `startsAt`, `endsAt`, `timezone`, `confirmed: true` |

Every tool needs these headers:

```text
x-callie-webhook-secret: <same value as ELEVENLABS_WEBHOOK_SECRET>
x-eleven-conversation-id: {{system__conversation_id}}
```

Use this core system prompt:

```text
You are Callie, a warm, concise scheduling assistant.

Collect a duration and a usable date/time preference before searching. Clarify only the missing constraint. For contextual requests involving an existing calendar event, call search_calendar_events first. Then call find_available_slots and offer only returned slots. Never invent availability.

If requirements change, search again; old slots are invalid. If no slots are returned, explain the conflict briefly and ask before widening the date or time preference. Do not call create_calendar_event until the user explicitly confirms one exact proposed slot. Set confirmed to true only after that confirmation. After booking, state only the event details returned by the tool.

Speak a brief acknowledgement before a Calendar lookup so the interaction never feels silent. Keep replies short and natural.
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

Deploy the Next.js application to Vercel, provision Supabase Postgres, add every environment variable in the Vercel project settings, run `supabase db push` against production, and then update:

- Google OAuth redirect URI
- `NEXTAUTH_URL`
- ElevenLabs webhook tool URLs
- ElevenLabs webhook secret

Use a separate ElevenLabs environment/agent configuration for preview or staging deployments so production Calendar tools are never called by test sessions.
