import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(_request: Request, context: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await context.params;
  if (!z.string().uuid().safeParse(batchId).success) return NextResponse.json({ error: "Invalid import batch." }, { status: 400 });
  const db = await createSupabaseServerClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const batch = await db.from("import_batches").select("*").eq("id", batchId).eq("user_id", user.id).maybeSingle();
  if (!batch.data) return NextResponse.json({ error: "Import batch not found." }, { status: 404 });
  const rows = await db.from("import_rows").select("id,source_worksheet,source_row_number,raw_data,normalized_data,validation_errors,validation_warnings,mapping_confidence,transaction_type_confidence,instrument_match_confidence,duplicate_status,duplicate_explanation,resolution_status").eq("import_batch_id", batchId).order("source_row_number");
  if (rows.error) return NextResponse.json({ error: rows.error.message }, { status: 500 });
  return NextResponse.json({ batch: batch.data, rows: rows.data });
}
