import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { getAuthSessionToken } from "./server/auth-session-token";
import { safeCallbackPath } from "./shared/safe-redirect";

const intlMiddleware = createMiddleware(routing);

const PUBLIC_PATHS = [
  "/login",
  "/onboarding",
  "/forgot-password",
  "/reset-password",
  "/set-password",
];

function stripLocale(pathname: string): string {
  const match = pathname.match(/^\/(pt|en|fr|es)(\/|$)/);
  if (!match) return pathname || "/";
  const rest = pathname.slice(match[0].length - (match[2] === "/" ? 1 : 0));
  return rest.startsWith("/") ? rest : `/${rest}` || "/";
}

function localePrefix(pathname: string): string {
  const match = pathname.match(/^\/(pt|en|fr|es)(\/|$)/);
  return match ? `/${match[1]}` : "";
}

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestId =
    request.headers.get("x-request-id")?.trim() ||
    (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? `req_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`
      : `req_${Date.now()}`);

  // Let API / static / public files (css, ico, txt, …) bypass intl/auth.
  // Without this, `/hotelaria-app.css` or `/robots.txt` can match `[locale]`.
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    /\.[a-zA-Z0-9]+$/.test(pathname)
  ) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-request-id", requestId);
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set("x-request-id", requestId);
    return res;
  }

  const path = stripLocale(pathname);
  const prefix = localePrefix(pathname);
  const isPublic =
    path === "/" ||
    PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  const token = await getAuthSessionToken(request);
  const mustChange = Boolean(token?.mustChangePassword);

  if (token?.sub && mustChange && path !== "/set-password" && !path.startsWith("/api")) {
    // Block protected app until password change
    if (!isPublic || path === "/" || path.startsWith("/dashboard") || path.startsWith("/hotels")) {
      const url = request.nextUrl.clone();
      url.pathname = `${prefix}/set-password`;
      return NextResponse.redirect(url);
    }
  }

  if (!token?.sub && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = `${prefix}/login`;
    url.searchParams.set("callbackUrl", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(url);
  }

  if (token?.sub && !mustChange && (path === "/login" || path === "/set-password")) {
    const url = request.nextUrl.clone();
    const callback = safeCallbackPath(url.searchParams.get("callbackUrl"));
    if (callback) {
      const target = new URL(callback, url.origin);
      url.pathname = target.pathname;
      url.search = target.search;
    } else {
      url.pathname = `${prefix}/dashboard`;
      url.search = "";
    }
    return NextResponse.redirect(url);
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ["/", "/(pt|en|fr|es)/:path*", "/((?!api|_next|_vercel|.*\\..*).*)"],
};
