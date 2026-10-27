-- External CRM / education platform connections per workspace. API keys are server-only (no client grants).
create table public.crm_integrations (
  owner_id uuid not null,
  provider text not null,
  base_url text not null,
  api_key text not null,
  courses_count integer,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  primary key (owner_id, provider)
);
grant all on public.crm_integrations to service_role;
alter table public.crm_integrations enable row level security;