import { createHmac } from "crypto";

const REAUTH_TTL_MS = 5 * 60 * 1000;

function getSecret(): string {
  const key = process.env.CLERK_SECRET_KEY ?? "";
  return key.slice(0, 32).padEnd(32, "0");
}

export function signReauthPayload(userId: string, ts: number): string {
  return createHmac("sha256", getSecret())
    .update(`${userId}:${ts}`)
    .digest("hex");
}

export function validateReauthCookie(
  cookieValue: string,
  userId: string,
): boolean {
  const parts = cookieValue.split(":");
  if (parts.length !== 3) return false;
  const [uid, tsStr, sig] = parts;
  if (uid !== userId) return false;
  const ts = parseInt(tsStr, 10);
  if (isNaN(ts)) return false;
  if (Date.now() - ts > REAUTH_TTL_MS) return false;
  const expected = signReauthPayload(userId, ts);
  return sig.length === expected.length && sig === expected;
}
