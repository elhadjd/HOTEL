const SECRET_PATTERNS = [
  /mca_[A-Za-z0-9]+/g,
  /Bearer\s+[^\s]+/gi,
  /AGGREGATE_ENCRYPTION_KEY[=:]\s*\S+/gi,
  /AUTH_SECRET[=:]\s*\S+/gi,
];

export function redactSecrets(input: string): string {
  let out = input;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, "[REDACTED]");
  }
  return out;
}

export function safeErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    return redactSecrets(err.message || fallback);
  }
  return fallback;
}

export function assertNoSecretLeak(payload: unknown): void {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload);
  if (/mca_[A-Za-z0-9]{10,}/.test(text)) {
    throw new Error("Refusing to expose Aggregate API key material");
  }
}
