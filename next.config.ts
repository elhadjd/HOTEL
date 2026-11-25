import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/**
 * Production notes (hotel.sisgesc.net):
 * - Some nginx configs intercept `*.css` and break `/_next/static/css/*` (HTTP 400),
 *   leaving the app unstyled and contributing to client hydration failures.
 * - `experimental.inlineCss` embeds compiled CSS in the HTML so the UI no longer
 *   depends on that broken asset path.
 * - HTML must not be cached for a year (Next default s-maxage on static pages);
 *   stale HTML after deploy references missing chunks and crashes mobile clients.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // App Router production: inline imported CSS into <style> tags
    inlineCss: true,
  },
  async headers() {
    const securityHeaders = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
      },
      ...(process.env.NODE_ENV === "production"
        ? [
            {
              key: "Strict-Transport-Security",
              value: "max-age=63072000; includeSubDomains; preload",
            },
          ]
        : []),
    ];

    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // Documents / RSC — never pin HTML for a year behind nginx
        source: "/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-cache, no-store, max-age=0, must-revalidate",
          },
        ],
      },
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
