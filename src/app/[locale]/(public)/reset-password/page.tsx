import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale } = await params;
  const { token } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations();

  return (
    <main className="relative mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(165deg,#f7f5f1_0%,#e8f0ee_100%)]"
      />
      <div className="surface animate-fade-up p-8">
        <p className="font-ui text-xs uppercase tracking-[0.22em] text-stone-400">SIGESC</p>
        <h1 className="mt-2 text-3xl font-semibold text-ink-900">{t("auth.resetTitle")}</h1>
        {!token ? (
          <p className="font-ui mt-6 text-sm text-danger">{t("auth.resetInvalid")}</p>
        ) : (
          <ResetPasswordForm
            token={token}
            labels={{
              password: t("auth.newPassword"),
              confirm: t("auth.confirmPassword"),
              submit: t("auth.savePassword"),
            }}
          />
        )}
        <p className="font-ui mt-6 text-sm text-stone-500">
          <Link className="text-teal-600 hover:underline" href="/login">
            {t("auth.login")}
          </Link>
        </p>
      </div>
    </main>
  );
}
