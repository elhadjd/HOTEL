import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Button } from "@/components/ui/button";

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <div className="surface animate-fade-up p-8">
        <p className="font-ui text-xs uppercase tracking-[0.22em] text-stone-400">SIGESC</p>
        <h1 className="mt-2 text-3xl font-semibold text-ink-900">Hotelaria</h1>
        <p className="font-ui mt-2 text-sm text-stone-500">{t("auth.login")}</p>
        <form className="font-ui mt-8 space-y-4" action="/dashboard" method="get">
          <label className="block text-sm">
            <span className="text-stone-500">{t("auth.email")}</span>
            <input
              name="email"
              type="email"
              required
              className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 outline-none ring-teal-500/30 focus:ring-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-stone-500">{t("auth.password")}</span>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              className="mt-1 h-10 w-full rounded-md border border-sand-200 bg-white px-3 outline-none ring-teal-500/30 focus:ring-2"
            />
          </label>
          <Button type="submit" className="w-full">
            {t("auth.login")}
          </Button>
        </form>
        <p className="font-ui mt-6 text-sm text-stone-500">
          <Link className="text-teal-600 underline-offset-2 hover:underline" href="/onboarding">
            {t("auth.onboarding")}
          </Link>
        </p>
      </div>
    </main>
  );
}
