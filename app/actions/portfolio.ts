"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const positionSchema = z.object({
  portfolioId: z.string().uuid(),
  symbol: z.string().trim().min(1).max(20).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(1).max(200),
  units: z.coerce.number().positive().finite(),
  averagePrice: z.coerce.number().nonnegative().finite(),
  assetType: z.enum(["mutual_fund", "stock", "etf", "crypto", "other"]),
  currency: z.string().regex(/^[A-Z]{3}$/),
  purchaseDate: z.string().optional().transform((value) => value || null),
});

export async function addPosition(formData: FormData) {
  const parsed = positionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Please check the investment details and try again.");

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: portfolio } = await supabase.from("portfolios").select("id").eq("id", parsed.data.portfolioId).eq("owner_id", user.id).maybeSingle();
  if (!portfolio) throw new Error("Portfolio not found.");

  const admin = createAdminClient();
  const existingInstrument = await admin.from("instruments").select("id").eq("symbol", parsed.data.symbol).maybeSingle();
  if (existingInstrument.error) throw new Error(`Unable to check investment: ${existingInstrument.error.message}`);
  let instrument = existingInstrument.data;
  if (!instrument) {
    const createdInstrument = await admin.from("instruments").insert({
      symbol: parsed.data.symbol,
      name: parsed.data.name,
      asset_type: parsed.data.assetType,
      currency: parsed.data.currency,
      price_provider: parsed.data.symbol.startsWith("RBF") ? "rbc_gam" : "manual_seed",
    }).select("id").single();
    if (createdInstrument.error) throw new Error(`Unable to save investment: ${createdInstrument.error.message}`);
    instrument = createdInstrument.data;
  }

  const { error: positionError } = await admin.from("positions").upsert({
    portfolio_id: portfolio.id,
    instrument_id: instrument.id,
    units: parsed.data.units,
    average_purchase_price: parsed.data.averagePrice,
    purchase_date: parsed.data.purchaseDate,
  }, { onConflict: "portfolio_id,instrument_id" });
  if (positionError) throw new Error(`Unable to save position: ${positionError.message}`);

  const { data: latestPrice } = await admin.from("price_history").select("id").eq("instrument_id", instrument.id).limit(1).maybeSingle();
  if (!latestPrice && parsed.data.averagePrice > 0) {
    await admin.from("price_history").insert({ instrument_id: instrument.id, price: parsed.data.averagePrice, currency: parsed.data.currency, priced_at: new Date().toISOString(), source: "initial_book_value" });
  }

  revalidatePath("/");
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
