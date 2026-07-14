import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLatestQuote } from "@/lib/prices";

export const maxDuration = 60;

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createAdminClient();
  const { data: instruments, error } = await db.from("instruments").select("id,symbol").eq("is_active", true);
  if (error) throw error;
  const results = await Promise.allSettled((instruments ?? []).map(async (instrument) => {
    const quote = await getLatestQuote(instrument.symbol);
    const { error: insertError } = await db.from("price_history").upsert({ instrument_id: instrument.id, price: quote.price, currency: quote.currency, priced_at: quote.asOf, source: quote.source }, { onConflict: "instrument_id,priced_at" });
    if (insertError) throw insertError;
    return quote.symbol;
  }));
  const failed = results.filter((result) => result.status === "rejected");
  await db.from("job_runs").insert({ job_name: "update-prices", status: failed.length ? "partial" : "success", processed: results.length, failed: failed.length, finished_at: new Date().toISOString() });
  return NextResponse.json({ processed: results.length, succeeded: results.length - failed.length, failed: failed.length }, { status: failed.length === results.length && results.length ? 502 : 200 });
}
