# Database

The initial schema contains profiles, portfolios, instruments, positions, price history, snapshots, and job runs. Import migrations add:

- `transactions`: auditable financial activity and source fingerprints.
- `import_batches`: file metadata, safe hashes/signatures, confidence, counts, status, and expiry.
- `import_rows`: protected raw/normalized staged rows, validation, duplicate, and resolution status.
- `import_profiles`: user-scoped reusable structural mappings.

All user-owned tables have RLS. Import rows are reachable only through a batch owned by `auth.uid()`. `confirm_import_batch(uuid)` verifies ownership, locks the batch, imports eligible rows, updates holdings, creates a snapshot, and returns the previous result on repeated confirmation.

Raw staged rows cascade-delete with batches after the 30-day `expires_at` time. The scheduled price job removes expired batches.
