# Northstar Portfolio Tracker

Production-oriented investment tracking for Canadian mutual funds, ETFs, and stocks. Northstar stores positions and daily price history, calculates portfolio performance, and runs a protected daily updater with zero routine maintenance.

## Architecture

- **Web:** Next.js App Router, React, strict TypeScript, Tailwind CSS
- **API:** Next.js route handlers with Zod input validation
- **Data and auth:** Supabase Postgres, Row Level Security, Supabase Auth
- **Jobs:** Vercel Cron calls a secret-protected, idempotent update route
- **Prices:** provider interface; RBC funds use official public RBC GAM pages
- **Deployment:** GitHub-connected Vercel project deploys every `main` push

The responsive UI includes light/dark themes, summary metrics, portfolio history, allocation, performance highlights, holdings, time ranges, and an add-investment workflow.

## Local setup

1. Install Node.js 22 and clone the repository.
2. Copy `.env.example` to `.env.local`.
3. Create a Supabase project and run `supabase/migrations/202607130001_initial_schema.sql` in its SQL editor.
4. Add the Supabase URL, anon key, service role key, and a random cron secret.
5. Install and run:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deployment

1. Push this repository to GitHub with `main` as the production branch.
2. Import it into Vercel and select the Next.js framework preset.
3. Add every variable from `.env.example` in Vercel project settings. Keep `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` server-only.
4. Deploy. Vercel automatically builds every GitHub push; production deploys follow `main`. `vercel.json` schedules weekday updates at 23:17 UTC, after North American market close.

Vercel Hobby cron timing can be approximate. The updater is idempotent and records every execution. Use job-log monitoring for operational alerts.

## Price reliability

RBC GAM is the authoritative provider for RBC mutual funds such as RBF5380. The adapter validates positive numeric NAVs, retries transient errors, fails closed, and never overwrites a known-good quote with an invalid value. The `PriceProvider` interface allows a licensed stock/ETF provider to be added without changing portfolio logic.

Scraping must comply with the source site's terms and rate limits. For a larger commercial installation, use a licensed Canadian market-data provider and retain RBC GAM as the mutual-fund source.

## Security

- Row Level Security isolates each user's portfolios and positions.
- The service-role key is used only by server code and never reaches the browser.
- Cron requests require a bearer secret.
- Inputs are validated and upstream responses are treated as untrusted.
- No brokerage credentials or trading permissions are requested or stored.

## Quality checks

```bash
npm run lint
npm test
npm run build
```

API details are in [`docs/API.md`](docs/API.md). The SQL migration is the canonical schema. For backups, use Supabase scheduled backups where available or a periodic encrypted `pg_dump` to private object storage.

## Roadmap

The schema and provider boundary are ready for multiple portfolios/users, additional currencies, stocks and ETFs, crypto, benchmarks, notifications, tax-lot reporting, mobile clients, and opt-in AI insights. Demo values are illustrative and are not investment advice.
