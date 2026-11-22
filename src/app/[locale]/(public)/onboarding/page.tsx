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
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16">
      <div className="surface animate-fade-up p-8">
        <p className="font-ui text-xs uppercase tracking-[0.22em] text-stone-400">SIGESC Aggregate</p>
        <h1 className="mt-2 text-3xl font-semibold text-ink-900">{t("auth.onboarding")}</h1>
        <OnboardingForm
          labels={{
            title: t("auth.onboarding"),
            help: "A chave mca_ é validada no servidor (modo mock por defeito). Nunca é guardada no browser.",
            keyLabel: "Chave Aggregate API",
            submit: t("auth.onboarding"),
            success: "Ligado",
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
