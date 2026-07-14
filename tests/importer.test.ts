import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { DelimitedTextParser, detectDelimiter } from "../lib/importer/parsers/delimited-text";
import { ExcelWorkbookParser } from "../lib/importer/parsers/excel-workbook";
import { analyzeStructure, inferColumn } from "../lib/importer/inference";
import { detectNumberFormat, normalizeRow, normalizeTransactionType, parseFinancialDate, parseFinancialNumber } from "../lib/importer/normalize";
import { assertSafeUpload, sanitizeCellValue, structuralSignature } from "../lib/importer/security";
import { validateRecord } from "../lib/importer/validation";
import { headerSimilarity, rebindMappings } from "../lib/importer/profiles";
import type { UploadedInvestmentFile } from "../lib/importer/types";

function textFile(text: string, filename = "activity.csv"): UploadedInvestmentFile {
  const bytes = new TextEncoder().encode(text);
  return { filename, mimeType: "text/csv", size: bytes.length, bytes };
}

test("detects common delimiters and preserves quoted delimiters", async () => {
  for (const delimiter of [",", ";", "\t", "|"]) {
    const text = `Report generated today\nSymbol${delimiter}Description${delimiter}Units${delimiter}Price\nRY${delimiter}"Royal${delimiter} Bank"${delimiter}10${delimiter}100.00\n`;
    assert.equal(detectDelimiter(text).delimiter, delimiter);
    const dataset = await new DelimitedTextParser().parse(textFile(text, delimiter === "\t" ? "activity.txt" : "activity.csv"));
    assert.equal(dataset.worksheets[0].rows[2].cells[1].rawValue, `Royal${delimiter} Bank`);
    assert.equal(dataset.worksheets[0].rows[2].sourceRowNumber, 3);
  }
});

test("supports UTF-8 BOM and decimal comma inference", async () => {
  const dataset = await new DelimitedTextParser().parse(textFile("\uFEFFSymbol;Units;Price\r\nRBF5380;10;1.234,56\r\n"));
  assert.equal(dataset.encoding, "utf-8-bom");
  assert.equal(detectNumberFormat(["1.234,56", "20,50"]).decimalSeparator, ",");
  assert.equal(parseFinancialNumber("1.234,56", ","), 1234.56);
  assert.equal(parseFinancialNumber(sanitizeCellValue("-1,234.56")), -1234.56);
});

test("detects a header after report metadata and classifies totals", async () => {
  const dataset = await new DelimitedTextParser().parse(textFile("Account,1234\nReport,Holdings\n\nTicker,Security Name,Units,Book Value,Currency\nRY,Royal Bank,10,1000,CAD\nTotal,,,1000,CAD\n"));
  const [analysis] = analyzeStructure(dataset);
  assert.equal(analysis.sheet.detectedHeaderRow, 4);
  assert.equal(analysis.schema.datasetType, "positions");
  assert.equal(analysis.sheet.rows.at(-1)?.rowType, "subtotal");
  assert.equal(analysis.schema.mappings.find((mapping) => mapping.sourceColumn === "units")?.targetField, "quantity");
});

test("reads XLSX worksheets while skipping hidden sheets and formula execution", async () => {
  const workbook = XLSX.utils.book_new();
  const holdings = XLSX.utils.aoa_to_sheet([["Ticker", "Units", "Book Value", "Currency"], ["VFV", 2, 250, "CAD"]]);
  holdings.B2 = { t: "n", f: "1+1", v: 2 };
  XLSX.utils.book_append_sheet(workbook, holdings, "Holdings");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["private"]]), "Hidden metadata");
  workbook.Workbook = { Sheets: [{ Hidden: 0 }, { Hidden: 1 }] };
  const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const file = { filename: "holdings.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", size: bytes.length, bytes: new Uint8Array(bytes) };
  const dataset = await new ExcelWorkbookParser().parse(file);
  assert.deepEqual(dataset.worksheets.map((sheet) => sheet.name), ["Holdings"]);
  assert.ok(dataset.warnings.some((warning) => warning.code === "HIDDEN_WORKSHEET_SKIPPED"));
  assert.ok(dataset.warnings.some((warning) => warning.code === "FORMULA_CELL_CACHED_VALUE"));
});

test("normalizes aliases, holdings, dates, and derived average cost", async () => {
  assert.equal(inferColumn("Number of Units")?.targetField, "quantity");
  assert.equal(normalizeTransactionType("Reinvested Dividend").type, "reinvested_distribution");
  assert.equal(parseFinancialDate("03/04/2026").ambiguous, true);
  assert.equal(parseFinancialDate("13/04/2026").value, "2026-04-13");
  const dataset = await new DelimitedTextParser().parse(textFile("Ticker,Security Name,Units,Book Value,Currency,Date\nRY,Royal Bank,10,1000,CAD,2026-07-13\n"));
  const [analysis] = analyzeStructure(dataset);
  const record = normalizeRow(analysis.sheet.rows[1], analysis.schema.mappings, "positions", analysis.sheet.name);
  assert.equal(record.transactionType, "opening_position");
  assert.equal(record.unitPrice, 100);
  assert.ok(record.tradeDate);
  assert.deepEqual(record.derivedFields, ["unit_price_from_book_value"]);
});

test("validates reconciliation and required fields deterministically", () => {
  const record = validateRecord({ sourceWorksheet: "Data", sourceRowNumber: 2, datasetType: "transactions", importMode: "historical_transaction", symbol: "RY", transactionType: "buy", tradeDate: "2026-07-13", quantity: 10, unitPrice: 100, grossAmount: 900, currency: "CAD", derivedFields: [], rawData: {} }, 0.95, "portfolio");
  assert.ok(record.validationWarnings.some((warning) => warning.includes("reconcile")));
  assert.equal(record.validationErrors.length, 0);
  const invalid = validateRecord({ sourceWorksheet: "Data", sourceRowNumber: 3, datasetType: "transactions", importMode: "historical_transaction", transactionType: "buy", derivedFields: [], rawData: {} }, 0.8);
  assert.ok(invalid.validationErrors.length >= 3);
});

test("applies upload and formula-injection safety controls", () => {
  assert.equal(sanitizeCellValue("=HYPERLINK(\"https://evil\")"), "'=HYPERLINK(\"https://evil\")");
  assert.throws(() => assertSafeUpload({ filename: "macro.xlsm", mimeType: "", size: 1, bytes: new Uint8Array([1]) }), /Macro-enabled/);
  assert.throws(() => assertSafeUpload({ filename: "huge.csv", mimeType: "", size: 11 * 1024 * 1024, bytes: new Uint8Array([1]) }), /10 MB/);
});

test("structural signatures exclude confidential values", async () => {
  const parser = new DelimitedTextParser();
  const first = await parser.parse(textFile("Symbol,Units\nRY,10\n"));
  const second = await parser.parse(textFile("Symbol,Units\nAAPL,9999\n"));
  assert.equal(structuralSignature(first), structuralSignature(second));
});

test("adaptive profiles survive column reordering and optional columns", () => {
  assert.ok(headerSimilarity(["Symbol", "Units", "Price"], ["price", "Symbol", "Units", "Notes"]) >= 0.75);
  const rebound = rebindMappings([{ sourceColumnIndex: 0, sourceColumn: "Symbol", targetField: "symbol", confidence: .9, reasoningCode: "EXACT_ALIAS" }], ["Units", "Symbol"]);
  assert.equal(rebound[0].sourceColumnIndex, 1);
  assert.equal(rebound[0].reasoningCode, "ADAPTIVE_PROFILE");
});
