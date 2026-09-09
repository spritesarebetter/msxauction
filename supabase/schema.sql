-- MSX Auction Tracker production schema
-- Secure by default: RLS is enabled and no anonymous write policies are created.

create extension if not exists pgcrypto;

create table if not exists public.item_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.watch_keywords (
  id uuid primary key default gen_random_uuid(),
  item_type_id uuid not null references public.item_types(id) on delete cascade,
  keyword text not null,
  created_at timestamptz not null default now(),
  unique(item_type_id, keyword)
);

create table if not exists public.watch_sources (
  id uuid primary key default gen_random_uuid(),
  item_type_id uuid not null references public.item_types(id) on delete cascade,
  source text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique(item_type_id, source)
);

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  item_type_id uuid not null references public.item_types(id) on delete cascade,
  marketplace text not null,
  marketplace_listing_id text,
  title text not null,
  url text not null,
  currency text not null default 'JPY',
  current_price numeric(14,2),
  status text not null default 'active' check (status in ('active','sold','ended','removed','unknown')),
  auction_ends_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  sold_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists listings_marketplace_external_id_idx
  on public.listings (marketplace, marketplace_listing_id)
  where marketplace_listing_id is not null;

create index if not exists listings_item_type_status_idx
  on public.listings (item_type_id, status);

create index if not exists listings_auction_ends_at_idx
  on public.listings (auction_ends_at);

create table if not exists public.price_observations (
  id bigint generated always as identity primary key,
  listing_id uuid not null references public.listings(id) on delete cascade,
  price numeric(14,2) not null,
  currency text not null,
  observed_at timestamptz not null default now()
);

create index if not exists price_observations_listing_time_idx
  on public.price_observations (listing_id, observed_at desc);

create table if not exists public.auction_results (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null unique references public.listings(id) on delete cascade,
  item_type_id uuid not null references public.item_types(id) on delete cascade,
  marketplace text not null,
  title text not null,
  final_price numeric(14,2) not null,
  currency text not null,
  ended_at timestamptz not null,
  url text,
  created_at timestamptz not null default now()
);

create index if not exists auction_results_item_type_ended_idx
  on public.auction_results (item_type_id, ended_at desc);

alter table public.item_types enable row level security;
alter table public.watch_keywords enable row level security;
alter table public.watch_sources enable row level security;
alter table public.listings enable row level security;
alter table public.price_observations enable row level security;
alter table public.auction_results enable row level security;

-- Seed the first two item types discussed for this project.
insert into public.item_types (name)
values ('Panasonic FS-A1GT'), ('Panasonic FS-A1ST')
on conflict (name) do nothing;

insert into public.watch_keywords (item_type_id, keyword)
select id, keyword
from public.item_types
cross join lateral (
  values
    (case when name = 'Panasonic FS-A1GT' then 'FS-A1GT' else 'FS-A1ST' end),
    (case when name = 'Panasonic FS-A1GT' then 'FS A1GT' else 'FS A1ST' end),
    (case when name = 'Panasonic FS-A1GT' then 'Panasonic A1GT' else 'Panasonic A1ST' end)
) as terms(keyword)
where name in ('Panasonic FS-A1GT','Panasonic FS-A1ST')
on conflict (item_type_id, keyword) do nothing;
