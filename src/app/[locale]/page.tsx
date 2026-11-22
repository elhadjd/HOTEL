import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Button } from "@/components/ui/button";

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div
        className="absolute inset-0 -z-10 bg-cover bg-center"
        style={{
          backgroundImage:
            "linear-gradient(120deg, rgba(11,18,32,0.78), rgba(15,118,110,0.35)), url('https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=2400&q=80')",
        }}
      />
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col justify-end px-6 pb-20 pt-16 md:justify-center md:pb-24">
        <div className="max-w-2xl animate-fade-up text-white">
          <p className="font-ui text-xs uppercase tracking-[0.28em] text-teal-100/90">SIGESC</p>
          <h1 className="mt-3 text-5xl font-semibold leading-tight md:text-6xl">Hotelaria</h1>
          <p className="font-ui mt-5 max-w-xl text-base text-white/85 md:text-lg">
            {t("brand.tagline")}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="bg-white text-ink-900 hover:bg-sand-100">
              <Link href="/login">{t("landing.cta")}</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-white/40 bg-transparent text-white hover:bg-white/10">
              <Link href="/onboarding">{t("landing.secondary")}</Link>
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
