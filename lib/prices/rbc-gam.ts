import type { PriceProvider, PriceQuote } from "./types";

const RBC_CODE = /^RBF\d{3,5}$/i;

/** Official RBC GAM public pages are the source of truth for RBC mutual funds. */
export class RbcGamProvider implements PriceProvider {
  supports(symbol: string) { return RBC_CODE.test(symbol); }

  async getQuote(symbol: string): Promise<PriceQuote> {
    const code = symbol.toUpperCase();
    const url = `https://www.rbcgam.com/en/ca/products/mutual-funds/${code}/detail`;
    const response = await fetch(url, { headers: { "User-Agent": "NorthstarPortfolioTracker/1.0" }, cache: "no-store" });
    if (!response.ok) throw new Error(`RBC GAM returned ${response.status}`);
    const html = await response.text();

    // RBC renders different page variants. These patterns intentionally target
    // explicit NAV/price fields and fail closed if the page changes.
    const patterns = [
      /(?:NAV|Price)[^$]{0,80}\$\s*([0-9]+(?:\.[0-9]{1,6})?)/i,
      /"(?:nav|price|currentPrice)"\s*:\s*"?([0-9]+(?:\.[0-9]{1,6})?)/i,
    ];
    const match = patterns.map((pattern) => html.match(pattern)).find(Boolean);
    const price = match ? Number(match[1]) : Number.NaN;
    if (!Number.isFinite(price) || price <= 0) throw new Error(`No valid NAV found for ${code}`);
    return { symbol: code, price, currency: "CAD", asOf: new Date().toISOString(), source: "RBC GAM" };
  }
}
