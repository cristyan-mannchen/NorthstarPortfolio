import type { InvestmentFileParser, ParsedDataset, UploadedInvestmentFile } from "../types";
import { DelimitedTextParser } from "./delimited-text";
import { ExcelWorkbookParser } from "./excel-workbook";

export const investmentFileParsers: InvestmentFileParser[] = [new ExcelWorkbookParser(), new DelimitedTextParser()];

export async function selectParser(file: UploadedInvestmentFile) {
  for (const parser of investmentFileParsers) if (await parser.supports(file)) return parser;
  throw new Error("Unsupported file. Upload a CSV, TXT, XLSX, or XLS file.");
}
export async function parseInvestmentFile(file: UploadedInvestmentFile): Promise<ParsedDataset> {
  const parser = await selectParser(file);
  return parser.parse(file);
}
