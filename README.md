# Multi-provider SMM Telegram Mini App

A white-label Telegram Mini App and bot for selling social-media services through multiple standard SMM v2 API providers. The admin connects providers, imports services, configures prices and branding, and manages orders from the built-in admin panel.

## Features

- Telegram Mini App customer storefront, wallet, orders and profile.
- Owner-only admin dashboard, user/order management, price rules and branding.
- Multiple standard SMM v2 providers (API URL + key), service import by provider/category/platform, and per-order provider routing.
- Scheduled provider order status checks; provider cancellation and refill where supported.
- Admin configuration for service/category icons, currencies and payment methods.
- Editable bot message templates for welcome, order lifecycle, top-ups, refunds, help and referrals.
- Telegram Stars top-ups (the only fully implemented live payment flow).
- Cloudflare Workers + D1 deployment.

## Requirements

- Node.js 24 or newer
- A Telegram bot token from [@BotFather](https://t.me/BotFather)
- A Cloudflare account with Workers and D1 enabled
- One or more providers that implement the common SMM v2 `key` + `action` API

## Local setup

1. Install dependencies with `npm ci`.
2. Copy `.dev.vars.example` to `.dev.vars` if using local optional settings. Enter the bot token and first admin Telegram ID directly in the first-run browser setup; no APP_ENCRYPTION_KEY is required for a new install.
3. Run `npm run dev`.
4. Open the local setup page, enter the bot token, and complete the Telegram setup steps, including the first-admin claim.
5. Claim the owner account, open the Admin page in Telegram, and connect providers under **Providers**.
6. Import services by selecting a provider, category, platform and services.

## Cloudflare deployment

1. Deploy the project to Cloudflare Workers.
2. Do not add the Telegram bot token to source control or Worker vars; enter it in the first-run setup. New deployments do not require APP_ENCRYPTION_KEY. Existing encrypted installations may still need that legacy secret until their bot token is migrated. The first admin is verified through a one-time claim link sent to the bot and must match the Telegram ID entered during setup.
3. Deploy the Worker and open its URL to complete the Telegram setup wizard.
4. Claim the owner account, then connect supplier API endpoints and keys from **Admin → Providers**.
5. Apply migrations with `npm run db:migrate:remote` if your deployment process does not apply them automatically.

Provider keys are stored server-side and masked in admin responses. Never share the `.dev.vars` file or provider credentials.

## Checks

```sh
npm run typecheck
npm test
npm run build
```

See [IMPLEMENTATION_STATUS.md](./IMPLEMENTATION_STATUS.md) for what is implemented and what remains intentionally unfinished.


## Payment gateways

See [PAYMENT_GATEWAYS.md](./PAYMENT_GATEWAYS.md) for Khalti, eSewa and Paytm/UPI configuration, secret management, sandbox testing and production safety checks.


## First-run Cloudflare setup (V5 token-first)

1. Create the D1 database and deploy the Worker/assets. The Worker applies migrations on first request.
2. No APP_ENCRYPTION_KEY is required for a new deployment. It is optional for legacy encrypted-token compatibility.
3. Open the deployed app URL. Enter the Telegram bot token from @BotFather first, then the intended administrator's numeric Telegram ID.
4. The server validates the token with Telegram and stores it in D1 settings. The token is not written to browser storage. D1/account access is sensitive; restrict access and permissions.
5. Complete setup, open the generated claim link from the Telegram account whose ID you entered, and press Start. Other accounts cannot claim first-admin access.
6. Legacy encrypted bot tokens remain supported when APP_ENCRYPTION_KEY is available. New deployments do not require it.

The customer wallet is stored in micro-USD/USDT-equivalent units to avoid rounding loss. Each customer can select an enabled display currency in Profile; currency conversion affects presentation only, not the underlying wallet value. Telegram Stars remain an optional payment method, with the Stars-per-USDT rate controlled by the administrator.


## V5 checkpoint notes (backend upgrade)

This source checkpoint includes additive V5 migrations and APIs. See `V5_CHECKPOINT_5_NOTES.md` and `V5_REMAINING_WORK.md` for new API behavior and known gaps. The new endpoints are not yet integrated into the existing frontend UI.

- Coupon validation is server-priced; wallet orders can pass `couponCode`. Coupons with Stars invoices are rejected.
- Free-service claims require a target `link` and are fulfilled through the provider-order pipeline at zero customer charge.
- Owner reports: `/api/admin/v5/analytics/report`.
- Backup export: `/api/admin/v5/backup/export`; bounded insert-only merge restore: `/api/admin/v5/backup/restore/merge` with `confirm: \"MERGE_BACKUP\"`.
- Migration 0028 adds coupon reservations; 0029 adds automation run tracking.

**Deployment caution:** This source checkpoint has not passed a production build or Cloudflare deployment in the current environment. Complete dependency installation (Node 24 required), typecheck, tests, and external integration testing before deploying.
