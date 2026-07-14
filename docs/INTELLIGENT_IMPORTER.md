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

Confirmation is atomic and idempotent. Re-uploading the identical file returns the existing batch; repeated confirmation returns the completed result.

## Confidence

- `0.90–1.00`: high confidence; ready when every row validates.
- `0.70–0.89`: review recommended.
- below `0.70`: manual resolution required.

Thresholds are exported as `CONFIDENCE_THRESHOLDS` in `lib/importer/types.ts`.

## Current limits

Uploads are 10 MB and 20,000 rows. Ambiguous dates are rejected rather than guessed. The first release can skip invalid rows but does not yet offer every possible inline mapping correction. PDF/OFX/QFX and queue-backed processing remain extension points.
