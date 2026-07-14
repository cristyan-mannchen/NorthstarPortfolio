import * as XLSX from "xlsx";
import type { FileInspectionResult, InvestmentFileParser, ParseOptions, ParsedCell, ParsedDataset, UploadedInvestmentFile } from "../types";
import { IMPORT_LIMITS, assertSafeUpload, sanitizeCellValue } from "../security";

function workbookType(bytes: Uint8Array): "xlsx" | "xls" | null {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return "xlsx";
  if ([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1].every((value, index) => bytes[index] === value)) return "xls";
  return null;
}
function primitive(cell: XLSX.CellObject | undefined): ParsedCell["inferredPrimitiveType"] {
  if (!cell || cell.v == null || cell.v === "") return "empty";
  if (cell.t === "n") return "number";
  if (cell.t === "d") return "date";
  if (cell.t === "b") return "boolean";
  return "string";
}

export class ExcelWorkbookParser implements InvestmentFileParser {
  parserId = "excel-workbook-v1";
  async supports(file: UploadedInvestmentFile) { return workbookType(file.bytes) !== null; }
  private read(file: UploadedInvestmentFile) {
    assertSafeUpload(file);
    return XLSX.read(file.bytes, { type: "array", cellDates: true, cellFormula: true, cellHTML: false, cellNF: false, bookVBA: false, WTF: false });
  }
  async inspect(file: UploadedInvestmentFile): Promise<FileInspectionResult> {
    const type = workbookType(file.bytes);
    if (!type) return { parserId: this.parserId, detectedFileType: "unknown", safe: false, warnings: [{ code: "INVALID_WORKBOOK_SIGNATURE", message: "The file does not have a supported Excel signature." }], worksheetNames: [] };
    let workbook: XLSX.WorkBook;
    try { workbook = this.read(file); } catch { return { parserId: this.parserId, detectedFileType: type, safe: false, warnings: [{ code: "MALFORMED_OR_ENCRYPTED_WORKBOOK", message: "The workbook is malformed, encrypted, or password protected." }], worksheetNames: [] }; }
    return { parserId: this.parserId, detectedFileType: type, safe: true, warnings: [], worksheetNames: workbook.SheetNames };
  }
  async parse(file: UploadedInvestmentFile, options: ParseOptions = {}): Promise<ParsedDataset> {
    const inspection = await this.inspect(file);
    if (!inspection.safe || !["xlsx", "xls"].includes(inspection.detectedFileType)) throw new Error(inspection.warnings[0]?.message ?? "Unsupported workbook.");
    const workbook = this.read(file);
    const warnings = [...inspection.warnings];
    const worksheets = workbook.SheetNames.flatMap((name, sheetIndex) => {
      const hidden = Boolean(workbook.Workbook?.Sheets?.[sheetIndex]?.Hidden);
      if (hidden && !options.includeHiddenWorksheets) { warnings.push({ code: "HIDDEN_WORKSHEET_SKIPPED", message: `Hidden worksheet “${name}” was not analyzed.`, worksheet: name }); return []; }
      const sheet = workbook.Sheets[name];
      const range = sheet["!ref"] ? XLSX.utils.decode_range(sheet["!ref"]) : null;
      if (!range) return [{ name, hidden, rows: [], confidence: 0 }];
      const rowCount = range.e.r - range.s.r + 1;
      if (rowCount > (options.maxRows ?? IMPORT_LIMITS.maxRows)) throw new Error(`Worksheet “${name}” exceeds the row limit.`);
      if (range.e.c - range.s.c + 1 > IMPORT_LIMITS.maxColumns) throw new Error(`Worksheet “${name}” exceeds the column limit.`);
      const rows = Array.from({ length: rowCount }, (_, rowOffset) => {
        const sourceRowNumber = range.s.r + rowOffset + 1;
        const cells = Array.from({ length: range.e.c - range.s.c + 1 }, (_, columnOffset) => {
          const cell = sheet[XLSX.utils.encode_cell({ r: range.s.r + rowOffset, c: range.s.c + columnOffset })] as XLSX.CellObject | undefined;
          if (cell?.f) warnings.push({ code: "FORMULA_CELL_CACHED_VALUE", message: "A formula was not executed; only its cached value was read.", worksheet: name, sourceRowNumber });
          const rawValue = sanitizeCellValue(cell?.v ?? null);
          return { rawValue, formattedValue: cell?.w ?? (rawValue == null ? "" : String(rawValue)), inferredPrimitiveType: primitive(cell) };
        });
        return { sourceRowNumber, cells };
      });
      return [{ name, hidden, rows, confidence: 1 }];
    });
    return { fileType: inspection.detectedFileType, worksheets, warnings };
  }
}
