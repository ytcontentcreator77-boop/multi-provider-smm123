# V4 release notes

## First-run setup

- Deploy the Worker and its static assets to Cloudflare.
- Add one Cloudflare Worker secret named `APP_ENCRYPTION_KEY`. Generate it with `openssl rand -base64 32`.
- Open the deployed URL and enter the Telegram bot token from @BotFather plus the numeric Telegram ID that should become the first administrator.
- The Worker validates the token with Telegram, encrypts it using AES-GCM, and stores only ciphertext + IV in D1. The token is not stored in browser storage or source files.
- Complete the Telegram connection steps, then open the generated claim link with the Telegram account whose ID was entered. The claim handler rejects every other Telegram account.

The bot token can be decrypted only by the deployed Worker while `APP_ENCRYPTION_KEY` is present. Back up that secret securely. If it is lost, the stored bot token cannot be decrypted. Existing installs that still set `BOT_TOKEN` as a Worker secret remain compatible if no encrypted token has been saved.

## Currency and wallet

- All new users default to `USDT` as their display currency.
- Each user can choose another enabled currency from Profile → Display currency.
- Wallet amounts, service prices, order totals, refunds, referral rewards and bot wallet notifications are formatted in the selected currency.
- The underlying wallet ledger remains integer micro-USD (USDT-equivalent) so changing display currency never rewrites or rounds the stored balance.
- Currency conversion uses the rates in Admin → Currencies. Those rates are administrator-managed; they are not represented as live market quotes.
- The administrator's Stars-per-USDT rate controls Telegram Stars payment conversion only. Stars remain available as an explicit payment method, not the default wallet display.
- Top-up currency defaults to the customer's preferred currency when an enabled payment method supports it; otherwise it chooses an available payment currency.

## Branding

- The default unconfigured brand is now `SMM Service`; the setup flow replaces it with the bot's first name unless the administrator later sets a custom brand.
- Existing internal legacy provider/database identifiers are retained for backward compatibility with prior orders, webhook events and migrations. They are not used as the default customer-facing brand.

## Verification performed

- Migrations 0001–0021 applied successfully to an in-memory SQLite database.
- AES-GCM encryption/decryption round-trip verified with Web Crypto.
- TypeScript/TSX syntax transpilation passed for 98 non-declaration source files.
- Full typecheck, unit tests and Vite/Cloudflare production build were not run: dependency installation timed out, and the available Node runtime is v22 while this project requires Node 24 or newer.
- Before production traffic, use Node 24 and run `npm ci`, `npm run typecheck`, `npm test`, and `npm run build`; then deploy and test the setup wizard, admin claim, webhook and payment gateways in their sandbox environments.
