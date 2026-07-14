# API

## Intelligent imports

- `POST /api/imports/analyze` — authenticated multipart request with `portfolioId` and `file`; safely parses and stages a batch.
- `GET /api/imports/:batchId` — returns the authenticated owner’s batch and normalized review rows.
- `PATCH /api/imports/:batchId/rows/:rowId` — resolves or rejects a staged row.
- `POST /api/imports/:batchId/confirm` — calls the atomic, idempotent database confirmation function.

Uploads are limited to 10 MB. Unsupported, malformed, encrypted, low-confidence, and unauthorized requests return actionable JSON errors.

## `GET /api/prices/:symbol`

Returns the latest validated quote from the configured provider. RBC fund codes
(`RBF` followed by digits) use the official RBC GAM public fund page. Responses
are cached at the edge for 15 minutes. Invalid symbols return `400`; upstream
failures return `502` and do not overwrite known-good prices.

## `GET /api/cron/update-prices`

Daily Vercel Cron endpoint. Requires `Authorization: Bearer $CRON_SECRET`. It
loads active instruments, retries provider requests with exponential backoff,
upserts price history, and records a `job_runs` audit row. A partial provider
failure does not prevent other instruments from updating.

The route can be tested locally with:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/update-prices
```
