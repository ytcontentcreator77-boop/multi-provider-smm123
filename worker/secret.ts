import type { Env } from "./env";
import { getSettings, setSettings } from "./settings";

const enc = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const dec = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function aesKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function encryptBotToken(token: string, secret: string): Promise<{ ciphertext: string; iv: string }> {
  if (secret.length < 32) throw new Error("APP_ENCRYPTION_KEY must contain at least 32 characters");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(secret), new TextEncoder().encode(token));
  return { ciphertext: enc(new Uint8Array(encrypted)), iv: enc(iv) };
}
export async function decryptBotToken(ciphertext: string, iv: string, secret: string): Promise<string> {
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: dec(iv) }, await aesKey(secret), dec(ciphertext));
  return new TextDecoder().decode(plain);
}
/** Loads the encrypted first-run token into the request-local bindings object for legacy modules. */
export async function hydrateBotToken(env: Env): Promise<void> {
  const s = await getSettings(env);
  if (s.bot_token) { env.BOT_TOKEN = s.bot_token; return; }
  if (s.bot_token_ciphertext && s.bot_token_iv) {
    if (!env.APP_ENCRYPTION_KEY) {
      // Allow the setup screen to load so an owner can replace/migrate the legacy token.
      console.warn("Legacy encrypted bot token is present; setup token replacement is available without APP_ENCRYPTION_KEY.");
      return;
    }
    env.BOT_TOKEN = await decryptBotToken(s.bot_token_ciphertext, s.bot_token_iv, env.APP_ENCRYPTION_KEY);
    return;
  }
  // Backwards-compatible for deployments that still provide BOT_TOKEN as a Worker secret.
}
export async function saveEncryptedBotToken(env: Env, token: string): Promise<void> {
  // First-run setup must not require a second secret. Store token in protected D1 settings;
  // Cloudflare D1 encrypts data at rest. Legacy ciphertext fields remain supported for upgrades.
  await setSettings(env, { bot_token: token, bot_token_ciphertext: "", bot_token_iv: "" });
  env.BOT_TOKEN = token;
}
