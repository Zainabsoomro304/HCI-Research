/**
 * Admin session cookie: "<expiryMs>.<hmac>" signed with SESSION_SECRET (Web Crypto, so it also runs in middleware).
 */
export const ADMIN_COOKIE = "admin_session";
export const ADMIN_SESSION_HOURS = 12;

function b64url(buf: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET must be set (at least 16 characters)");
  return s;
}

export async function createAdminToken(now = Date.now()): Promise<string> {
  const exp = now + ADMIN_SESSION_HOURS * 3600_000;
  return `${exp}.${await hmac(secret(), `admin:${exp}`)}`;
}

export async function verifyAdminToken(token: string | undefined, now = Date.now()): Promise<boolean> {
  if (!token) return false;
  const [expStr, sig] = token.split(".");
  const exp = Number(expStr);
  if (!sig || !Number.isFinite(exp) || exp < now) return false;
  const expected = await hmac(secret(), `admin:${exp}`);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

/** Constant-time password comparison. */
export function passwordMatches(given: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}
