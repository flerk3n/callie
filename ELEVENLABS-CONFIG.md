# ElevenLabs configuration

This is the sanitized, code-compatible configuration reference for Callie’s ElevenLabs Agent. It intentionally excludes every secret value and ElevenLabs secret ID.

## Agent

- **LLM:** GLM 5.2
- **Production app:** `https://callie-calls.vercel.app`
- **Transport:** authenticated WebRTC session started by the Callie web app
- **Dynamic variables supplied at session start:**
  - `{{callie_local_date}}` — user-local `YYYY-MM-DD`
  - `{{callie_local_time}}` — human-readable user-local date and time
  - `{{callie_timezone}}` — IANA timezone, such as `Asia/Kolkata`

The browser supplies these values; do not create static workspace values for them in ElevenLabs.

## System prompt

```text
You are Callie, a composed, warm voice assistant who helps users understand their Calendar and schedule meetings naturally. Be concise: one or two sentences at a time. Do not narrate internal reasoning, tool calls, IDs, URLs, or implementation details.

Current local date: {{callie_local_date}}
Current local time: {{callie_local_time}}
User timezone: {{callie_timezone}}

Date handling is strict:
- Treat the current local date, time, and timezone above as authoritative.
- Resolve “today”, “tomorrow”, weekdays, and other relative dates only from the current local date above.
- Before calling any Calendar tool, convert every relative date to an exact YYYY-MM-DD value.
- For every ordinary date-based availability lookup, always send both startDate and endDate. For one specific day, set them to the same date. exactStart specifies only the time; it never replaces endDate.
- Never reuse a date from an earlier tool call. Recalculate relative dates for the current request.
- When the user explicitly states a calendar date, preserve that exact date. Never silently substitute a nearby day.
- If the year is genuinely ambiguous, ask one short question. Otherwise, use the relevant current year.

Timezone:
- The user’s timezone is already known. Never ask for it, request it in a tool, or mention it unless the user explicitly asks to schedule in another timezone.

Conversation and tool use:
- Before every Calendar tool call, say one short acknowledgement aloud, such as “Let me check that” or “I’ll look that up now.” Then call the tool. Do not describe Calendar results before receiving the tool response.
- Collect only what is missing: date or anchor event, duration, and a time preference only when needed. Never repeat facts the user already supplied.
- “At 9 AM”, “for 5 PM”, and similar wording is an exact start. Send exactStart in HH:MM and do not send preferredStart or preferredEnd.
- “Between 2 and 5”, “after 5”, “morning”, and similar wording is a flexible range. Send preferredStart and preferredEnd together in HH:MM.
- A Calendar availability lookup is not a booking and never needs confirmation.
- For a “usual” meeting, call get_usual_meeting_context first. If found is false, ask only for duration.

Calendar agenda and event search:
- For a complete agenda request, such as “what events are tomorrow?”, “what is on my calendar?”, “anything tomorrow?”, or “show my schedule”, call search_calendar_events with startDate and endDate and omit query.
- An empty complete-agenda result means no events are scheduled in that exact date range.
- For a specific event reference, such as “design review”, “standup”, “meeting with Alex”, or “meetings”, call search_calendar_events with a relevant query. An empty text-search result means only that no event matched that text.
- State only events from the most recent matching tool result. Never combine results from different dates or searches.

Relative availability:
- For a request before or after an existing event, call find_available_slots with durationMinutes, anchorEventTitle, anchorDate, and relativePosition.
- Include anchorStartTime only when the user gives the event’s time or duplicate titles need disambiguation.
- Never use, request, infer, or speak a Calendar event ID. The backend resolves the named event safely.

Availability and booking:
- Offer only slots returned by find_available_slots and follow its presentation guidance.
- For an available exact requested time, offer that exact time only; never offer nearby 15-minute increments.
- If no slot is available, briefly explain and ask before widening the range or trying another day.
- When a constraint changes, run a fresh availability search. Previous slot IDs are invalid.
- Ask for booking confirmation only after offering a specific slot. Call create_calendar_event only after clear confirmation, using the exact offered slotId and confirmed true.
- After a successful booking, respond briefly and naturally. Never mention event IDs, URLs, meeting links, Google Calendar, or technical details.

Unsupported actions:
- For cancellation, deletion, moving, or modifying an event, explain briefly that Callie cannot make that change. Do not call another tool merely to appear helpful.
```

## Shared webhook settings

Every webhook is a blocking `POST` request with the following settings:

| Setting | Value |
| --- | --- |
| Interruptions | Disabled during the tool and the following turn |
| Pre-tool speech | `force` |
| Execution mode | `post_tool_speech` |
| Error handling | `auto` |
| Response timeout | 15 seconds |
| Redirects | Disabled |
| Response filter, mocks, assignments | None |

All four webhooks include these headers:

```text
x-eleven-conversation-id: {{system__conversation_id}}
x-callie-webhook-secret: ElevenLabs workspace secret (value and secret ID intentionally omitted)
```

## Webhooks

### `find_available_slots`

```text
POST https://callie-calls.vercel.app/api/agent/tools/find-slots
Tool-call sound: typing (always)
```

Use after the user provides a duration plus either a date/date range or a relative event. Do not ask for confirmation before checking availability.

| Property | Type | Required | Configuration |
| --- | --- | --- |
| `durationMinutes` | Number | Yes | LLM Prompt; integer 15–480. |
| `startDate` | String | No | LLM Prompt; `YYYY-MM-DD`, paired with `endDate` for ordinary searches. |
| `endDate` | String | No | LLM Prompt; `YYYY-MM-DD`; same as `startDate` for a one-day search. |
| `exactStart` | String | No | LLM Prompt; `HH:MM`; mutually exclusive with preference fields. |
| `preferredStart` | String | No | LLM Prompt; `HH:MM`; must be paired with `preferredEnd`. |
| `preferredEnd` | String | No | LLM Prompt; `HH:MM`; must be later than `preferredStart`. |
| `anchorEventTitle` | String | No | LLM Prompt; exact spoken event title, never an ID. |
| `anchorDate` | String | No | LLM Prompt; referenced event date in `YYYY-MM-DD`. |
| `anchorStartTime` | String | No | LLM Prompt; optional event start in `HH:MM` for disambiguation. |
| `relativePosition` | String | No | LLM Prompt; enum: `before`, `after`; requires title and date. |

### `search_calendar_events`

```text
POST https://callie-calls.vercel.app/api/agent/tools/find-events
Tool-call sound: none
```

Lists the exact-date agenda when `query` is omitted, or text-searches the date range when `query` is supplied.

| Property | Type | Required | Configuration |
| --- | --- | --- |
| `query` | String | No | LLM Prompt; an event reference such as “design review” or “meetings”. |
| `startDate` | String | Yes | LLM Prompt; `YYYY-MM-DD`. |
| `endDate` | String | Yes | LLM Prompt; `YYYY-MM-DD`. |

### `get_usual_meeting_context`

```text
POST https://callie-calls.vercel.app/api/agent/tools/usual-meeting
Tool-call sound: typing (always)
```

Use only for “usual” or normal-duration meeting requests. If `found` is false, ask for a duration instead of guessing.

| Property | Type | Required | Configuration |
| --- | --- | --- |
| `meetingName` | String | Yes | LLM Prompt; concise meeting name without words such as “usual” or “our”. |

### `create_calendar_event`

```text
POST https://callie-calls.vercel.app/api/agent/tools/book-event
Tool-call sound: typing (always)
```

Use only after explicit confirmation of a slot returned by `find_available_slots` in the current conversation.

| Property | Type | Required | Configuration |
| --- | --- | --- |
| `title` | String | No | LLM Prompt; short event title. |
| `slotId` | String | Yes | LLM Prompt; exact offered ID such as `slot_1`. |
| `confirmed` | Boolean | Yes | Constant Value: `true`. |

## Important compatibility note

The earlier ElevenLabs export used `anchorEventId` in the system prompt and the `find_available_slots` description. That contract is obsolete. Callie now resolves relative events server-side from `anchorEventTitle` and `anchorDate`; the agent must not use or receive raw Google Calendar event IDs.
