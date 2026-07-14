# Architecture

Northstar uses Next.js App Router, TypeScript, Supabase Auth/Postgres, and Vercel. Browser code receives only the publishable Supabase key. Server actions and protected route handlers verify the current user before accessing portfolios. Row Level Security is the final authorization boundary.

## Import pipeline

```text
upload → byte-signature detection → safe parser → generic dataset
       → structural inference → normalization → deterministic validation
       → instrument/duplicate resolution → staged review → atomic confirmation
       → transactions/positions/snapshot → adaptive profile
```

Format parsers stop at `ParsedDataset`. They cannot write transactions or positions. `lib/importer` contains format-neutral inference, normalization, validation, signatures, and profile matching. `/api/imports/analyze` stages an authenticated batch; `confirm_import_batch` performs the permanent write inside one Postgres transaction.

Vercel requests are limited to 60 seconds and uploads to 10 MB/20,000 rows. Larger imports should later be moved to a queue-backed worker without changing the normalized representation.
