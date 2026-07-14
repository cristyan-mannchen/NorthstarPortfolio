# Import Inference

Deterministic inference runs first and remains functional without an AI provider.

1. Score possible delimiters and workbook sheets.
2. Score header candidates using string density, known financial aliases, and following numeric/date rows.
3. Classify repeated headers, subtotals, footers, blanks, and data.
4. Map fuzzy header aliases to normalized fields and use value types only as supporting evidence.
5. Detect transaction versus holdings data and normalize transaction vocabulary.
6. Infer decimal style from numeric distributions; reject ambiguous dates.
7. Resolve exact instruments and duplicates, then validate amounts.

Adaptive profiles are user-scoped. Header Jaccard similarity permits reordered columns and optional additions; profile mappings are rebound to current column indexes. Corrections are never shared globally.

`ImportInferenceProvider` is the vendor-neutral AI extension. Any provider receives only masked headers, representative samples, worksheet names, and type summaries. Its output must pass the Zod schema before use, and it can never bypass deterministic validation. No AI provider or environment variable is required in this release.
