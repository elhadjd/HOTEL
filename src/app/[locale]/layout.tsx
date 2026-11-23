import type { Metadata } from "next";
import { Libre_Baskerville, Source_Sans_3 } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { CriticalCss } from "@/components/critical-css";
import { Providers } from "@/components/providers";
import { routing } from "@/i18n/routing";
import "../globals.css";

/**
 * Short revalidation — avoid year-long HTML cache (stale chunks → mobile Application error)
 * without force-dynamic streaming holes that defer CSS until JS runs.
 */
export const revalidate = 0;

const display = Libre_Baskerville({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-display",
});

const ui = Source_Sans_3({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ui",
});

export const metadata: Metadata = {
  title: "SIGESC Hotelaria",
  description: "Modern Hospitality Intelligence — plataforma operacional SIGESC Hotelaria",
};

export function generateStaticParams() {
  // Keep locale set constrained — never treat asset filenames as locales
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as "pt" | "en" | "fr" | "es")) {
    notFound();
  }
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <head>
        {/* Stable public URL — production returns 400 for `/_next/static/css/*` */}
        {/* eslint-disable-next-line @next/next/no-css-tags */}
        <link rel="stylesheet" href="/hotelaria-app.css" />
      </head>
      <body className={`${display.variable} ${ui.variable} antialiased`}>
        <CriticalCss />
        <NextIntlClientProvider messages={messages}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
