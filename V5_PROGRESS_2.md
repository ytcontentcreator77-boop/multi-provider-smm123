# CP SMM V5 — Progress checkpoint 2

This checkpoint continues the V4-to-V5 additive upgrade. UI/theme redesign is intentionally excluded per user instruction.

## Implemented in this checkpoint
- New additive schema migrations 0023–0025: manual membership overrides, loyalty check-in/account settings, customer notes/tags, additional AI order-draft fields, and daily claim uniqueness.
- Customer support ticket create/list/detail/reply; ticket messages are scoped to the current customer and internal notes are hidden from customer reads.
- Owner ticket inbox/detail/reply/status/priority/assignment.
- Promotion list/join/proof submission; owner campaign create/edit/list/participant review. Balance reward review credits a reward through the wallet/ledger path with idempotency checks.
- Coupon management and validation quotes (redemption is not yet connected to checkout).
- Maintenance settings endpoint and API-layer write blocking for non-owners, with ticket exception.
- Published legal policies and customer acceptance records.
- Membership level CRUD, customer spending progress, owner overrides/history.
- Loyalty configuration, daily check-in and points history.
- Customer notes and tags for admin CRM.
- AI order draft creation, read, cancel and confirmation using the existing order placement path; draft confirmation lock prevents repeat confirmation.
- Dynamic message-template storage and sample-recipient preview with unknown-variable detection.
- Free-service campaign management and claim reservation. Claims are recorded, but provider fulfillment is not connected.
- Read-only JSON backup export; secret-bearing provider API keys and settings are excluded. Restore is not implemented.

## Validation performed
- TypeScript files transpiled with the globally available TypeScript compiler (syntax-level check).
- All 25 SQL migrations ran successfully against a fresh SQLite database.

## Not yet complete / not tested
- Full `tsc --noEmit` and production build: unavailable because required npm packages are missing and Node 22 is below the project's Node >=24 requirement. Offline dependency installation also failed because npm cache lacks packages.
- No live Cloudflare D1, Telegram, provider, payment, AI service or UI test has been run.
- VIP discounts are not applied to checkout/order charges.
- Coupons are validation-only; redemption/discount settlement is not wired into order/payment creation.
- Free-service claims are reservation records only, not actual provider orders.
- Non-balance promotion rewards (coupon/free-service/referral) are not settled automatically.
- Loyalty purchase earning/redemption, cashback, flash-sale engine, full AI conversational assistant, broadcasts studio, automation execution, backup restore/import, attachments, notification delivery, and complete analytics remain unfinished.
- No complete end-to-end/security/production acceptance test has been run.

Do not treat this checkpoint as final V5.

## Additional implementation since this report was drafted
- Added five editable default membership levels (Bronze, Silver, Gold, Platinum, Diamond).
- VIP discount computation uses completed/partial order spend (wallet top-ups do not count), supports manual level overrides, and supports service/category restrictions.
- Applied the server-calculated VIP discount in balance order placement and direct Stars order invoices; the AI order-draft confirmation uses its server-saved price.
- Promotion balance reward budget reservation/settlement smoke-tested for idempotency against SQLite.
- Automation toggles now control existing scheduled Worker tasks (catalog/provider sync, payment reconciliation, order status polling, referrals, broadcasts, command updates, housekeeping); defaults remain enabled to preserve existing behavior.
- Added owner CSV exports for customers and orders, sanitized backup export, and restore-preview validation (no restore mutation).
- Added V5 feature analytics endpoint.
- Maintenance mode automatically ends at its configured return time, with a one-time event record.
