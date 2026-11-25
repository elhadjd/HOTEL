const LOCALE_PREFIX_RE = /^\/(pt|en|fr|es)(\/|$)/;

function stripLocaleFromPath(pathname: string): string {
  const match = pathname.match(LOCALE_PREFIX_RE);
  if (!match) return pathname || "/";
  const rest = pathname.slice(match[0].length - (match[2] === "/" ? 1 : 0));
  return rest.startsWith("/") ? rest : `/${rest}`;
}

/**
 * Validates that a user-supplied post-login redirect target is strictly a relative
 * same-origin application path (no protocol-relative `//`, no backslashes `/\`,
 * no control characters, and never looping back to auth/API routes).
 */
export function safeCallbackPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  if (trimmed.includes("\\") || /[\u0000-\u001f\u007f]/.test(trimmed)) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed, "http://local.invalid");
  } catch {
    return null;
  }

  if (parsed.origin !== "http://local.invalid") return null;
  if (!parsed.pathname.startsWith("/") || parsed.pathname.startsWith("//")) return null;

  const stripped = stripLocaleFromPath(parsed.pathname);
  if (
    stripped === "/login" ||
    stripped.startsWith("/login/") ||
    stripped === "/set-password" ||
    stripped.startsWith("/set-password/") ||
    stripped === "/api" ||
    stripped.startsWith("/api/")
  ) {
    return null;
  }

  return `${parsed.pathname}${parsed.search}`;
}
