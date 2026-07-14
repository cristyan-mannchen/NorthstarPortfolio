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
