import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export default async function ForgotPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  return (
    <main className="relative mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(165deg,#f7f5f1_0%,#ece4d8_100%)]"
      />
      <div className="surface animate-fade-up p-8">
        <p className="font-ui text-xs uppercase tracking-[0.22em] text-stone-400">SIGESC</p>
        <h1 className="mt-2 text-3xl font-semibold text-ink-900">{t("auth.forgotPassword")}</h1>
        <p className="font-ui mt-2 text-sm text-stone-500">{t("auth.forgotHelp")}</p>
        <ForgotPasswordForm
          labels={{
            email: t("auth.email"),
            submit: t("auth.sendRecovery"),
            success: t("auth.forgotGeneric"),
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
