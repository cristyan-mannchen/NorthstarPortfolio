import { NextResponse } from "next/server";
import { z } from "zod";
import { getLatestQuote } from "@/lib/prices";

const SymbolSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9.-]{1,15}$/);

export async function GET(_request: Request, context: { params: Promise<{ symbol: string }> }) {
  const parsed = SymbolSchema.safeParse((await context.params).symbol);
  if (!parsed.success) return NextResponse.json({ error: "Invalid symbol" }, { status: 400 });
  try {
    return NextResponse.json(await getLatestQuote(parsed.data), { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Price update failed" }, { status: 502 });
  }
}
