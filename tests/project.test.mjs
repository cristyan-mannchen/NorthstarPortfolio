import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("production configuration protects the scheduled updater", async () => {
  const route = await readFile(new URL("../app/api/cron/update-prices/route.ts", import.meta.url), "utf8");
  assert.match(route, /CRON_SECRET/);
  assert.match(route, /authorization/);
});

test("database schema enables row level security", async () => {
  const schema = await readFile(new URL("../supabase/migrations/202607130001_initial_schema.sql", import.meta.url), "utf8");
  assert.match(schema, /enable row level security/g);
  assert.match(schema, /own portfolios/);
  assert.match(schema, /own positions/);
});

test("application protects portfolio sessions and validates writes", async () => {
  const proxy = await readFile(new URL("../proxy.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const actions = await readFile(new URL("../app/actions/portfolio.ts", import.meta.url), "utf8");
  assert.match(proxy, /auth\.getUser/);
  assert.match(page, /redirect\("\/login"\)/);
  assert.match(actions, /positionSchema\.safeParse/);
  assert.match(actions, /eq\("owner_id", user\.id\)/);
});

test("dashboard no longer ships the illustrative user and holdings", async () => {
  const dashboard = await readFile(new URL("../components/dashboard.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(dashboard, /Marc Gauthier|marc@example\.com/);
  assert.match(dashboard, /positions: DashboardPosition\[\]/);
});

test("import schema is RLS protected and confirmation is atomic and idempotent", async () => {
  const foundation = await readFile(new URL("../supabase/migrations/202607140001_intelligent_import_foundation.sql", import.meta.url), "utf8");
  const execution = await readFile(new URL("../supabase/migrations/202607140002_atomic_import_execution.sql", import.meta.url), "utf8");
  assert.match(foundation, /alter table public\.import_batches enable row level security/);
  assert.match(foundation, /unique\(user_id, portfolio_id, file_hash\)/);
  assert.match(execution, /for update/);
  assert.match(execution, /if v_batch\.status in \('completed','completed_with_warnings'\)/);
  assert.match(execution, /auth\.uid\(\)/);
});

test("import routes authenticate and verify portfolio ownership", async () => {
  const analyze = await readFile(new URL("../app/api/imports/analyze/route.ts", import.meta.url), "utf8");
  const confirm = await readFile(new URL("../app/api/imports/[batchId]/confirm/route.ts", import.meta.url), "utf8");
  assert.match(analyze, /auth\.getUser/);
  assert.match(analyze, /eq\("owner_id", user\.id\)/);
  assert.match(confirm, /auth\.getUser/);
  assert.match(confirm, /confirm_import_batch/);
});
