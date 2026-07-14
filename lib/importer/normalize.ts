import type { ColumnMapping, DatasetType, NormalizedImportRecord, NormalizedTransactionType, ParsedRow } from "./types";

const TRANSACTION_ALIASES: Record<NormalizedTransactionType, string[]> = {
  buy: ["buy", "bought", "purchase", "subscription", "contribution purchase"], sell: ["sell", "sold", "sale", "redemption"],
  distribution: ["distribution"], dividend: ["dividend", "cash dividend"], interest: ["interest"],
  reinvested_distribution: ["reinvestment", "reinvested dividend", "distribution reinvestment"], fee: ["fee", "management fee", "commission"],
  tax: ["tax", "withholding tax"], deposit: ["deposit", "cash contribution"], withdrawal: ["withdrawal"],
  transfer_in: ["transfer in", "journal in"], transfer_out: ["transfer out", "journal out"], return_of_capital: ["return of capital", "roc"],
  split: ["split", "stock split"], opening_position: ["opening position"], other: ["other", "journal"],
};
export function normalizeTransactionType(value: unknown) {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/[_-]+/g, " ");
  let best: { type: NormalizedTransactionType; alias: string } | null = null;
  for (const [type, aliases] of Object.entries(TRANSACTION_ALIASES) as [NormalizedTransactionType, string[]][]) {
    for (const alias of aliases) if ((normalized === alias || normalized.includes(alias)) && (!best || alias.length > best.alias.length)) best = { type, alias };
  }
  if (best) return { type: best.type, confidence: normalized === best.alias ? 1 : 0.92 };
  return { type: "other" as const, confidence: normalized ? 0.35 : 0 };
}
export function detectNumberFormat(values: string[]) {
  const relevant = values.filter((value) => /\d[.,]\d/.test(value));
  const commaDecimal = relevant.filter((value) => /,\d{1,4}$/.test(value) && !/\.\d{1,4}$/.test(value)).length;
  return { decimalSeparator: commaDecimal > relevant.length / 2 ? "," as const : "." as const, thousandsSeparator: commaDecimal > relevant.length / 2 ? "." as const : "," as const, confidence: relevant.length ? Math.max(commaDecimal, relevant.length - commaDecimal) / relevant.length : 0.5 };
}
export function parseFinancialNumber(value: unknown, decimalSeparator: "." | "," = ".") {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  const negative = /^\(.*\)$/.test(raw) || /^-/.test(raw);
  const cleaned = raw.replace(/[()$€£¥%\sA-Z]/gi, "").replace(decimalSeparator === "," ? /\./g : /,/g, "").replace(decimalSeparator, ".");
  const parsed = Number(cleaned.replace(/^-/, ""));
  return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : undefined;
}
export function parseFinancialDate(value: unknown, preference?: "mdy" | "dmy") {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return { value: value.toISOString().slice(0, 10), confidence: 1 };
  const raw = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { value: raw, confidence: 1 };
  const match = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/.exec(raw);
  if (!match) return { value: undefined, confidence: 0 };
  const first = Number(match[1]), second = Number(match[2]), year = Number(match[3]) + (match[3].length === 2 ? 2000 : 0);
  if (first <= 12 && second <= 12 && !preference) return { value: undefined, confidence: 0.45, ambiguous: true };
  const month = preference === "dmy" || first > 12 ? second : first;
  const day = preference === "dmy" || first > 12 ? first : second;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return { value: undefined, confidence: 0 };
  return { value: date.toISOString().slice(0, 10), confidence: first > 12 || second > 12 ? 0.95 : 0.75 };
}

export function normalizeRow(row: ParsedRow, mappings: ColumnMapping[], datasetType: DatasetType, worksheet: string, decimalSeparator: "." | "," = "."): NormalizedImportRecord {
  const values = new Map(mappings.map((mapping) => [mapping.targetField, row.cells[mapping.sourceColumnIndex]?.rawValue]));
  const quantity = parseFinancialNumber(values.get("quantity"), decimalSeparator);
  const bookValue = parseFinancialNumber(values.get("book_value"), decimalSeparator);
  const unitPrice = parseFinancialNumber(values.get("unit_price"), decimalSeparator);
  const transaction = normalizeTransactionType(values.get("transaction_type"));
  const date = parseFinancialDate(values.get("trade_date"));
  const derivedFields: string[] = [];
  let averagePrice = unitPrice;
  if (averagePrice == null && bookValue != null && quantity) { averagePrice = bookValue / quantity; derivedFields.push("unit_price_from_book_value"); }
  const tradeDate = date.value ?? (datasetType === "positions" ? new Date().toISOString().slice(0, 10) : undefined);
  if (!date.value && datasetType === "positions") derivedFields.push("trade_date_from_import_date");
  return {
    sourceWorksheet: worksheet, sourceRowNumber: row.sourceRowNumber, datasetType,
    importMode: datasetType === "positions" ? "opening_position" : "historical_transaction",
    symbol: String(values.get("symbol") ?? "").trim().toUpperCase() || undefined,
    instrumentName: String(values.get("instrument_name") ?? "").trim() || undefined,
    instrumentType: String(values.get("instrument_type") ?? "").trim() || undefined,
    currency: String(values.get("currency") ?? "").trim().toUpperCase() || undefined,
    transactionType: datasetType === "positions" ? "opening_position" : transaction.type,
    tradeDate, settlementDate: parseFinancialDate(values.get("settlement_date")).value,
    quantity, unitPrice: averagePrice, grossAmount: parseFinancialNumber(values.get("gross_amount"), decimalSeparator),
    fees: parseFinancialNumber(values.get("fees"), decimalSeparator), taxes: parseFinancialNumber(values.get("taxes"), decimalSeparator),
    netAmount: parseFinancialNumber(values.get("net_amount"), decimalSeparator), bookValue,
    marketValue: parseFinancialNumber(values.get("market_value"), decimalSeparator),
    externalReference: String(values.get("external_reference") ?? "").trim() || undefined,
    description: String(values.get("description") ?? values.get("transaction_type") ?? "").trim() || undefined,
    notes: String(values.get("notes") ?? "").trim() || undefined, derivedFields,
    rawData: Object.fromEntries(mappings.map((mapping) => [mapping.sourceColumn || `column_${mapping.sourceColumnIndex + 1}`, row.cells[mapping.sourceColumnIndex]?.rawValue ?? null])),
  };
}

export { TRANSACTION_ALIASES };
