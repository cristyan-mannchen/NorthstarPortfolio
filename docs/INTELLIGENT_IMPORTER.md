# Intelligent Investment Importer

## Supported files

CSV and TXT support comma, semicolon, tab, and pipe delimiters, quotes, UTF-8/BOM, CRLF/LF, and decimal comma. XLSX and legacy XLS support multiple sheets, typed numbers/dates, cached formula values, and hidden-sheet detection. Macro-enabled workbooks, encrypted workbooks, PDFs, OFX, and QFX are not accepted.

## User flow

1. Open **Import file** from the portfolio dashboard.
2. Select a portfolio and file.
3. Northstar analyzes the file and stages normalized records.
4. Review institution, dataset type, confidence, warnings, invalid rows, and duplicates.
5. Skip invalid rows or correct the source file and upload again.
6. Confirm once all remaining rows pass validation.

Confirmation is atomic and idempotent. Re-uploading an identical, completed file returns the existing batch; an unfinished batch is reanalyzed so importer improvements can replace stale staged results. Repeated confirmation returns the completed result.

For transaction exports, Northstar stages only `buy` and `dividend` activities. When both a trade date and settlement date are supplied, the settlement date is the effective performance date. RBC-style dates such as `02-Jul-26` are supported.

## Confidence

- `0.90–1.00`: high confidence; ready when every row validates.
- `0.70–0.89`: review recommended.
- below `0.70`: manual resolution required.

Thresholds are exported as `CONFIDENCE_THRESHOLDS` in `lib/importer/types.ts`.

## Optional AI assistance

Set `GROQ_API_KEY` in the server environment to enable schema and transaction-vocabulary inference for unfamiliar layouts. The free-tier integration sends masked structural samples only, uses strict structured output, and remains advisory. Northstar continues to work without AI and always applies deterministic validation before a row can be confirmed.

## Current limits

Uploads are 10 MB and 20,000 rows. Ambiguous dates are rejected rather than guessed. The first release can skip invalid rows but does not yet offer every possible inline mapping correction. PDF/OFX/QFX and queue-backed processing remain extension points.
