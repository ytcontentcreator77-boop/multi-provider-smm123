# CP SMM V5 Checkpoint 5

This source checkpoint includes several backend integrations beyond the previous checkpoint. It is **not a production-ready final release**.

## New behavior

- Wallet checkout may include `couponCode`. The server validates the coupon against the selected service and VIP-adjusted subtotal, reserves redemption limits, places the order, and links the redemption to the order. Coupon use with Stars invoices is rejected.
- `POST /api/v5/coupons/validate` expects `code`, `serviceId`, `link`, and `quantity` (optional `fields` and `dripMinutes`). It calculates pricing server-side.
- `POST /api/v5/free-services/:id/claim` expects `{"link":"..."}`. It checks campaign/service/provider mapping, eligibility and budget, then places a provider order for zero customer charge.
- `GET /api/admin/v5/analytics/report?start=YYYY-MM-DD&end=YYYY-MM-DD` (or Unix seconds) returns a date-range summary. Owner-only.
- `POST /api/admin/v5/backup/restore/merge` accepts a V5 backup JSON with `confirm: "MERGE_BACKUP"`. It inserts missing rows only, never overwrites existing records, and is limited to 750 rows per request. Provider/payment API keys are blanked and providers/API payment methods disabled; the safe settings allowlist is merged, but backup history is skipped. Secrets must be configured again. Use only after backup and preferably against a fresh database.
- Automation jobs record last status, error and run count (migration 0029).

## Migrations

0028 adds coupon reservation status/indexes. 0029 adds automation run status/error/count fields.

## Limitations

The new APIs are not wired into the existing UI. Restore is a bounded insert-only merge, not a full restore/replace. Coupon support is wallet orders only. Production build, Cloudflare deployment and external integration tests have not passed/been run in this environment. See `V5_REMAINING_WORK.md`.
