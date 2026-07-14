create or replace function public.confirm_import_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.import_batches%rowtype;
  v_row public.import_rows%rowtype;
  v_instrument_id uuid;
  v_transaction_id uuid;
  v_imported integer := 0;
  v_skipped integer := 0;
  v_type text;
  v_quantity numeric;
  v_price numeric;
  v_symbol text;
  v_name text;
  v_currency text;
begin
  select * into v_batch from public.import_batches where id = p_batch_id for update;
  if v_batch.id is null or v_batch.user_id <> auth.uid() then raise exception 'Import batch not found'; end if;
  if v_batch.status in ('completed','completed_with_warnings') then
    return jsonb_build_object('batchId', v_batch.id, 'status', v_batch.status, 'imported', v_batch.imported_rows, 'idempotent', true);
  end if;
  if v_batch.status not in ('ready','awaiting_review') then raise exception 'Import batch is not ready for confirmation'; end if;
  if exists(select 1 from public.import_rows where import_batch_id = p_batch_id and jsonb_array_length(validation_errors) > 0 and resolution_status <> 'rejected') then
    raise exception 'Resolve or reject invalid rows before confirmation';
  end if;
  update public.import_batches set status = 'importing', confirmed_at = now() where id = p_batch_id;

  for v_row in select * from public.import_rows where import_batch_id = p_batch_id order by source_row_number for update loop
    if v_row.resolution_status = 'rejected' or v_row.duplicate_status <> 'new' then v_skipped := v_skipped + 1; continue; end if;
    v_symbol := nullif(upper(v_row.normalized_data ->> 'symbol'), '');
    v_name := coalesce(nullif(v_row.normalized_data ->> 'instrumentName', ''), v_symbol);
    v_currency := upper(coalesce(nullif(v_row.normalized_data ->> 'currency', ''), 'CAD'));
    v_instrument_id := nullif(v_row.normalized_data ->> 'instrumentId', '')::uuid;
    if v_instrument_id is null and v_symbol is not null then
      select id into v_instrument_id from public.instruments where symbol = v_symbol;
      if v_instrument_id is null then
        insert into public.instruments(symbol, name, asset_type, currency, price_provider)
        values (v_symbol, v_name, case when v_symbol like 'RBF%' then 'mutual_fund' else 'other' end,
          case when v_currency ~ '^[A-Z]{3}$' then v_currency else 'CAD' end,
          case when v_symbol like 'RBF%' then 'rbc_gam' else 'manual_seed' end)
        returning id into v_instrument_id;
      end if;
    end if;
    v_type := coalesce(v_row.normalized_data ->> 'transactionType', 'other');
    v_quantity := nullif(v_row.normalized_data ->> 'quantity', '')::numeric;
    v_price := nullif(v_row.normalized_data ->> 'unitPrice', '')::numeric;

    v_transaction_id := null;
    insert into public.transactions(portfolio_id, instrument_id, transaction_type, trade_date, settlement_date,
      quantity, unit_price, gross_amount, fees, taxes, net_amount, currency, external_reference,
      original_description, notes, import_batch_id, source_row_fingerprint, metadata)
    values (v_batch.portfolio_id, v_instrument_id, v_type,
      coalesce(nullif(v_row.normalized_data ->> 'tradeDate', '')::date, current_date),
      nullif(v_row.normalized_data ->> 'settlementDate', '')::date,
      v_quantity, v_price, nullif(v_row.normalized_data ->> 'grossAmount', '')::numeric,
      coalesce(nullif(v_row.normalized_data ->> 'fees', '')::numeric, 0),
      coalesce(nullif(v_row.normalized_data ->> 'taxes', '')::numeric, 0),
      nullif(v_row.normalized_data ->> 'netAmount', '')::numeric,
      case when v_currency ~ '^[A-Z]{3}$' then v_currency else 'CAD' end,
      nullif(v_row.normalized_data ->> 'externalReference', ''), v_row.normalized_data ->> 'description',
      v_row.normalized_data ->> 'notes', v_batch.id, v_row.source_row_fingerprint,
      jsonb_build_object('importMode', v_row.normalized_data ->> 'importMode', 'derivedFields', coalesce(v_row.normalized_data -> 'derivedFields', '[]'::jsonb)))
    on conflict (portfolio_id, source_row_fingerprint) do nothing returning id into v_transaction_id;
    if v_transaction_id is null then v_skipped := v_skipped + 1; continue; end if;

    if v_instrument_id is not null and v_quantity is not null then
      if v_type in ('buy','opening_position','transfer_in','reinvested_distribution') then
        insert into public.positions(portfolio_id, instrument_id, units, average_purchase_price, purchase_date, notes)
        values(v_batch.portfolio_id, v_instrument_id, abs(v_quantity), coalesce(v_price, 0),
          coalesce(nullif(v_row.normalized_data ->> 'tradeDate', '')::date, current_date), 'Imported from ' || v_batch.filename)
        on conflict (portfolio_id, instrument_id) do update set
          average_purchase_price = case when public.positions.units + excluded.units = 0 then 0 else
            ((public.positions.units * public.positions.average_purchase_price) + (excluded.units * excluded.average_purchase_price)) / (public.positions.units + excluded.units) end,
          units = public.positions.units + excluded.units, updated_at = now();
      elsif v_type in ('sell','transfer_out') then
        update public.positions set units = greatest(0, units - abs(v_quantity)), updated_at = now()
        where portfolio_id = v_batch.portfolio_id and instrument_id = v_instrument_id;
      end if;
      if v_price is not null and v_price > 0 then
        insert into public.price_history(instrument_id, price, currency, priced_at, source)
        values(v_instrument_id, v_price, case when v_currency ~ '^[A-Z]{3}$' then v_currency else 'CAD' end,
          coalesce(nullif(v_row.normalized_data ->> 'tradeDate', '')::date::timestamptz, now()), 'imported_transaction')
        on conflict (instrument_id, priced_at) do nothing;
      end if;
    end if;
    update public.import_rows set resolution_status = 'imported', created_transaction_id = v_transaction_id where id = v_row.id;
    v_imported := v_imported + 1;
  end loop;

  insert into public.portfolio_snapshots(portfolio_id, market_value, book_value, base_currency, captured_at)
  select v_batch.portfolio_id,
    coalesce(sum(p.units * coalesce((select ph.price from public.price_history ph where ph.instrument_id = p.instrument_id order by ph.priced_at desc limit 1), p.average_purchase_price)), 0),
    coalesce(sum(p.units * p.average_purchase_price), 0), coalesce((select base_currency from public.portfolios where id = v_batch.portfolio_id), 'CAD'), now()
  from public.positions p where p.portfolio_id = v_batch.portfolio_id;

  update public.import_batches set status = case when v_skipped > 0 or warning_rows > 0 then 'completed_with_warnings' else 'completed' end,
    imported_rows = v_imported, completed_at = now() where id = p_batch_id;
  return jsonb_build_object('batchId', p_batch_id, 'status', case when v_skipped > 0 or v_batch.warning_rows > 0 then 'completed_with_warnings' else 'completed' end, 'imported', v_imported, 'skipped', v_skipped, 'idempotent', false);
end;
$$;

grant execute on function public.confirm_import_batch(uuid) to authenticated;
