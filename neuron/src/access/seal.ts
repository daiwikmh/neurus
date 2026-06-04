import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const MAGIC = "neurus-seal-v1";

function keyFrom(secret: string): Buffer {
  return scryptSync(secret, "neurus.seal.v1", 32);
}

export function seal(plaintext: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [MAGIC, iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

export function unseal(envelope: string, secret: string): string {
  const [magic, ivB, tagB, encB] = envelope.split(".");
  if (magic !== MAGIC) throw new Error("not a neurus-seal envelope");
  const decipher = createDecipheriv("aes-256-gcm", keyFrom(secret), Buffer.from(ivB, "base64"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encB, "base64")), decipher.final()]).toString("utf8");
}

export function isSealed(s: string): boolean {
  return s.startsWith(MAGIC + ".");
}
