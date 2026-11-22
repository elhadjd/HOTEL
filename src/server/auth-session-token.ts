import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Auth.js sets `__Secure-authjs.session-token` on HTTPS. getToken() defaults to the
 * non-secure name unless secureCookie is true — which made production middleware
 * treat every request as logged-out and bounce to /login?callbackUrl=…
 */
export function shouldUseSecureAuthCookie(request: NextRequest): boolean {
  if (process.env.AUTH_URL?.startsWith("https://")) return true;
  if (process.env.APP_URL?.startsWith("https://")) return true;

  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwarded === "https") return true;
  if (forwarded === "http") return false;

  if (request.nextUrl.protocol === "https:") return true;

  const host = (request.headers.get("host") ?? request.nextUrl.host).toLowerCase();
  return !(host.startsWith("localhost") || host.startsWith("127.0.0.1"));
}

export async function getAuthSessionToken(request: NextRequest) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;

  const secureCookie = shouldUseSecureAuthCookie(request);
  const primary = await getToken({ req: request, secret, secureCookie });
  if (primary) return primary;

  // Fallback when proxy headers / AUTH_URL disagree with the cookie that was set
  return getToken({ req: request, secret, secureCookie: !secureCookie });
}
