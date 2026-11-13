/** Cookie names and helpers shared by the proxy, login and feed (edge-safe: Web Crypto only). */
export const SEED_COOKIE = "atria_seed";
export const SEED_TTL_S = 60 * 60;
export const AUTH_COOKIE = "atria_auth";

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The cookie value that proves the password was entered (never the password itself). */
export function authToken(password: string): Promise<string> {
  return sha256(`atria:${password}`);
}
