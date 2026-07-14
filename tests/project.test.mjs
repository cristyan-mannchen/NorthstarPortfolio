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
