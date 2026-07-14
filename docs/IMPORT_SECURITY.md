# Import Security

Uploaded files are untrusted. Northstar:

- checks byte signatures instead of trusting extensions alone;
- enforces 10 MB, 20,000-row, 100-column, and 10,000-character cell limits;
- rejects macro-enabled filenames and malformed/encrypted workbooks;
- never executes formulas, macros, scripts, objects, links, or external connections;
- reads only stored workbook cell values;
- prefixes formula-like text (`=`, `+`, `-`, `@`) to prevent spreadsheet injection;
- masks long account-number patterns during institution inference;
- does not retain the original uploaded file;
- stores staged rows behind RLS for 30 days, then deletes them automatically;
- never exposes the Supabase service credential to browser code;
- verifies portfolio ownership before parsing and again during confirmation.

Structural signatures contain file type, normalized sheet names, column counts, and primitive-type patterns—not raw balances, account numbers, or transactions.
