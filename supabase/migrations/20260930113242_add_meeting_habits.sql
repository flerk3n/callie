create table public.meeting_habits (
  id uuid primary key not null default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  normalized_name text not null,
  display_name text not null,
  duration_minutes integer not null check (duration_minutes between 15 and 480),
  source text not null check (source in ('callie_booking', 'calendar_history')),
  observed_count integer not null default 1 check (observed_count > 0),
  last_observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, normalized_name)
);

create index meeting_habits_user_updated_idx on public.meeting_habits (user_id, updated_at desc);

alter table public.meeting_habits enable row level security;
revoke all on table public.meeting_habits from anon, authenticated;
