# Multi-provider, top-up and customer UI upgrades

## Customer top-ups and payment gateways

- The customer top-up screen loads enabled methods and currencies from the database.
- Telegram Stars keeps its existing Telegram invoice and successful-payment confirmation flow.
- Manual methods create pending requests; a request does not credit a wallet until an owner approves it.
- Khalti (NPR), eSewa ePay V2 (NPR) and Paytm PG (INR) have server-side checkout and verification adapters. UPI is available through Paytm PG only when enabled on the merchant account.
- Return URLs are never trusted alone. The Worker verifies the payment through the provider's lookup/status API and checks the reference, amount and currency before crediting.
- Customer and admin payment history, gateway audit events, scheduled reconciliation, stale-request expiry and duplicate-credit protection are included.
- Merchant secrets are Worker environment secrets and are never stored in D1 or sent to the customer app. Configure test credentials and pass sandbox tests before enabling a method.
- bKash, Binance Pay and generic crypto remain disabled/unintegrated; bank transfer and other manual methods still use owner verification.

## Cheapest-provider routing

When a customer orders an imported provider service, the order router searches enabled and present providers for the same platform, category, original service name and service type. It submits the order to the lowest-cost matching provider. The storefront's displayed selling price is retained; provider selection changes fulfillment cost, not the customer's quoted price. If no equivalent service is found, the selected service's provider is used.

## Provider price synchronization and health

- Enabled providers are checked automatically by the Worker scheduler.
- Each provider is refreshed no more often than every six hours; at most two providers are processed in one scheduled run.
- Imported service rates, minimums, maximums, refill/cancel/drip-feed capabilities and update timestamps are refreshed from the provider's `services` API response.
- Provider health records include last success, latency, consecutive failures and the last error; Admin → Providers displays this status.
- Repeated provider failures and payment reconciliation errors send rate-limited admin alerts.
- The customer catalogue summary and version are refreshed after imported services or provider prices change.
- A failed provider refresh is logged and backed off; existing service prices are retained.

## Customer UI refresh

The shared customer design system has been refreshed across the existing customer screens with a calmer blue palette, clearer spacing, softer surfaces, consistent focus states, and updated cards/navigation. Existing screen workflows and Telegram navigation are preserved. The top-up screen includes currency and payment-method selection, secure gateway checkout, payment instructions and manual-payment reference entry.

## Deployment

Migrations `0019_manual_topups_provider_sync.sql` and `0020_payment_gateways_reliability.sql` are included. The Worker applies unapplied migrations automatically on its first request/cron run; they can also be applied through the existing Wrangler migration command. See `PAYMENT_GATEWAYS.md` for secret configuration and test/live setup. Use Node 24 before running `npm ci`, `npm run typecheck`, `npm test` and `npm run build`.
