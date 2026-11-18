# CP SMM V5 Upgrade Progress (UI/themes excluded)

## User scope
- Keep existing customer and admin UI as-is.
- Do not add themes or theme customization.
- Implement the other V5 requirements in the master specification.
- Bot token is entered first; a new deployment must not require APP_ENCRYPTION_KEY.

## Started in this build
- Added migration 0022 with schema foundations for VIP levels/history, coupons/redemptions, support tickets/messages/attachments, promotions/participants/rewards, free-service campaigns/claims, loyalty and cashback, message templates, broadcast campaigns/delivery, AI sessions/order drafts/usage, legal policies/acceptances, maintenance, automation, audit logs, backup history and order events.
- Added D1 `bot_token` setting for fresh setup; setup validates the token with Telegram and no longer requires APP_ENCRYPTION_KEY.
- Kept legacy encrypted token compatibility for installs that already use ciphertext and have their old APP_ENCRYPTION_KEY.
- Updated setup and deployment documentation.

## Not yet implemented
- Feature API routes, admin controls, customer workflows, business logic, scheduled processing, tests and acceptance coverage for the new schema features.
- Full testing and production verification. Current container Node is v22 while project requires Node >=24, and dependency install timed out; typecheck/test could not run because type packages are unavailable.

## Security note
- Fresh bot tokens are stored in D1 settings, not encrypted by app-level AES. Cloudflare encrypts D1 at rest, but D1 access remains sensitive and must be restricted. Legacy ciphertext remains supported.
