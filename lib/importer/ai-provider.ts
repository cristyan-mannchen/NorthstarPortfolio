import { z } from "zod";
import { NORMALIZED_FIELDS } from "./types";

const transactionTypes = ["buy", "sell", "distribution", "dividend", "interest", "reinvested_distribution", "fee", "tax", "deposit", "withdrawal", "transfer_in", "transfer_out", "return_of_capital", "split", "opening_position", "other"] as const;

export const aiInferenceResultSchema = z.object({
  datasetType: z.enum(["transactions", "positions", "income", "account_summary", "mixed", "unknown"]),
  headerRow: z.number().int().positive(), dataStartRow: z.number().int().positive(),
  mappings: z.array(z.object({ sourceColumn: z.string(), targetField: z.enum(NORMALIZED_FIELDS), confidence: z.number().min(0).max(1), reasoningCode: z.string() })),
  transactionTypeRules: z.array(z.object({ sourceTerms: z.array(z.string()), normalizedType: z.enum(transactionTypes), confidence: z.number().min(0).max(1) })),
  warnings: z.array(z.string()), overallConfidence: z.number().min(0).max(1),
});
export type AiInferenceResult = z.infer<typeof aiInferenceResultSchema>;
export type ImportInferenceRequest = { worksheetNames: string[]; maskedHeaders: string[][]; representativeRows: unknown[][]; valueTypeSummaries: string[][] };
export interface ImportInferenceProvider { inferSchema(request: ImportInferenceRequest): Promise<AiInferenceResult> }

const outputJsonSchema = {
  type: "object", additionalProperties: false,
  properties: {
    datasetType: { type: "string", enum: ["transactions", "positions", "income", "account_summary", "mixed", "unknown"] },
    headerRow: { type: "integer", minimum: 1 }, dataStartRow: { type: "integer", minimum: 1 },
    mappings: { type: "array", items: { type: "object", additionalProperties: false, properties: {
      sourceColumn: { type: "string" }, targetField: { type: "string", enum: [...NORMALIZED_FIELDS] }, confidence: { type: "number", minimum: 0, maximum: 1 }, reasoningCode: { type: "string" },
    }, required: ["sourceColumn", "targetField", "confidence", "reasoningCode"] } },
    transactionTypeRules: { type: "array", items: { type: "object", additionalProperties: false, properties: {
      sourceTerms: { type: "array", items: { type: "string" } }, normalizedType: { type: "string", enum: [...transactionTypes] }, confidence: { type: "number", minimum: 0, maximum: 1 },
    }, required: ["sourceTerms", "normalizedType", "confidence"] } },
    warnings: { type: "array", items: { type: "string" } }, overallConfidence: { type: "number", minimum: 0, maximum: 1 },
  },
  required: ["datasetType", "headerRow", "dataStartRow", "mappings", "transactionTypeRules", "warnings", "overallConfidence"],
} as const;

export class GroqInferenceProvider implements ImportInferenceProvider {
  constructor(private apiKey: string, private model = "openai/gpt-oss-20b") {}
  async inferSchema(request: ImportInferenceRequest): Promise<AiInferenceResult> {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST", signal: AbortSignal.timeout(12_000),
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: this.model, temperature: 0, store: false,
        messages: [
          { role: "system", content: `You map investment files into a portfolio ledger. Infer columns conservatively. Never invent columns. Settlement date is the effective date when present. Identify source transaction labels and map their meanings. Northstar ultimately imports only buy and dividend rows. Return only schema-constrained JSON.` },
          { role: "user", content: JSON.stringify(request) },
        ],
        response_format: { type: "json_schema", json_schema: { name: "investment_import_schema", strict: true, schema: outputJsonSchema } },
      }),
    });
    if (!response.ok) throw new Error(`Groq inference failed (${response.status}).`);
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("Groq inference returned no schema.");
    return aiInferenceResultSchema.parse(JSON.parse(content));
  }
}

export class DeterministicOnlyInferenceProvider implements ImportInferenceProvider {
  async inferSchema(): Promise<AiInferenceResult> { throw new Error("AI inference is not configured; deterministic analysis will be used."); }
}
export function configuredInferenceProvider(): ImportInferenceProvider | null {
  const key = process.env.GROQ_API_KEY?.trim();
  return key ? new GroqInferenceProvider(key, process.env.GROQ_MODEL?.trim() || undefined) : null;
}
export async function validateAiInference(provider: ImportInferenceProvider, request: ImportInferenceRequest) {
  return aiInferenceResultSchema.parse(await provider.inferSchema(request));
}
