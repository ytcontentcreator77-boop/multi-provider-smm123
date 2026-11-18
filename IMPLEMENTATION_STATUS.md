# Implementation status

## Included

- Generic SMM provider add/edit/enable/disable, catalogue import and service management.
- Provider-specific order routing, cheapest matching-provider selection, scheduled status polling, cancel/refill capability handling and six-hour price synchronization.
- Provider health records (last check/success, latency, consecutive failures and last error), visible in Admin → Providers.
- Admin pages for providers, imports, icons, currencies, payment methods, editable bot messages and manual top-up review.
- Customer top-up screen with currency and method selection, Telegram Stars, manual requests and configured API gateway checkout.
- **Khalti ePayment:** server-side initiate + lookup verification (NPR).
- **eSewa ePay V2:** HMAC-signed checkout, signed callback validation and server-side transaction-status verification (NPR).
- **Paytm Payment Gateway:** SHA-256/AES-128-CBC checksum signing, transaction-token initiation and server-side order-status verification (INR). UPI is routed through the Paytm PG account when the merchant account has UPI enabled.
- Payment request history for customers and admin status filters for pending, paid, failed, approved and rejected requests.
- Scheduled gateway reconciliation for pending transactions and expiry of stale sessions.
- Payment audit events and one-time wallet credit + ledger entry guarded by a pending-to-paid state transition.
- Admin alerts for repeated provider sync failures and payment verification/reconciliation errors.
- Gateway merchant secrets are read only from Worker environment secrets; they are never stored in D1 or returned to the customer app.
- Migration `0020_payment_gateways_reliability.sql` adds gateway transaction state, audit and provider-health storage.

## Requires merchant configuration and live validation

- Khalti, eSewa and Paytm merchant credentials must be configured as Cloudflare Worker secrets. Test credentials must be used first.
- The relevant merchant accounts must be eligible, approved and KYC-verified by their providers. Paytm/UPI requires an eligible India merchant account and UPI enabled on the Paytm PG account.
- A successful local code build does not prove a live merchant transaction. Complete provider sandbox checkout, callback, status lookup, exact amount/currency checks and wallet-credit tests before switching to live credentials.
- bKash, Binance Pay and generic crypto payment methods remain disabled/unintegrated in this update. Bank transfer and other manual methods continue to use owner verification.
- Gateway refunds/chargebacks are not automated; these must be handled through the provider merchant dashboard and reconciled by the owner.

## Validation performed for this update

- All 20 SQL migrations applied successfully to an in-memory SQLite database.
- Wallet-credit idempotency tested: a repeated payment confirmation produced one balance credit, one ledger row and one gateway audit event.
- TypeScript/TSX syntax transpilation passed for all modified source files.
- Full typecheck, unit tests and production build could not be completed: dependencies could not be installed in this environment, and the available Node runtime is v22 while this project requires Node 24 (`.nvmrc`).

Before deployment, use Node 24, run `npm ci`, then `npm run typecheck && npm test && npm run build`.

## V4 first-run and customer currency update

- First-run browser setup now accepts the Telegram bot token and the intended first administrator Telegram ID.
- Fresh setup validates the Telegram token and saves it in D1 settings without requiring APP_ENCRYPTION_KEY. Legacy encrypted-token installations still support decryption when the legacy key is supplied.
- The first-admin claim deep link is restricted to the Telegram ID entered during setup. A different ID cannot claim the initial admin role.
- Existing `BOT_TOKEN` Worker-secret deployments remain supported as a backwards-compatible fallback when no encrypted token exists.
- Added migration `0021_first_run_encryption_currency.sql`: customer currency preference defaults to USDT and USDT is added as an enabled currency.
- Customers can select an individual display currency in Profile. Wallet balances, service prices, order totals, refunds and ledger amounts use the selected currency symbol and configured exchange rate; stored wallet values remain USDT-equivalent micro-units to avoid rounding loss.
- Admin's Telegram Stars conversion setting is labelled Stars per USDT. It controls Telegram Stars payment calculations, not each customer's display currency.
- Top-up currency selection defaults to the customer's preferred currency when an enabled payment method supports it; otherwise it falls back to an available payment currency.

## V4 validation

- All 21 SQL migrations applied successfully to an in-memory SQLite database.
- TypeScript/TSX syntax transpilation passed for 98 non-declaration source files.
- Full TypeScript typecheck, unit tests and production build remain unverified because dependency installation timed out and the available runtime is Node 22 (project requirement: Node 24+).
- Cloudflare deployment, AES-GCM round-trip in the Workers runtime, Telegram setup, webhook registration and first-admin claim still require deployment smoke testing.
