import { z } from "zod";

export const aiInferenceResultSchema = z.object({
  datasetType: z.enum(["transactions", "positions", "income", "account_summary", "mixed", "unknown"]),
  headerRow: z.number().int().positive(), dataStartRow: z.number().int().positive(),
  mappings: z.array(z.object({ sourceColumn: z.string(), targetField: z.string(), confidence: z.number().min(0).max(1), reasoningCode: z.string() })),
  warnings: z.array(z.string()), overallConfidence: z.number().min(0).max(1),
});
export type ImportInferenceRequest = { worksheetNames: string[]; maskedHeaders: string[][]; representativeRows: unknown[][]; valueTypeSummaries: string[][] };
export interface ImportInferenceProvider { inferSchema(request: ImportInferenceRequest): Promise<z.infer<typeof aiInferenceResultSchema>> }
export class DeterministicOnlyInferenceProvider implements ImportInferenceProvider {
  async inferSchema(): Promise<z.infer<typeof aiInferenceResultSchema>> { throw new Error("AI inference is not configured; manual review is required."); }
}
export async function validateAiInference(provider: ImportInferenceProvider, request: ImportInferenceRequest) {
  return aiInferenceResultSchema.parse(await provider.inferSchema(request));
}
