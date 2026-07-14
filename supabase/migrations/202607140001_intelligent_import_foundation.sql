-- Intelligent importer foundation: auditable ledger, staged batches, and adaptive profiles.
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  instrument_id uuid references public.instruments(id),
  transaction_type text not null check (transaction_type in ('buy','sell','distribution','dividend','interest','reinvested_distribution','fee','tax','deposit','withdrawal','transfer_in','transfer_out','return_of_capital','split','opening_position','other')),
  trade_date date not null,
  settlement_date date,
  quantity numeric(24,8), unit_price numeric(20,6), gross_amount numeric(22,6),
  fees numeric(20,6) not null default 0, taxes numeric(20,6) not null default 0,
  net_amount numeric(22,6), currency text not null check (currency ~ '^[A-Z]{3}$'),
  exchange_rate numeric(20,8), external_reference text, original_description text,
  notes text, import_batch_id uuid, source_row_fingerprint text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (portfolio_id, source_row_fingerprint)
);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  filename text not null, file_type text not null, file_size_bytes bigint not null,
  file_hash text not null, file_signature text not null,
  institution_name text, institution_confidence numeric(5,4),
  dataset_type text not null default 'unknown' check (dataset_type in ('transactions','positions','income','account_summary','mixed','unknown')),
  overall_confidence numeric(5,4) not null default 0,
  status text not null default 'uploaded' check (status in ('uploaded','parsing','analyzing','awaiting_review','ready','importing','completed','completed_with_warnings','failed','cancelled')),
  total_rows integer not null default 0, valid_rows integer not null default 0,
  warning_rows integer not null default 0, invalid_rows integer not null default 0,
  duplicate_rows integer not null default 0, imported_rows integer not null default 0,
  warnings jsonb not null default '[]'::jsonb, error text,
  created_at timestamptz not null default now(), analyzed_at timestamptz,
  confirmed_at timestamptz, completed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '30 days'),
  unique(user_id, portfolio_id, file_hash)
);

alter table public.transactions add constraint transactions_import_batch_fk
  foreign key (import_batch_id) references public.import_batches(id) on delete set null;

create table public.import_rows (
  id bigint generated always as identity primary key,
  import_batch_id uuid not null references public.import_batches(id) on delete cascade,
  source_worksheet text not null, source_row_number integer not null,
  raw_data jsonb not null, normalized_data jsonb not null,
  validation_errors jsonb not null default '[]'::jsonb,
  validation_warnings jsonb not null default '[]'::jsonb,
  mapping_confidence numeric(5,4) not null default 0,
  transaction_type_confidence numeric(5,4) not null default 0,
  instrument_match_confidence numeric(5,4) not null default 0,
  duplicate_status text not null default 'new' check (duplicate_status in ('new','exact_duplicate','probable_duplicate','possible_duplicate','conflicting_record')),
  duplicate_explanation text,
  resolution_status text not null default 'pending' check (resolution_status in ('pending','resolved','rejected','imported')),
  created_transaction_id uuid references public.transactions(id) on delete set null,
  source_row_fingerprint text not null,
  created_at timestamptz not null default now(),
  unique(import_batch_id, source_worksheet, source_row_number)
);

create table public.import_profiles (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  institution_name text, file_type text not null, file_signature text not null,
  worksheet_signature text, header_signature text not null,
  column_mappings jsonb not null, transaction_aliases jsonb not null default '{}'::jsonb,
  date_format text, decimal_format text, currency_default text,
  account_mapping jsonb not null default '{}'::jsonb,
  instrument_resolution_rules jsonb not null default '{}'::jsonb,
  confidence_history jsonb not null default '[]'::jsonb,
  successful_imports integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(user_id, file_signature)
);

create index transactions_portfolio_date on public.transactions(portfolio_id, trade_date desc);
create index import_batches_user_created on public.import_batches(user_id, created_at desc);
create index import_rows_batch on public.import_rows(import_batch_id, source_row_number);
create index import_profiles_signature on public.import_profiles(user_id, file_signature);

alter table public.transactions enable row level security;
alter table public.import_batches enable row level security;
alter table public.import_rows enable row level security;
alter table public.import_profiles enable row level security;

create policy "own transactions" on public.transactions for all using (
  exists(select 1 from public.portfolios p where p.id = portfolio_id and p.owner_id = auth.uid())
) with check (exists(select 1 from public.portfolios p where p.id = portfolio_id and p.owner_id = auth.uid()));
create policy "own import batches" on public.import_batches for all using (user_id = auth.uid()) with check (
  user_id = auth.uid() and exists(select 1 from public.portfolios p where p.id = portfolio_id and p.owner_id = auth.uid())
);
create policy "own import rows" on public.import_rows for all using (
  exists(select 1 from public.import_batches b where b.id = import_batch_id and b.user_id = auth.uid())
) with check (exists(select 1 from public.import_batches b where b.id = import_batch_id and b.user_id = auth.uid()));
create policy "own import profiles" on public.import_profiles for all using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.transactions, public.import_batches, public.import_rows, public.import_profiles to authenticated;
grant usage, select on all sequences in schema public to authenticated;

comment on table public.import_rows is 'Staged normalized rows; raw_data expires with its batch after the documented 30-day retention period.';
