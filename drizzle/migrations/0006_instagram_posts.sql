-- Each workspace's own Instagram professional account. The access token is server-only (no client grants).
create table public.instagram_accounts (
  owner_id uuid primary key,
  ig_user_id text not null,
  username text not null,
  access_token text not null,
  token_refreshed_at timestamptz not null default now(),
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
grant all on public.instagram_accounts to service_role;
alter table public.instagram_accounts enable row level security;

-- Posts and reels the business published on Instagram, with what the AI saw in them.
create table public.instagram_posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  media_id text not null,
  media_type text not null,
  caption text,
  permalink text,
  shortcode text,
  thumbnail_url text,
  posted_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'analyzing', 'analyzed', 'failed')),
  analysis jsonb,
  analyzed_from text check (analyzed_from in ('video', 'image', 'cover')),
  analysis_error text,
  attempts integer not null default 0,
  analyzing_at timestamptz,
  analyzed_at timestamptz,
  admin_note text,
  created_at timestamptz not null default now(),
  unique (owner_id, media_id)
);
create index instagram_posts_owner_posted_idx on public.instagram_posts (owner_id, posted_at desc);
grant select on public.instagram_posts to authenticated;
grant update (admin_note) on public.instagram_posts to authenticated;
grant all on public.instagram_posts to service_role;
alter table public.instagram_posts enable row level security;
create policy "own instagram posts select" on public.instagram_posts for select to authenticated using (owner_id = auth.uid());
create policy "own instagram posts update" on public.instagram_posts for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());