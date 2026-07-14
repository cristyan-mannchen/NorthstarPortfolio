import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(_request: Request, context: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await context.params;
  if (!z.string().uuid().safeParse(batchId).success) return NextResponse.json({ error: "Invalid import batch." }, { status: 400 });
  const db = await createSupabaseServerClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { data, error } = await db.rpc("confirm_import_batch", { p_batch_id: batchId });
  if (error) return NextResponse.json({ error: error.message }, { status: 409 });
  const batch = await db.from("import_batches").select("user_id,institution_name,file_type,file_signature,inference_schema,overall_confidence").eq("id", batchId).single();
  if (batch.data) {
    const mappings = Array.isArray(batch.data.inference_schema?.mappings) ? batch.data.inference_schema.mappings : [];
    const headerSignature = mappings.map((mapping: { sourceColumn?: string }) => mapping.sourceColumn ?? "").sort().join("|");
    await db.from("import_profiles").upsert({
      user_id: batch.data.user_id, institution_name: batch.data.institution_name, file_type: batch.data.file_type,
      file_signature: batch.data.file_signature, header_signature: headerSignature || batch.data.file_signature,
      column_mappings: mappings, confidence_history: [batch.data.overall_confidence], successful_imports: 1,
    }, { onConflict: "user_id,file_signature" });
  }
  return NextResponse.json(data);
}
