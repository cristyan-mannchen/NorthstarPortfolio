import { redirect } from "next/navigation";
import Dashboard, { type DashboardPosition } from "@/components/dashboard";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const colors = ["#566fff", "#26c995", "#f5b544", "#b06af3", "#f06b8a", "#55b8e8"];
const kindLabels: Record<string, string> = {
  mutual_fund: "Mutual fund", stock: "Stock", etf: "ETF", crypto: "Crypto", cash: "Cash", other: "Other",
};

type Instrument = { id: string; symbol: string; name: string; asset_type: string; currency: string };
type PositionRow = { id: string; units: number | string; average_purchase_price: number | string; instrument: Instrument | Instrument[] | null };
type PriceRow = { instrument_id: string; price: number | string; priced_at: string };

export default async function Home() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  const { data: initialPortfolios, error: portfolioError } = await supabase.from("portfolios").select("id,name").order("created_at").limit(1);
  let portfolios = initialPortfolios;
  if (portfolioError) throw new Error(`Unable to load portfolio: ${portfolioError.message}`);

  if (!portfolios?.length) {
    const created = await supabase.from("portfolios").insert({ owner_id: user.id, name: "My investments" }).select("id,name").single();
    if (created.error) throw new Error(`Unable to create portfolio: ${created.error.message}`);
    portfolios = [created.data];
  }

  const portfolio = portfolios[0];
  const { data: positionRows, error: positionError } = await supabase
    .from("positions")
    .select("id,units,average_purchase_price,instrument:instruments(id,symbol,name,asset_type,currency)")
    .eq("portfolio_id", portfolio.id)
    .order("created_at");
  if (positionError) throw new Error(`Unable to load positions: ${positionError.message}`);

  const normalizedRows = (positionRows ?? []) as unknown as PositionRow[];
  const instrumentIds = normalizedRows.flatMap((row) => {
    const instrument = Array.isArray(row.instrument) ? row.instrument[0] : row.instrument;
    return instrument ? [instrument.id] : [];
  });
  let priceRows: PriceRow[] = [];
  if (instrumentIds.length) {
    const prices = await supabase.from("price_history").select("instrument_id,price,priced_at").in("instrument_id", instrumentIds).order("priced_at", { ascending: false });
    if (prices.error) throw new Error(`Unable to load prices: ${prices.error.message}`);
    priceRows = (prices.data ?? []) as PriceRow[];
  }

  const pricesByInstrument = new Map<string, PriceRow[]>();
  priceRows.forEach((price) => pricesByInstrument.set(price.instrument_id, [...(pricesByInstrument.get(price.instrument_id) ?? []), price]));
  const positions: DashboardPosition[] = normalizedRows.flatMap((row, index) => {
    const instrument = Array.isArray(row.instrument) ? row.instrument[0] : row.instrument;
    if (!instrument) return [];
    const history = pricesByInstrument.get(instrument.id) ?? [];
    const current = Number(history[0]?.price ?? row.average_purchase_price);
    const previous = Number(history[1]?.price ?? current);
    return [{
      id: row.id,
      name: instrument.name,
      ticker: instrument.symbol,
      kind: kindLabels[instrument.asset_type] ?? "Other",
      units: Number(row.units),
      average: Number(row.average_purchase_price),
      price: current,
      currency: instrument.currency,
      day: previous > 0 ? ((current / previous) - 1) * 100 : 0,
      color: colors[index % colors.length],
    }];
  });

  const { data: snapshots } = await supabase.from("portfolio_snapshots").select("market_value,captured_at").eq("portfolio_id", portfolio.id).order("captured_at").limit(180);
  const history = (snapshots ?? []).map((snapshot) => Number(snapshot.market_value));
  const updatedAt = priceRows[0]?.priced_at ?? null;
  const displayName = profile?.display_name || user.user_metadata.full_name || user.email?.split("@")[0] || "Investor";

  return <Dashboard portfolioId={portfolio.id} portfolioName={portfolio.name} displayName={displayName} email={user.email ?? ""} positions={positions} history={history} updatedAt={updatedAt}/>;
}
