import { redirect } from "next/navigation";
import ImportWorkspace from "@/components/importer/import-workspace";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function ImportsPage() {
  const db = await createSupabaseServerClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");
  const { data: portfolios, error } = await db.from("portfolios").select("id,name").eq("owner_id", user.id).order("created_at");
  if (error) throw new Error(error.message);
  return <ImportWorkspace portfolios={portfolios ?? []}/>;
}
