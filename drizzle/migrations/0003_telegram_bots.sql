-- Each workspace owner connects their own Telegram bot. Tokens are server-only (no client grants).
create table public.telegram_bots (
  owner_id uuid primary key,
  bot_token text not null,
  bot_id bigint not null,
  bot_username text not null,
  webhook_secret text not null unique,
  webhook_url text,
  created_at timestamptz not null default now()
);
grant all on public.telegram_bots to service_role;
alter table public.telegram_bots enable row level security;

-- Idempotency for Telegram retries
create table public.telegram_updates (
  owner_id uuid not null,
  update_id bigint not null,
  received_at timestamptz not null default now(),
  primary key (owner_id, update_id)
);
grant all on public.telegram_updates to service_role;
alter table public.telegram_updates enable row level security;

-- Link conversations to the real chat on the channel
alter table public.conversations add column if not exists external_chat_id text;
create unique index if not exists conversations_external_chat_idx
  on public.conversations(owner_id, channel, external_chat_id)
  where external_chat_id is not null;

-- Delivery problems for messages sent to the channel
alter table public.messages add column if not exists delivery_error text;