import { createHash } from "node:crypto";
import type { ParsedDataset, UploadedInvestmentFile } from "./types";

export const IMPORT_LIMITS = { maxFileBytes: 10 * 1024 * 1024, maxRows: 20_000, maxColumns: 100, maxCellCharacters: 10_000 } as const;

export function assertSafeUpload(file: UploadedInvestmentFile) {
  if (!file.filename || file.filename.length > 255) throw new Error("The filename is invalid.");
  if (file.size <= 0) throw new Error("The uploaded file is empty.");
  if (file.size > IMPORT_LIMITS.maxFileBytes) throw new Error("The file exceeds the 10 MB import limit.");
  if (/\.(xlsm|xltm|xlam)$/i.test(file.filename)) throw new Error("Macro-enabled workbooks are not supported.");
}

export function fileHash(bytes: Uint8Array) { return createHash("sha256").update(bytes).digest("hex"); }
export function sanitizeCellValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.slice(0, IMPORT_LIMITS.maxCellCharacters);
  return /^[=+\-@]/.test(trimmed.trimStart()) ? `'${trimmed}` : trimmed;
}
export function maskSensitiveText(value: string) {
  return value.replace(/\b\d{7,19}\b/g, (match) => `${"*".repeat(Math.max(0, match.length - 4))}${match.slice(-4)}`);
}
export function structuralSignature(dataset: ParsedDataset) {
  const structure = dataset.worksheets.map((sheet) => ({
    name: sheet.name.toLowerCase().replace(/\d+/g, "#"), hidden: Boolean(sheet.hidden),
    columns: Math.max(0, ...sheet.rows.slice(0, 20).map((row) => row.cells.length)),
    primitivePatterns: sheet.rows.slice(0, 10).map((row) => row.cells.map((cell) => cell.inferredPrimitiveType ?? "empty").join(",")),
  }));
  return createHash("sha256").update(JSON.stringify({ fileType: dataset.fileType, structure })).digest("hex");
}
