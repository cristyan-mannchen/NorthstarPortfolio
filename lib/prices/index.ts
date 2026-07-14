import { RbcGamProvider } from "./rbc-gam";
import type { PriceQuote, PriceProvider } from "./types";

const providers: PriceProvider[] = [new RbcGamProvider()];

export async function getLatestQuote(symbol: string): Promise<PriceQuote> {
  const normalized = symbol.trim().toUpperCase();
  const provider = providers.find((candidate) => candidate.supports(normalized));
  if (!provider) throw new Error(`No configured price provider supports ${normalized}`);
  return retry(() => provider.getQuote(normalized), 3);
}

async function retry<T>(operation: () => Promise<T>, attempts: number): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try { return await operation(); } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** (attempt - 1)));
    }
  }
  throw lastError;
}
