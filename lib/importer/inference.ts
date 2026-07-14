import type { ColumnMapping, DatasetType, InferredImportSchema, NormalizedImportField, ParsedDataset, ParsedRow, ParsedWorksheet } from "./types";

const FIELD_ALIASES: Record<NormalizedImportField, string[]> = {
  account_name: ["account name", "account"], account_number_masked: ["account number", "account no", "acct"],
  portfolio_name: ["portfolio", "portfolio name"], institution_name: ["institution", "broker", "dealer"],
  symbol: ["symbol", "ticker", "fund code", "security code", "asset"], provider_symbol: ["provider symbol"],
  instrument_name: ["security name", "instrument", "investment name", "description", "asset name", "fund name"],
  instrument_type: ["asset type", "security type", "instrument type", "category"], exchange: ["exchange", "market"],
  currency: ["currency", "ccy", "curr"], transaction_type: ["transaction type", "activity", "action", "type", "transaction"],
  trade_date: ["trade date", "transaction date", "date", "activity date"], settlement_date: ["settlement date", "settle date"],
  quantity: ["quantity", "qty", "units", "shares", "number of units"], unit_price: ["unit price", "nav", "execution price", "trade price", "price"],
  gross_amount: ["gross amount", "gross", "amount", "proceeds"], fees: ["fees", "fee", "commission", "charges"],
  taxes: ["taxes", "tax", "withholding tax"], net_amount: ["net amount", "net", "total amount"],
  book_value: ["book value", "cost basis", "adjusted cost base", "cost"], market_value: ["market value", "current value", "value"],
  exchange_rate: ["exchange rate", "fx rate", "conversion rate"], external_reference: ["reference", "transaction id", "activity id", "confirmation"],
  description: ["memo", "details", "transaction description", "narrative"], notes: ["notes", "note", "comments"],
};

function normalizeHeader(value: unknown) { return String(value ?? "").trim().toLowerCase().replace(/[_\-]+/g, " ").replace(/\s+/g, " "); }
function aliasScore(header: string, alias: string) {
  if (header === alias) return 1;
  if (header.includes(alias) || alias.includes(header)) return 0.86;
  const headerWords = new Set(header.split(" "));
  const aliasWords = alias.split(" ");
  return aliasWords.filter((word) => headerWords.has(word)).length / Math.max(headerWords.size, aliasWords.length);
}
export function inferColumn(header: unknown, types: string[] = []): Omit<ColumnMapping, "sourceColumnIndex" | "sourceColumn"> | null {
  const normalized = normalizeHeader(header);
  if (!normalized) return null;
  let best: { field: NormalizedImportField; score: number } | null = null;
  for (const [field, aliases] of Object.entries(FIELD_ALIASES) as [NormalizedImportField, string[]][]) {
    const score = Math.max(...aliases.map((alias) => aliasScore(normalized, alias)));
    if (!best || score > best.score) best = { field, score };
  }
  if (!best || best.score < 0.45) {
    const dateRatio = types.filter((type) => type === "date").length / Math.max(types.length, 1);
    if (dateRatio > 0.8) return { targetField: "trade_date", confidence: 0.55, reasoningCode: "VALUE_PATTERN_DATE" };
    return null;
  }
  return { targetField: best.field, confidence: Math.min(best.score, 1), reasoningCode: best.score === 1 ? "EXACT_ALIAS" : "FUZZY_ALIAS" };
}

function headerCandidateScore(row: ParsedRow, following: ParsedRow[]) {
  const nonEmpty = row.cells.filter((cell) => cell.inferredPrimitiveType !== "empty");
  if (nonEmpty.length < 2) return 0;
  const strings = nonEmpty.filter((cell) => cell.inferredPrimitiveType === "string").length / nonEmpty.length;
  const mapped = nonEmpty.filter((cell) => inferColumn(cell.formattedValue ?? cell.rawValue)).length / nonEmpty.length;
  const followingData = following.length ? following.filter((candidate) => candidate.cells.some((cell) => ["number", "date"].includes(cell.inferredPrimitiveType ?? ""))).length / following.length : 0;
  return strings * 0.25 + mapped * 0.55 + followingData * 0.2;
}
export function detectHeader(sheet: ParsedWorksheet) {
  const candidates = sheet.rows.slice(0, 50).map((row, index) => ({ index, score: headerCandidateScore(row, sheet.rows.slice(index + 1, index + 6)) })).sort((a, b) => b.score - a.score);
  const best = candidates[0] ?? { index: 0, score: 0 };
  return { headerRowIndex: best.index, dataStartRowIndex: best.index + 1, confidence: best.score };
}
function classifyRow(row: ParsedRow, headerValues: string[]) {
  const values = row.cells.map((cell) => normalizeHeader(cell.formattedValue ?? cell.rawValue));
  const nonEmpty = values.filter(Boolean);
  if (!nonEmpty.length) return "empty" as const;
  const joined = nonEmpty.join(" ");
  if (/\b(total|subtotal|balance forward)\b/.test(joined)) return "subtotal" as const;
  if (/\b(disclaimer|important information|page \d+|generated on)\b/.test(joined)) return "footer" as const;
  const repeated = headerValues.length > 1 && headerValues.filter((value, index) => value && values[index] === value).length / headerValues.filter(Boolean).length > 0.7;
  return repeated ? "header" as const : "data" as const;
}
function datasetType(mappings: ColumnMapping[]): DatasetType {
  const fields = new Set(mappings.map((mapping) => mapping.targetField));
  const hasTransactions = fields.has("transaction_type") || fields.has("trade_date");
  const hasHoldings = fields.has("quantity") && (fields.has("market_value") || fields.has("book_value")) && !fields.has("transaction_type");
  if (hasTransactions && hasHoldings) return "mixed";
  if (hasTransactions) return "transactions";
  if (hasHoldings) return "positions";
  return "unknown";
}
export function analyzeStructure(dataset: ParsedDataset) {
  const sheets = dataset.worksheets.map((sheet) => {
    const header = detectHeader(sheet);
    const headerRow = sheet.rows[header.headerRowIndex];
    const headerValues = headerRow?.cells.map((cell) => normalizeHeader(cell.formattedValue ?? cell.rawValue)) ?? [];
    sheet.rows.forEach((row, index) => { row.rowType = index === header.headerRowIndex ? "header" : classifyRow(row, headerValues); });
    sheet.detectedHeaderRow = headerRow?.sourceRowNumber;
    sheet.detectedDataStartRow = sheet.rows[header.dataStartRowIndex]?.sourceRowNumber;
    sheet.confidence = header.confidence;
    const mappings = headerValues.flatMap((sourceColumn, sourceColumnIndex) => {
      const types = sheet.rows.slice(header.dataStartRowIndex, header.dataStartRowIndex + 20).map((row) => row.cells[sourceColumnIndex]?.inferredPrimitiveType ?? "empty");
      const inferred = inferColumn(sourceColumn, types);
      return inferred ? [{ sourceColumnIndex, sourceColumn, ...inferred }] : [];
    });
    const mappingConfidence = mappings.length ? mappings.reduce((sum, mapping) => sum + mapping.confidence, 0) / mappings.length : 0;
    const schema: InferredImportSchema = { datasetType: datasetType(mappings), headerRow: headerRow?.sourceRowNumber ?? 1, dataStartRow: sheet.rows[header.dataStartRowIndex]?.sourceRowNumber ?? 2, mappings, transactionTypeRules: [], warnings: [], overallConfidence: header.confidence * 0.45 + mappingConfidence * 0.55 };
    if (schema.datasetType === "unknown") schema.warnings.push("Dataset type could not be determined.");
    return { sheet, schema };
  });
  return sheets.sort((a, b) => b.schema.overallConfidence - a.schema.overallConfidence);
}

export { FIELD_ALIASES };
