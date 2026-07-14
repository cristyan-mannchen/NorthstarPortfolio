import { createHash } from "node:crypto";
import type { NormalizedImportRecord, ValidatedImportRecord } from "./types";

const SUPPORTED_CURRENCIES = new Set(["CAD", "USD", "EUR", "GBP", "JPY", "AUD", "CHF"]);
function approximatelyEqual(left: number, right: number) { return Math.abs(left - right) <= Math.max(0.02, Math.abs(right) * 0.005); }
export function sourceRowFingerprint(record: NormalizedImportRecord, portfolioId = "") {
  const stable = [portfolioId, record.externalReference, record.symbol, record.transactionType, record.tradeDate, record.settlementDate, record.quantity, record.unitPrice, record.grossAmount, record.netAmount, record.currency].map((value) => value ?? "").join("|");
  return createHash("sha256").update(stable).digest("hex");
}
export function validateRecord(record: NormalizedImportRecord, mappingConfidence: number, portfolioId = ""): ValidatedImportRecord {
  const validationErrors: string[] = [], validationWarnings: string[] = [];
  if (!record.symbol && !["deposit", "withdrawal", "fee", "tax"].includes(record.transactionType ?? "")) validationErrors.push("Instrument symbol is required.");
  if (!record.tradeDate) validationErrors.push("Trade date is missing or ambiguous.");
  if (!record.currency || !SUPPORTED_CURRENCIES.has(record.currency)) validationErrors.push("Currency is missing or unsupported.");
  if (["buy", "sell", "opening_position", "transfer_in", "transfer_out"].includes(record.transactionType ?? "") && (!record.quantity || record.quantity === 0)) validationErrors.push("Quantity is required for this transaction type.");
  if (record.quantity != null && record.unitPrice != null && record.grossAmount != null && !approximatelyEqual(Math.abs(record.quantity * record.unitPrice), Math.abs(record.grossAmount))) validationWarnings.push("Quantity × unit price does not reconcile with gross amount.");
  if (record.grossAmount != null && record.netAmount != null) {
    const expected = Math.abs(record.grossAmount) - Math.abs(record.fees ?? 0) - Math.abs(record.taxes ?? 0);
    if (!approximatelyEqual(expected, Math.abs(record.netAmount))) validationWarnings.push("Net amount does not reconcile with gross amount, fees, and taxes.");
  }
  const completeness = Math.max(0, 1 - validationErrors.length * 0.25 - validationWarnings.length * 0.07);
  return { ...record, validationErrors, validationWarnings, rowConfidence: Math.min(mappingConfidence * completeness, 1), duplicateStatus: "new", sourceRowFingerprint: sourceRowFingerprint(record, portfolioId) };
}
