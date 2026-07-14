export type PriceQuote = {
  symbol: string;
  name?: string;
  price: number;
  currency: string;
  asOf: string;
  source: string;
};

export interface PriceProvider {
  supports(symbol: string): boolean;
  getQuote(symbol: string): Promise<PriceQuote>;
}
