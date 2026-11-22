const DEFAULT_ALLOWED = [
  "app.sisgesc.net",
  "admin.sisgesc.net",
  "app.zyvoerp.com",
  "admin.zyvoerp.com",
];

export function getAllowedAggregateHosts(): string[] {
  const fromEnv = process.env.SIGESC_AGGREGATE_ALLOWED_HOSTS?.split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return fromEnv?.length ? fromEnv : DEFAULT_ALLOWED;
}

/**
 * Host comes from env / allowlist only — never from client input (SSRF protection).
 */
export function resolveValidatedAggregateHost(override?: string): string {
  const raw = (override || process.env.SIGESC_AGGREGATE_HOST || "https://app.sisgesc.net").trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid SIGESC Aggregate host URL");
  }
  if (url.protocol !== "https:") {
    throw new Error("SIGESC Aggregate host must use HTTPS");
  }
  const host = url.hostname.toLowerCase();
  const allowed = getAllowedAggregateHosts();
  if (!allowed.includes(host)) {
    throw new Error(`SIGESC Aggregate host not allowlisted: ${host}`);
  }
  return `${url.protocol}//${url.host}`;
}
