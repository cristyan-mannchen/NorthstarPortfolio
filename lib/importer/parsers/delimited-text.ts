import type { FileInspectionResult, InvestmentFileParser, ParsedCell, ParsedDataset, ParsedRow, UploadedInvestmentFile } from "../types";
import { IMPORT_LIMITS, assertSafeUpload, sanitizeCellValue } from "../security";

const CANDIDATES = [",", ";", "\t", "|"] as const;

function decode(bytes: Uint8Array) {
  const encoding = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? "utf-8-bom" : "utf-8";
  return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, ""), encoding };
}

type TextRecord = { values: string[]; sourceRowNumber: number };
function parseRecords(text: string, delimiter: string, limit: number = IMPORT_LIMITS.maxRows): TextRecord[] {
  const records: TextRecord[] = [];
  let record: string[] = [], field = "", quoted = false, lineNumber = 1, recordStartLine = 1;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) { record.push(field); field = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      record.push(field); field = "";
      if (record.some((value) => value.trim() !== "")) records.push({ values: record, sourceRowNumber: recordStartLine });
      record = [];
      lineNumber += 1; recordStartLine = lineNumber;
      if (records.length > limit) throw new Error(`The file exceeds the ${limit.toLocaleString()} row limit.`);
    } else field += char;
  }
  if (quoted) throw new Error("The delimited file contains an unterminated quoted field.");
  record.push(field);
  if (record.some((value) => value.trim() !== "")) records.push({ values: record, sourceRowNumber: recordStartLine });
  return records;
}

function scoreDelimiter(text: string, delimiter: string) {
  try {
    const rows = parseRecords(text.slice(0, 100_000), delimiter, 200);
    const widths = rows.slice(0, 30).map((row) => row.values.length).filter((width) => width > 1);
    if (widths.length < 2) return 0;
    const counts = new Map<number, number>();
    widths.forEach((width) => counts.set(width, (counts.get(width) ?? 0) + 1));
    const consistency = Math.max(...counts.values()) / widths.length;
    return consistency * Math.min(Math.max(...widths) / 10, 1);
  } catch { return 0; }
}

export function detectDelimiter(text: string) {
  return CANDIDATES.map((delimiter) => ({ delimiter, score: scoreDelimiter(text, delimiter) })).sort((a, b) => b.score - a.score)[0];
}

function inferPrimitive(value: string): ParsedCell["inferredPrimitiveType"] {
  const trimmed = value.trim();
  if (!trimmed) return "empty";
  if (/^(true|false|yes|no)$/i.test(trimmed)) return "boolean";
  if (/^[($€£]?[-+]?\d[\d.,\s]*\)?%?$/.test(trimmed)) return "number";
  if (/^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})$/.test(trimmed)) return "date";
  return "string";
}

export class DelimitedTextParser implements InvestmentFileParser {
  parserId = "delimited-text-v1";
  async supports(file: UploadedInvestmentFile) {
    if (file.bytes.slice(0, 8).some((byte) => byte === 0)) return false;
    try { const { text } = decode(file.bytes); return detectDelimiter(text).score >= 0.2; } catch { return false; }
  }
  async inspect(file: UploadedInvestmentFile): Promise<FileInspectionResult> {
    assertSafeUpload(file);
    const { text } = decode(file.bytes);
    const detected = detectDelimiter(text);
    return { parserId: this.parserId, detectedFileType: file.filename.toLowerCase().endsWith(".txt") ? "txt" : "csv", safe: detected.score >= 0.2, warnings: detected.score < 0.65 ? [{ code: "LOW_DELIMITER_CONFIDENCE", message: "The delimiter could not be determined with high confidence." }] : [], worksheetNames: ["Imported data"] };
  }
  async parse(file: UploadedInvestmentFile): Promise<ParsedDataset> {
    const inspection = await this.inspect(file);
    if (!inspection.safe) throw new Error("The text file structure could not be detected safely.");
    const { text, encoding } = decode(file.bytes);
    const detected = detectDelimiter(text);
    const records = parseRecords(text, detected.delimiter);
    const rows: ParsedRow[] = records.map((record) => {
      if (record.values.length > IMPORT_LIMITS.maxColumns) throw new Error(`Row ${record.sourceRowNumber} exceeds the ${IMPORT_LIMITS.maxColumns} column limit.`);
      return { sourceRowNumber: record.sourceRowNumber, cells: record.values.map((raw) => ({ rawValue: sanitizeCellValue(raw), formattedValue: raw, inferredPrimitiveType: inferPrimitive(raw) })) };
    });
    return { fileType: inspection.detectedFileType, encoding, delimiter: detected.delimiter, worksheets: [{ name: "Imported data", rows, confidence: detected.score }], warnings: inspection.warnings };
  }
}
