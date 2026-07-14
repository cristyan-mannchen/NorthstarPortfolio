import type { SupabaseClient } from "@supabase/supabase-js";
import type { ColumnMapping, ParsedWorksheet } from "./types";

const normalized = (value: string) => value.trim().toLowerCase().replace(/[_\-\s]+/g, " ");
export function headerSimilarity(left: string[], right: string[]) {
  const a = new Set(left.map(normalized).filter(Boolean)), b = new Set(right.map(normalized).filter(Boolean));
  if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((value) => b.has(value)).length;
  return intersection / (a.size + b.size - intersection);
}
export function rebindMappings(mappings: ColumnMapping[], currentHeaders: string[]) {
  const lookup = new Map(currentHeaders.map((header, index) => [normalized(header), index]));
  return mappings.flatMap((mapping) => {
    const index = lookup.get(normalized(mapping.sourceColumn));
    return index == null ? [] : [{ ...mapping, sourceColumnIndex: index, confidence: Math.min(1, mapping.confidence + 0.03), reasoningCode: "ADAPTIVE_PROFILE" }];
  });
}
export async function findImportProfile(db: SupabaseClient, fileSignature: string, fileType: string, headers: string[]) {
  const exact = await db.from("import_profiles").select("id,file_signature,header_signature,column_mappings,date_format,decimal_format,currency_default").eq("file_signature", fileSignature).maybeSingle();
  if (exact.data) return { profile: exact.data, similarity: 1 };
  const candidates = await db.from("import_profiles").select("id,file_signature,header_signature,column_mappings,date_format,decimal_format,currency_default").eq("file_type", fileType).limit(20);
  if (candidates.error) return null;
  const best = (candidates.data ?? []).map((profile) => ({ profile, similarity: headerSimilarity(headers, String(profile.header_signature).split("|")) })).sort((a, b) => b.similarity - a.similarity)[0];
  return best && best.similarity >= 0.75 ? best : null;
}
export function worksheetHeaders(sheet: ParsedWorksheet, headerRow: number) {
  return sheet.rows.find((row) => row.sourceRowNumber === headerRow)?.cells.map((cell) => String(cell.formattedValue ?? cell.rawValue ?? "")) ?? [];
}
