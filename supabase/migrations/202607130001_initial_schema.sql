create extension if not exists "pgcrypto";

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  base_currency text not null default 'CAD' check (base_currency ~ '^[A-Z]{3}$'),
  timezone text not null default 'America/Toronto',
  update_hour smallint not null default 18 check (update_hour between 0 and 23),
  theme text not null default 'system' check (theme in ('light','dark','system')),
  notifications_enabled boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.portfolios (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100), base_currency text not null default 'CAD',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.instruments (
  id uuid primary key default gen_random_uuid(), symbol text not null unique, name text not null,
  asset_type text not null check (asset_type in ('mutual_fund','stock','etf','crypto','cash','other')),
  currency text not null, price_provider text not null default 'rbc_gam', is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.positions (
  id uuid primary key default gen_random_uuid(), portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  instrument_id uuid not null references public.instruments(id), units numeric(24,8) not null check (units >= 0),
  average_purchase_price numeric(20,6) not null check (average_purchase_price >= 0), purchase_date date,
  notes text check (char_length(notes) <= 2000), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(portfolio_id, instrument_id)
);
create table public.price_history (
  id bigint generated always as identity primary key, instrument_id uuid not null references public.instruments(id) on delete cascade,
  price numeric(20,6) not null check (price > 0), currency text not null, priced_at timestamptz not null, source text not null,
  created_at timestamptz not null default now(), unique(instrument_id, priced_at)
);
create index price_history_lookup on public.price_history(instrument_id, priced_at desc);
create table public.portfolio_snapshots (
  id bigint generated always as identity primary key, portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  market_value numeric(22,6) not null, book_value numeric(22,6) not null, base_currency text not null, captured_at timestamptz not null default now(),
  unique(portfolio_id, captured_at)
);
create index portfolio_snapshots_lookup on public.portfolio_snapshots(portfolio_id, captured_at desc);
create table public.job_runs (
  id bigint generated always as identity primary key, job_name text not null, status text not null,
  processed integer not null default 0, failed integer not null default 0, error text,
  started_at timestamptz not null default now(), finished_at timestamptz
);

alter table public.profiles enable row level security;
alter table public.portfolios enable row level security;
alter table public.positions enable row level security;
alter table public.instruments enable row level security;
alter table public.price_history enable row level security;
alter table public.portfolio_snapshots enable row level security;
create policy "own profile" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "own portfolios" on public.portfolios for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "own positions" on public.positions for all using (exists(select 1 from public.portfolios p where p.id = portfolio_id and p.owner_id = auth.uid())) with check (exists(select 1 from public.portfolios p where p.id = portfolio_id and p.owner_id = auth.uid()));
create policy "read instruments" on public.instruments for select to authenticated using (true);
create policy "read prices" on public.price_history for select to authenticated using (true);
create policy "own snapshots" on public.portfolio_snapshots for select using (exists(select 1 from public.portfolios p where p.id = portfolio_id and p.owner_id = auth.uid()));
