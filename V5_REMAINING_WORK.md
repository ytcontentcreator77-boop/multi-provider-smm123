# CP SMM V5 Remaining Work — checkpoint 5 audit

Scope: retain current UI and theme, upgrade V4 additively, no redesign. New deployment must accept bot token first and must not require APP_ENCRYPTION_KEY (legacy encrypted-token support remains).

## Implemented but needs integration/acceptance testing
- Support ticket create/list/reply and admin queue/status/assignment/internal notes. Attachments and notifications are not complete.
- Promotion join/proof submission/review; balance reward settlement has an idempotency guard. Channel membership verification and non-balance rewards are incomplete.
- Coupon CRUD and eligibility quote; checkout redemption/discount settlement is incomplete.
- VIP levels, history/override and spending progress; checkout discount has started for order paths but needs full cross-path/refund verification.
- Loyalty daily check-in/config/history; purchase earning and redemption/expiry are incomplete.
- Free-service campaign CRUD/claim reservation; provider fulfillment and cost/budget settlement are incomplete.
- AI order drafts and confirmation guard; conversational assistant, usage controls and full privacy tests are incomplete.
- Template editing and preview; recipient-specific send integration and required-variable coverage are incomplete.
- Maintenance settings/API enforcement and auto-expiry; all route coverage, schedule, image/announcement behavior require verification.
- Automation switches control some existing Worker scheduled tasks; complete scheduler, job logging/retries and campaign scheduling remain incomplete.
- Sanitized JSON backup export and restore preview; restore/import is NOT implemented.
- Analytics endpoint is partial; financial/customer/provider/refund and date-range reporting are incomplete.
- Admin CSV exports are partial; full customer/order/transaction/service import and rollback are incomplete.

## Explicitly still to build
### Money & commerce
- Checkout-integrated coupon redemption (percent/fixed/bonus/free-service), limits and restrictions atomically consumed.
- VIP discounts tested across service display, checkout, invoice, payment, refund and partial-refund paths.
- Cashback settlement and reversals; configurable service/category/eligibility/caps/budget.
- Flash-sale scheduling and checkout-safe price enforcement.
- Loyalty purchase earning, redemption, point expiry, ledger and reversals.
- Currency/rate validation and consistency tests across wallet, checkout, refunds, payments, invoice and display.

### Providers & free services
- Provider import/sync, status/balance checks, low-balance alert, response/error history, cost/profit metrics.
- Safe fallback/idempotency guarantees under uncertain provider responses.
- Free-service claim-to-real-provider-order path, budget/cost enforcement, daily reset timezone handling, order/status/refund handling.
- Refill/cancel integration wherever the selected provider supports it.

### Promotions & referrals
- Telegram channel membership verification requiring bot permissions and verified API response.
- Proof uploads with storage/security limits and admin review.
- Settlement for coupon, free-service and referral rewards; campaign budget limits must be atomic.
- Referral attribution, qualifying criteria, fraud checks, rewards and reporting end-to-end verification.
- Campaign schedules, direct links, visibility, participant cap concurrency and analytics.

### Administration & management
- Full admin/customer feature controls connected to UI/API (UI is intentionally not redesigned).
- Customer ban/unban, segments, individual pricing/discounts, tags/notes, safe bulk operations.
- CSV/JSON imports with preview, duplicate handling and rollback.
- Ticket attachments, saved replies, notifications and SLA reports.
- Admin roles/permissions, rate limiting, API/error logs, feature flags and activity reports.
- Legal policy version workflow, export, material-update acceptance and restore.
- Maintenance schedules, image/announcement options, all-route enforcement and verified owner bypass.

### Backup & restore
- Scheduled backup and verification; complete coverage for all needed tables and safe settings.
- Actual transactional restore/import with schema validation, dependency order, collision strategy, rollback, preserve IDs/balances/orders/mappings.
- Import for customers/orders/transactions/services and secret reconfiguration workflow.
- Restore tests against a disposable database; secrets remain excluded from exported backup.

### Analytics
- Revenue, provider costs, profit, payment/refund/wallet reports.
- Daily/weekly/monthly/custom ranges; orders, customers, active users, top services/categories.
- Coupon/promotion/free-service/VIP/referral/cashback reports.
- CSV/JSON exports, data correctness tests.

### Deployment & release
- Setup wizard for owner, bot validation, currency, payment/provider setup, import, messages, AI, test order/payment and backup verification.
- Health checks for D1, Telegram, providers, payment integrations, scheduled jobs, storage/performance and deployment/migration status.
- Full typecheck, build, migrations/upgrade test, unit/integration/security and UI regression tests; live external integration tests are environment-dependent.
- Release ZIP, changelog, deployment/rollback instructions and acceptance report.

## Checkpoint 5 changes in this pass
- Free-service claim endpoint now requires a target link, validates it against the campaign service, verifies provider mapping, atomically reserves daily/per-user/budget eligibility, and submits a real provider order through the existing order pipeline with a zero wallet charge. It releases reservation on failure and records order/cost on success.
- Coupon checkout for wallet orders now uses a server-calculated VIP-discounted subtotal, eligibility quote, conditional redemption reservation, order-linked settlement and reservation release on failure. Stars-invoice coupon use is explicitly rejected until invoice reservation lifecycle is implemented.
- Coupon validation endpoint now calculates the quote from service/link/quantity on the server; it no longer trusts a customer-supplied subtotal.
- Scheduled automation runs now record running/completed/failed status, run count and last error in new migration 0029.
- Added date-range financial/operations analytics report endpoint.
- Added bounded, insert-only backup merge endpoint. It preserves existing records and skips secret provider/payment configuration; it is not a destructive restore. Confirmation string is required and merge is capped at 750 rows per request.
- Added migrations 0028–0029.

## Still incomplete / not verified
- New V5 APIs are not wired to new customer/admin UI screens. Current UI was intentionally left unchanged; new APIs require direct client/API integration.
- Coupons: bonus-balance/free-service coupons, multi-coupon rules, Stars-invoice support, refund/void release policy, and end-to-end tests remain.
- Free services: claim order pipeline needs provider credentials/live test; no UI; campaign CRUD validation, timezone/DST, budgets and actual cost accounting need real integration tests.
- Provider: comprehensive provider sync/import/balance monitoring, safe fallback on uncertain external responses, refill/cancel feature coverage and provider metrics remain.
- Promotions: Telegram membership verification and secure proof upload storage are not implemented; non-balance reward types still require fulfillment; campaign cap/budget concurrency needs tests.
- Referral feature exists in V4; V5 reward types/analytics and anti-fraud checks need audit.
- Loyalty: purchase earning/redemption/expiry and cashback settlement/reversal are incomplete.
- AI assistant: interactive chat, usage budgets, privacy and full confirmed order integration need implementation and tests.
- Broadcasts: full segmentation, media/button studio, pause/resume, schedules and delivery reports need verification.
- Admin: roles, permission matrix, bulk import rollback, ticket attachments/notifications/SLA, and customer management controls are incomplete.
- Legal: version restore/export/material-update acceptance workflow needs completion.
- Maintenance: all route coverage, scheduled activation, image and announcement behavior need verification.
- Backup: full backup scheduling/verification and merge/import test coverage are incomplete. Merge import is insert-only and bounded, not a complete overwrite/restore.
- Analytics: endpoint is partial; financial correctness, export, dashboard/UI and multiple campaign/reward metrics need tests.
- Setup wizard/health monitoring, deploy/rollback docs and end-to-end acceptance are incomplete.

## Verification status
- Fresh migration sequence (0001–0029) applied in SQLite.
- V4-to-V5 additive migration sequence simulated (0001–0029).
- Coupon reservation SQL and free-service claim schema smoke tests performed.
- TypeScript parse/transpilation checks for changed files passed using global TypeScript.
- Full typecheck is blocked by missing `@cloudflare/workers-types` and `vite/client`.
- Production build, deployment, live provider/payment/Telegram tests and full regression/security tests are not verified.
- Never mark a feature done merely because its schema or endpoint exists.
