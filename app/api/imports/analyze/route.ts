import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeParsedDataset } from "@/lib/importer/analyze";
import { parseInvestmentFile } from "@/lib/importer/parsers";
import { IMPORT_LIMITS, assertSafeUpload, fileHash } from "@/lib/importer/security";
import { confidenceBand, type UploadedInvestmentFile } from "@/lib/importer/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const maxDuration = 60;
const requestSchema = z.object({ portfolioId: z.string().uuid() });

export async function POST(request: Request) {
  const db = await createSupabaseServerClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    const form = await request.formData();
    const parsed = requestSchema.safeParse({ portfolioId: form.get("portfolioId") });
    const upload = form.get("file");
    if (!parsed.success || !(upload instanceof File)) return NextResponse.json({ error: "Choose a portfolio and a file." }, { status: 400 });
    const portfolio = await db.from("portfolios").select("id").eq("id", parsed.data.portfolioId).eq("owner_id", user.id).maybeSingle();
    if (!portfolio.data) return NextResponse.json({ error: "Portfolio not found." }, { status: 404 });
    if (upload.size > IMPORT_LIMITS.maxFileBytes) return NextResponse.json({ error: "The file exceeds the 10 MB import limit." }, { status: 413 });
    const bytes = new Uint8Array(await upload.arrayBuffer());
    const file: UploadedInvestmentFile = { filename: upload.name, mimeType: upload.type, size: upload.size, bytes };
    assertSafeUpload(file);
    const hash = fileHash(bytes);
    const existing = await db.from("import_batches").select("id,status").eq("user_id", user.id).eq("portfolio_id", portfolio.data.id).eq("file_hash", hash).maybeSingle();
    if (existing.data && ["completed", "completed_with_warnings"].includes(existing.data.status)) {
      return NextResponse.json({ batchId: existing.data.id, status: existing.data.status, repeatedUpload: true });
    }
    // A repeated, unfinished upload is analyzed again so parser improvements do
    // not strand the user on stale staged rows. Cascading deletes remove only
    // this user's unconfirmed review data; completed imports remain idempotent.
    if (existing.data) {
      const removed = await db.from("import_batches").delete().eq("id", existing.data.id);
      if (removed.error) throw new Error(`Unable to refresh the previous analysis: ${removed.error.message}`);
    }

    const dataset = await parseInvestmentFile(file);
    const analysis = await analyzeParsedDataset(dataset, upload.name, portfolio.data.id, db);
    const status = analysis.counts.invalidRows > 0 || confidenceBand(analysis.overallConfidence) !== "high" ? "awaiting_review" : "ready";
    const batch = await db.from("import_batches").insert({
      user_id: user.id, portfolio_id: portfolio.data.id, filename: upload.name.slice(0, 255), file_type: dataset.fileType,
      file_size_bytes: upload.size, file_hash: hash, file_signature: analysis.fileSignature,
      institution_name: analysis.institution.name, institution_confidence: analysis.institution.confidence,
      dataset_type: analysis.selected.schema.datasetType, overall_confidence: analysis.overallConfidence, status,
      total_rows: analysis.counts.totalRows, valid_rows: analysis.counts.validRows, warning_rows: analysis.counts.warningRows,
      invalid_rows: analysis.counts.invalidRows, duplicate_rows: analysis.counts.duplicateRows,
      inference_schema: analysis.selected.schema,
      warnings: [...dataset.warnings, ...analysis.selected.schema.warnings], analyzed_at: new Date().toISOString(),
    }).select("id").single();
    if (batch.error) throw new Error(`Unable to create import batch: ${batch.error.message}`);
    if (analysis.records.length) {
      const insertedRows = await db.from("import_rows").insert(analysis.records.map((record) => ({
        import_batch_id: batch.data.id, source_worksheet: record.sourceWorksheet, source_row_number: record.sourceRowNumber,
        raw_data: record.rawData, normalized_data: { ...record, rawData: undefined },
        validation_errors: record.validationErrors, validation_warnings: record.validationWarnings,
        mapping_confidence: analysis.selected.schema.overallConfidence,
        transaction_type_confidence: record.transactionType === "other" ? 0.35 : 0.95,
        instrument_match_confidence: record.instrumentMatchConfidence, duplicate_status: record.duplicateStatus,
        duplicate_explanation: record.duplicateExplanation, resolution_status: record.validationErrors.length ? "pending" : "resolved",
        source_row_fingerprint: record.sourceRowFingerprint,
      })));
      if (insertedRows.error) { await db.from("import_batches").delete().eq("id", batch.data.id); throw new Error(`Unable to stage import rows: ${insertedRows.error.message}`); }
    }
    return NextResponse.json({ batchId: batch.data.id, status, confidence: analysis.overallConfidence, counts: analysis.counts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The file could not be analyzed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
