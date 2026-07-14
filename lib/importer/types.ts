export const NORMALIZED_FIELDS = [
  "account_name", "account_number_masked", "portfolio_name", "institution_name",
  "symbol", "provider_symbol", "instrument_name", "instrument_type", "exchange", "currency",
  "transaction_type", "trade_date", "settlement_date", "quantity", "unit_price", "gross_amount",
  "fees", "taxes", "net_amount", "book_value", "market_value", "exchange_rate",
  "external_reference", "description", "notes",
] as const;

export type NormalizedImportField = typeof NORMALIZED_FIELDS[number];
export type PrimitiveType = "string" | "number" | "date" | "boolean" | "empty";
export type RowType = "header" | "data" | "subtotal" | "footer" | "empty" | "unknown";
export type DatasetType = "transactions" | "positions" | "income" | "account_summary" | "mixed" | "unknown";
export type ConfidenceBand = "high" | "review" | "manual";

export interface UploadedInvestmentFile {
  filename: string;
  mimeType: string;
  size: number;
  bytes: Uint8Array;
}

export interface ParsedCell { rawValue: unknown; formattedValue?: string; inferredPrimitiveType?: PrimitiveType }
export interface ParsedRow { sourceRowNumber: number; cells: ParsedCell[]; rowType?: RowType }
export interface ParsedWorksheet {
  name: string; rows: ParsedRow[]; hidden?: boolean;
  detectedHeaderRow?: number; detectedDataStartRow?: number; confidence: number;
}
export interface ParseWarning { code: string; message: string; worksheet?: string; sourceRowNumber?: number }
export interface ParsedDataset {
  fileType: "csv" | "txt" | "xlsx" | "xls" | "unknown";
  encoding?: string; delimiter?: string; worksheets: ParsedWorksheet[]; warnings: ParseWarning[];
}
export interface FileInspectionResult {
  parserId: string; detectedFileType: ParsedDataset["fileType"]; safe: boolean;
  warnings: ParseWarning[]; worksheetNames: string[];
}
export interface ParseOptions { maxRows?: number; includeHiddenWorksheets?: boolean }
export interface InvestmentFileParser {
  parserId: string;
  supports(file: UploadedInvestmentFile): Promise<boolean>;
  inspect(file: UploadedInvestmentFile): Promise<FileInspectionResult>;
  parse(file: UploadedInvestmentFile, options?: ParseOptions): Promise<ParsedDataset>;
}

export interface ColumnMapping {
  sourceColumnIndex: number; sourceColumn: string; targetField: NormalizedImportField;
  confidence: number; reasoningCode: string;
}
export interface InferredImportSchema {
  datasetType: DatasetType; headerRow: number; dataStartRow: number;
  mappings: ColumnMapping[]; transactionTypeRules: TransactionTypeRule[];
  warnings: string[]; overallConfidence: number;
}
export interface TransactionTypeRule { sourceTerms: string[]; normalizedType: NormalizedTransactionType; confidence: number }
export type NormalizedTransactionType = "buy" | "sell" | "distribution" | "dividend" | "interest" | "reinvested_distribution" | "fee" | "tax" | "deposit" | "withdrawal" | "transfer_in" | "transfer_out" | "return_of_capital" | "split" | "opening_position" | "other";

export interface NormalizedImportRecord {
  sourceWorksheet: string; sourceRowNumber: number; datasetType: DatasetType;
  importMode: "opening_position" | "transfer_in" | "historical_transaction" | "current_balance_snapshot";
  symbol?: string; instrumentName?: string; instrumentType?: string; currency?: string;
  transactionType?: NormalizedTransactionType; tradeDate?: string; settlementDate?: string;
  quantity?: number; unitPrice?: number; grossAmount?: number; fees?: number; taxes?: number;
  netAmount?: number; bookValue?: number; marketValue?: number; externalReference?: string;
  description?: string; notes?: string; derivedFields: string[]; rawData: Record<string, unknown>;
}
export interface ValidatedImportRecord extends NormalizedImportRecord {
  validationErrors: string[]; validationWarnings: string[]; rowConfidence: number;
  duplicateStatus: "new" | "exact_duplicate" | "probable_duplicate" | "possible_duplicate" | "conflicting_record";
  duplicateExplanation?: string; sourceRowFingerprint: string;
}

export const CONFIDENCE_THRESHOLDS = { high: 0.9, review: 0.7 } as const;
export function confidenceBand(score: number): ConfidenceBand {
  return score >= CONFIDENCE_THRESHOLDS.high ? "high" : score >= CONFIDENCE_THRESHOLDS.review ? "review" : "manual";
}
