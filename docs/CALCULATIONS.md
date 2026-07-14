# Calculations

Imported opening positions, buys, inbound transfers, and reinvested distributions increase units. Their average cost uses a weighted average. Sales and outbound transfers reduce units without allowing a negative holding.

When a holdings report provides quantity and book value but no unit price, Northstar derives `unit price = book value ÷ quantity` only for a non-zero quantity and records `unit_price_from_book_value` in transaction metadata.

Deterministic reconciliation uses a tolerance of the larger of 0.02 currency units or 0.5%:

- `quantity × unit price ≈ gross amount`
- `gross amount − fees − taxes ≈ net amount`

After confirmation, a portfolio snapshot stores current market value and book value. Currency conversion is not yet performed; mixed-currency totals require the future FX service.
