# API

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
