import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  return (
    <main className="relative mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_rgba(17,26,46,0.08),_transparent_50%),linear-gradient(160deg,#f7f5f1_0%,#e8f5f2_100%)]"
      />
      <div className="surface animate-fade-up p-8">
        <p className="font-ui text-xs uppercase tracking-[0.22em] text-stone-400">API Central</p>
        <h1 className="mt-2 text-3xl font-semibold text-ink-900">{t("auth.onboarding")}</h1>
        <OnboardingForm
          labels={{
            welcome: t("auth.onboardingWelcome"),
            help: t("auth.onboardingHelp"),
            keyLabel: t("auth.apiKey"),
            validate: t("auth.validateKey"),
            confirmTitle: t("auth.confirmTitle"),
            company: t("auth.company"),
            administrator: t("auth.administrator"),
            users: t("auth.usersToImport"),
            confirm: t("auth.confirmCreate"),
            cancel: t("common.cancel"),
            successTitle: t("auth.successTitle"),
            successEmail: t("auth.successEmail"),
            goLogin: t("auth.login"),
            alreadyLinked: t("auth.alreadyLinked"),
          }}
        />
        <p className="font-ui mt-6 text-sm text-stone-500">
          <Link className="text-teal-600 hover:underline" href="/login">
            {t("auth.login")}
          </Link>
        </p>
      </div>
    </main>
  );
}
