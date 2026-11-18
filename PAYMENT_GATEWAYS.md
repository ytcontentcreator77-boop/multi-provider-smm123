# Payment gateway setup

This project contains server-side checkout and verification adapters for:

- **Khalti ePayment** (NPR): initiate `/epayment/initiate/`, then verify with `/epayment/lookup/` before crediting.
- **eSewa ePay V2** (NPR): signed form checkout, signed response validation, then transaction-status verification.
- **Paytm Payment Gateway** (INR): server-side transaction-token initiation, Paytm AES-128-CBC/SHA-256 checksum signing, and server-side order-status verification. UPI is available only if it is enabled on the Paytm merchant account; the Paytm hosted checkout presents the payment modes enabled for that merchant. The current web checkout does not promise a UPI-only cashier. This is not a standalone universal UPI API.

## Credentials

Never put merchant secrets in frontend code, D1, Git, screenshots, or chat. Configure them as Cloudflare Worker secrets (or local `.dev.vars` for development):

| Secret / variable | Purpose |
|---|---|
| `KHALTI_SECRET_KEY` | Khalti merchant secret key |
| `KHALTI_BASE_URL` | Optional; defaults to `https://a.khalti.com/api/v2` |
| `ESEWA_PRODUCT_CODE` | eSewa merchant product code |
| `ESEWA_SECRET_KEY` | eSewa ePay V2 signing secret |
| `ESEWA_ENV` | `test` by default; set `live` only after successful sandbox verification |
| `PAYTM_MID` | Paytm merchant ID |
| `PAYTM_MERCHANT_KEY` | Paytm merchant key (16-byte key required by the checksum utility) |
| `PAYTM_WEBSITE` | Optional; defaults to `DEFAULT` |
| `PAYTM_ENV` | `test` by default; set `live` only after successful sandbox verification |
| `PAYTM_BASE_URL` | Optional override; normally leave unset and use the environment default |

Example commands (run in the project directory; the CLI prompts for each secret):

```sh
npx wrangler secret put KHALTI_SECRET_KEY
npx wrangler secret put ESEWA_PRODUCT_CODE
npx wrangler secret put ESEWA_SECRET_KEY
npx wrangler secret put PAYTM_MID
npx wrangler secret put PAYTM_MERCHANT_KEY
```

For local testing, copy `.dev.vars.example` to `.dev.vars` and fill in test credentials. `.dev.vars` is ignored by Git. For production, configure non-secret mode variables such as `ESEWA_ENV=live` and `PAYTM_ENV=live` in the Cloudflare Worker environment variables; keep merchant keys in secrets.

## Enable a method

1. Obtain the appropriate merchant account and complete the provider's business/KYC onboarding.
2. Add the test credentials as Worker secrets.
3. Deploy the Worker and apply migration `0020_payment_gateways_reliability.sql` (automatic migration also runs on first request/cron).
4. Open Admin → Payment methods. The gateway shows whether its required credentials are configured.
5. Enable the method only after the test checkout, return URL, status lookup, amount validation and one-time wallet credit have all passed.
6. Switch to live credentials and set `ESEWA_ENV=live` / `PAYTM_ENV=live` only after the merchant provider approves production access.

Payment gateway merchant accounts are subject to each provider's eligibility, identity and business verification requirements. Use only an account lawfully held and administered by the business owner or an authorized adult representative. Do not try to bypass KYC or age requirements.

## Payment safety model

- All merchant secrets stay in Worker environment variables; the customer app never receives them.
- The app creates a pending top-up request before opening checkout.
- Return URLs are not trusted as proof of payment. The Worker independently calls the provider's lookup/status API and checks the exact merchant reference, currency and amount.
- Wallet credit and ledger entry are written once, guarded by the pending-to-paid state transition in a D1 batch.
- A scheduled reconciliation checks pending Khalti, eSewa and Paytm requests. Manual requests remain admin-reviewed.
- UPI is a payment mode provided by a compatible India merchant gateway (here, Paytm PG), not an API endpoint that can be integrated generically without an acquiring bank/payment gateway.

## Important production checks

Before accepting live payments, test provider sandbox accounts and verify callback URLs are publicly reachable over HTTPS. Confirm the provider's current API version, allowed merchant categories, settlement terms, supported currencies and live account status. Review fees and local tax/legal obligations with the business owner. Payment status lookups are retried; uncertain transactions stay pending rather than being credited speculatively.
