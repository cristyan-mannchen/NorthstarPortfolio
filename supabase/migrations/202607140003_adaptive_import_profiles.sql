alter table public.import_batches add column inference_schema jsonb not null default '{}'::jsonb;

comment on column public.import_batches.inference_schema is 'Validated deterministic or AI-assisted mapping used for this batch; contains structure only, not raw financial values.';
