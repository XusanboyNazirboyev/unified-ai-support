-- Whether the connected Instagram account delivers Direct messages to the Inbox (needs the messaging permission + webhook subscription).
alter table public.instagram_accounts
  add column messaging_enabled boolean not null default false,
  add column scopes text;

-- Instagram retries webhook deliveries: each Direct message id is processed once. Server-only.
create table public.instagram_message_events (
  mid text primary key,
  owner_id uuid not null,
  created_at timestamptz not null default now()
);
grant all on public.instagram_message_events to service_role;
alter table public.instagram_message_events enable row level security;