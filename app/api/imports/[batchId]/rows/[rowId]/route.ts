import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const patchSchema = z.object({ resolutionStatus: z.enum(["resolved", "rejected"]) });
export async function PATCH(request: Request, context: { params: Promise<{ batchId: string; rowId: string }> }) {
  const { batchId, rowId } = await context.params;
  const ids = z.object({ batchId: z.string().uuid(), rowId: z.coerce.number().int().positive() }).safeParse({ batchId, rowId });
  const body = patchSchema.safeParse(await request.json().catch(() => null));
  if (!ids.success || !body.success) return NextResponse.json({ error: "Invalid row update." }, { status: 400 });
  const db = await createSupabaseServerClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const batch = await db.from("import_batches").select("id").eq("id", ids.data.batchId).eq("user_id", user.id).maybeSingle();
  if (!batch.data) return NextResponse.json({ error: "Import batch not found." }, { status: 404 });
  const updated = await db.from("import_rows").update({ resolution_status: body.data.resolutionStatus }).eq("id", ids.data.rowId).eq("import_batch_id", ids.data.batchId).select("id").maybeSingle();
  if (updated.error || !updated.data) return NextResponse.json({ error: updated.error?.message ?? "Import row not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
