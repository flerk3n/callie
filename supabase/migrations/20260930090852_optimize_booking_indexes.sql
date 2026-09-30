-- The UNIQUE constraint already creates a unique index for this column.
drop index public.calendar_connections_provider_account_unique;

-- Covers the bookings → conversations foreign-key relationship.
create index bookings_conversation_idx on public.bookings (conversation_id);
