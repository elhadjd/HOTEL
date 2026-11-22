import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

const ALGO = "aes-256-gcm";

function resolveKeyMaterial(): Buffer {
  const explicit = process.env.AGGREGATE_ENCRYPTION_KEY?.trim();
  if (explicit) {
    if (explicit.length < 32) {
      throw new Error("AGGREGATE_ENCRYPTION_KEY must be at least 32 characters");
    }
    return createHash("sha256").update(explicit).digest();
  }

  const nodeEnv = process.env.NODE_ENV ?? "development";
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) {
    throw new Error("AGGREGATE_ENCRYPTION_KEY is required (or AUTH_SECRET in non-production)");
  }
  if (nodeEnv === "production") {
    throw new Error("AGGREGATE_ENCRYPTION_KEY is required in production (do not use AUTH_SECRET)");
  }
  return createHash("sha256").update(`aggregate-dev:${secret}`).digest();
}

function keyVersion(): string {
  return (process.env.AGGREGATE_ENCRYPTION_KEY_ID?.trim() || "v1").replace(/[^a-zA-Z0-9_-]/g, "") || "v1";
}

/** Encrypt raw mca_ key for server-side storage. Never send ciphertext to the browser. */
export function encryptAggregateKey(plaintext: string): string {
  const key = resolveKeyMaterial();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${keyVersion()}:${iv.toString("base64url")}:${tag.toString("base64url")}:${enc.toString("base64url")}`;
}

export function decryptAggregateKey(payload: string): string {
  const key = resolveKeyMaterial();
  const parts = payload.split(":");
  if (parts.length !== 4) {
    throw new Error("Invalid encrypted Aggregate key payload");
  }
  const [, ivB64, tagB64, dataB64] = parts;
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Invalid encrypted Aggregate key payload");
  }
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}

export function keyPrefixFromRaw(rawKey: string): string {
  return rawKey.trim().slice(0, 12);
}

export function assertMcaKeyFormat(rawKey: string): void {
  const key = rawKey.trim();
  if (!/^mca_[A-Za-z0-9]+$/.test(key) || key.length < 20) {
    throw new Error("Invalid Aggregate key format (expected mca_…)");
  }
}

export function keysEqualConstantTime(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
