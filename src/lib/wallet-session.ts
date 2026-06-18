import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

const SECRET = process.env.NEURUS_SESSION_SECRET ?? "";
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;

function hmac(data: string): string {
  return createHmac("sha256", SECRET).update(data).digest("base64url");
}

export function signWallet(address: string): string {
  const payload = `${address}.${Date.now()}`;
  return `${payload}.${hmac(payload)}`;
}

export function readWallet(token: string | undefined): string | null {
  if (!token || !SECRET) return null;
  const i = token.lastIndexOf(".");
  if (i === -1) return null;
  const payload = token.slice(0, i);
  const sig = token.slice(i + 1);
  const expected = hmac(payload);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const [address, tsRaw] = payload.split(".");
  const ts = Number(tsRaw);
  if (!address || !Number.isFinite(ts) || Date.now() - ts > MAX_AGE_MS) return null;
  return address;
}

export function newNonce(): string {
  return randomBytes(16).toString("hex");
}

export function walletStatement(nonce: string): string {
  return `Sign in to Neurus\n\nnonce: ${nonce}`;
}
