import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const MAGIC = "neurus-seal-v2";
const LEGACY_MAGIC = "neurus-seal-v1";
const LEGACY_SALT = "neurus.seal.v1";

function deriveKey(secret: string, salt: Buffer | string): Buffer {
  return scryptSync(secret, salt, 32);
}

export function seal(plaintext: string, secret: string): string {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(secret, salt), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [MAGIC, salt.toString("base64"), iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

export function unseal(envelope: string, secret: string): string {
  const parts = envelope.split(".");
  if (parts[0] === MAGIC) {
    const [, saltB, ivB, tagB, encB] = parts;
    const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret, Buffer.from(saltB, "base64")), Buffer.from(ivB, "base64"));
    decipher.setAuthTag(Buffer.from(tagB, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(encB, "base64")), decipher.final()]).toString("utf8");
  }
  if (parts[0] === LEGACY_MAGIC) {
    const [, ivB, tagB, encB] = parts;
    const decipher = createDecipheriv("aes-256-gcm", deriveKey(secret, LEGACY_SALT), Buffer.from(ivB, "base64"));
    decipher.setAuthTag(Buffer.from(tagB, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(encB, "base64")), decipher.final()]).toString("utf8");
  }
  throw new Error("not a neurus-seal envelope");
}

export function isSealed(s: string): boolean {
  return s.startsWith(MAGIC + ".") || s.startsWith(LEGACY_MAGIC + ".");
}
