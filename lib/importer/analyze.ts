import type { SupabaseClient } from "@supabase/supabase-js";
import { analyzeStructure } from "./inference";
import { detectNumberFormat, normalizeRow } from "./normalize";
import { maskSensitiveText, structuralSignature } from "./security";
import type { ParsedDataset } from "./types";
import { validateRecord } from "./validation";
import { findImportProfile, rebindMappings, worksheetHeaders } from "./profiles";

const INSTITUTION_CLUES: Record<string, string[]> = {
  "RBC Direct Investing": ["rbc direct investing", "royal bank", "rbcdirectinvesting"],
  "TD Direct Investing": ["td direct investing", "webbroker"], Wealthsimple: ["wealthsimple"],
  Questrade: ["questrade"], "BMO InvestorLine": ["investorline", "bank of montreal"],
  "CIBC Investor’s Edge": ["investor's edge", "investors edge"], "Interactive Brokers": ["interactive brokers", "ibkr"],
  Coinbase: ["coinbase"], Kraken: ["kraken"], Binance: ["binance"],
};
export function detectInstitution(filename: string, dataset: ParsedDataset) {
  const sample = maskSensitiveText([filename, ...dataset.worksheets.map((sheet) => sheet.name), ...dataset.worksheets.flatMap((sheet) => sheet.rows.slice(0, 8).flatMap((row) => row.cells.map((cell) => String(cell.formattedValue ?? cell.rawValue ?? ""))))].join(" ").toLowerCase());
  let best: { name: string; hits: number } | null = null;
  for (const [name, clues] of Object.entries(INSTITUTION_CLUES)) {
    const hits = clues.filter((clue) => sample.includes(clue)).length;
    if (hits && (!best || hits > best.hits)) best = { name, hits };
  }
  return best ? { name: best.name, confidence: Math.min(0.65 + best.hits * 0.12, 0.98) } : { name: undefined, confidence: 0 };
}

export async function analyzeParsedDataset(dataset: ParsedDataset, filename: string, portfolioId: string, db: SupabaseClient) {
  const analyses = analyzeStructure(dataset);
  const selected = analyses.find((analysis) => !analysis.sheet.hidden && analysis.schema.datasetType !== "unknown") ?? analyses[0];
  if (!selected || selected.schema.overallConfidence < 0.35) throw new Error("No relevant financial dataset could be identified.");
  const fileSignature = structuralSignature(dataset);
  const headers = worksheetHeaders(selected.sheet, selected.schema.headerRow);
  const profileMatch = await findImportProfile(db, fileSignature, dataset.fileType, headers);
  if (profileMatch && Array.isArray(profileMatch.profile.column_mappings)) {
    const rebound = rebindMappings(profileMatch.profile.column_mappings as typeof selected.schema.mappings, headers);
    if (rebound.length >= Math.max(2, selected.schema.mappings.length * 0.7)) {
      selected.schema.mappings = rebound;
      selected.schema.overallConfidence = Math.max(selected.schema.overallConfidence, 0.9 * profileMatch.similarity);
    }
  }
  const dataRows = selected.sheet.rows.filter((row) => row.sourceRowNumber >= selected.schema.dataStartRow && row.rowType === "data");
  const numericSamples = dataRows.slice(0, 100).flatMap((row) => row.cells.map((cell) => String(cell.formattedValue ?? "")).filter((value) => /\d[.,]\d/.test(value)));
  const numberFormat = detectNumberFormat(numericSamples);
  const records = dataRows.map((row) => validateRecord(normalizeRow(row, selected.schema.mappings, selected.schema.datasetType, selected.sheet.name, numberFormat.decimalSeparator), selected.schema.overallConfidence, portfolioId));

  const symbols = [...new Set(records.flatMap((record) => record.symbol ? [record.symbol] : []))];
  const instruments = symbols.length ? await db.from("instruments").select("id,symbol,name,currency,asset_type").in("symbol", symbols) : { data: [], error: null };
  if (instruments.error) throw new Error(`Instrument lookup failed: ${instruments.error.message}`);
  const bySymbol = new Map((instruments.data ?? []).map((instrument) => [instrument.symbol, instrument]));
  const fingerprints = records.map((record) => record.sourceRowFingerprint);
  const duplicates = fingerprints.length ? await db.from("transactions").select("source_row_fingerprint").eq("portfolio_id", portfolioId).in("source_row_fingerprint", fingerprints) : { data: [], error: null };
  if (duplicates.error) throw new Error(`Duplicate check failed: ${duplicates.error.message}`);
  const exact = new Set((duplicates.data ?? []).map((row) => row.source_row_fingerprint));

  const resolved = records.map((record) => {
    const match = record.symbol ? bySymbol.get(record.symbol) : undefined;
    const duplicate = exact.has(record.sourceRowFingerprint);
    const currencyConflict = Boolean(match && record.currency && match.currency !== record.currency);
    return {
      ...record,
      validationErrors: currencyConflict ? [...record.validationErrors, `Symbol ${record.symbol} already exists in ${match?.currency}; instrument resolution is ambiguous.`] : record.validationErrors,
      rowConfidence: currencyConflict ? Math.min(record.rowConfidence, 0.69) : record.rowConfidence,
      duplicateStatus: duplicate ? "exact_duplicate" as const : record.duplicateStatus,
      duplicateExplanation: duplicate ? "A transaction with the same normalized fingerprint already exists in this portfolio." : undefined,
      instrumentId: match?.id ?? null,
      instrumentMatchConfidence: match ? (match.currency === record.currency ? 1 : 0.55) : record.symbol ? 0.65 : 0,
    };
  });
  const institution = detectInstitution(filename, dataset);
  const validRows = resolved.filter((record) => record.validationErrors.length === 0 && record.duplicateStatus === "new").length;
  const invalidRows = resolved.filter((record) => record.validationErrors.length > 0).length;
  const warningRows = resolved.filter((record) => record.validationWarnings.length > 0).length;
  const duplicateRows = resolved.filter((record) => record.duplicateStatus !== "new").length;
  const overallConfidence = resolved.length ? resolved.reduce((sum, record) => sum + record.rowConfidence, 0) / resolved.length : selected.schema.overallConfidence;
  return { dataset, selected, records: resolved, institution, fileSignature, profileMatch: profileMatch ? { id: profileMatch.profile.id, similarity: profileMatch.similarity } : null, overallConfidence, counts: { totalRows: resolved.length, validRows, invalidRows, warningRows, duplicateRows } };
}

export type AnalyzedImport = Awaited<ReturnType<typeof analyzeParsedDataset>>;
