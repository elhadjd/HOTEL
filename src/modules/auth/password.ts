import { createHash, randomBytes, randomInt } from "node:crypto";
import { hash, compare } from "bcryptjs";

const BCRYPT_ROUNDS = 12;

/** Alphabet without ambiguous characters (0/O, 1/l/I). */
const TEMP_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, passwordHash: string): Promise<boolean> {
  return compare(plain, passwordHash);
}

/** Cryptographically strong temporary password (never log). */
export function generateTemporaryPassword(length = 16): string {
  const chars: string[] = [];
  for (let i = 0; i < length; i += 1) {
    chars.push(TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)]!);
  }
  // Ensure complexity classes
  chars[0] = "ABCDEFGHJKLMNPQRSTUVWXYZ"[randomInt(24)]!;
  chars[1] = "abcdefghijkmnopqrstuvwxyz"[randomInt(24)]!;
  chars[2] = "23456789"[randomInt(8)]!;
  chars[3] = "!@#$%"[randomInt(5)]!;
  return chars.join("");
}

export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export const passwordPolicySchemaMessage =
  "Password must be at least 10 characters and include upper, lower, number and symbol";

export function validatePasswordStrength(password: string): { ok: true } | { ok: false; message: string } {
  if (password.length < 10) {
    return { ok: false, message: passwordPolicySchemaMessage };
  }
  if (!/[A-Z]/.test(password)) return { ok: false, message: passwordPolicySchemaMessage };
  if (!/[a-z]/.test(password)) return { ok: false, message: passwordPolicySchemaMessage };
  if (!/[0-9]/.test(password)) return { ok: false, message: passwordPolicySchemaMessage };
  if (!/[^A-Za-z0-9]/.test(password)) return { ok: false, message: passwordPolicySchemaMessage };
  return { ok: true };
}

export function temporaryPasswordTtlMs(): number {
  const hours = Number(process.env.TEMP_PASSWORD_TTL_HOURS ?? "24");
  return Math.max(1, hours) * 60 * 60 * 1000;
}

export function passwordResetTtlMs(): number {
  const minutes = Number(process.env.PASSWORD_RESET_TTL_MINUTES ?? "30");
  return Math.max(5, minutes) * 60 * 1000;
}

export function onboardingChallengeTtlMs(): number {
  const minutes = Number(process.env.ONBOARDING_CHALLENGE_TTL_MINUTES ?? "15");
  return Math.max(5, minutes) * 60 * 1000;
}
