import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { getToken } from "next-auth/jwt";
import { routing } from "./i18n/routing";

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

  // Let API / static pass without intl rewrite complications for auth checks
  if (pathname.startsWith("/api") || pathname.startsWith("/_next")) {
    return NextResponse.next();
  }

  const path = stripLocale(pathname);
  const prefix = localePrefix(pathname);
  const isPublic =
    path === "/" ||
    PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
  });

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
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  if (token?.sub && !mustChange && (path === "/login" || path === "/set-password")) {
    const url = request.nextUrl.clone();
    url.pathname = `${prefix}/dashboard`;
    return NextResponse.redirect(url);
  }

  return intlMiddleware(request);
}

export const config = {
  matcher: ["/", "/(pt|en|fr|es)/:path*", "/((?!api|_next|_vercel|.*\\..*).*)"],
};
