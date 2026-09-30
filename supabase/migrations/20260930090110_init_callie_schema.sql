-- Callie's server owns all scheduling data. These tables intentionally expose
-- no Data API policy: application access is through the server's direct,
-- encrypted database connection only.

create type public.booking_status as enum ('confirmed', 'conflicted', 'cancelled');
create type public.conversation_status as enum (
  'collecting',
  'searching',
  'offering',
  'awaiting_confirmation',
  'booking',
  'complete',
  'abandoned'
);

create table public.users (
  id text primary key not null,
  email text not null unique,
  name text,
  image text,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.calendar_connections (
  id uuid primary key not null default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  provider_account_id text not null,
  calendar_email text not null,
  refresh_token_encrypted text not null,
  scope text not null,
  selected_calendar_id text not null default 'primary',
  connected_at timestamptz not null default now(),
  disconnected_at timestamptz,
  unique (provider_account_id)
);

create table public.conversations (
  id uuid primary key not null default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  eleven_conversation_id text unique,
  status public.conversation_status not null default 'collecting',
  scheduling_draft jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.bookings (
  id uuid primary key not null default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete restrict,
  google_event_id text not null unique,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.booking_status not null default 'confirmed',
  created_at timestamptz not null default now()
);

create index bookings_user_starts_idx on public.bookings (user_id, starts_at);
create unique index calendar_connections_provider_account_unique
  on public.calendar_connections (provider_account_id);
create index calendar_connections_user_idx on public.calendar_connections (user_id);
create index conversations_user_created_idx on public.conversations (user_id, created_at);

alter table public.users enable row level security;
alter table public.calendar_connections enable row level security;
alter table public.conversations enable row level security;
alter table public.bookings enable row level security;

revoke all on table public.users from anon, authenticated;
revoke all on table public.calendar_connections from anon, authenticated;
revoke all on table public.conversations from anon, authenticated;
revoke all on table public.bookings from anon, authenticated;
