import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LoginForm } from "@/components/auth/login-form";

export default async function LoginPage({
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
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_rgba(15,118,110,0.08),_transparent_55%),linear-gradient(180deg,#f7f5f1_0%,#efe8dc_100%)]"
      />
      <div className="surface animate-fade-up p-8">
        <p className="font-ui text-xs uppercase tracking-[0.22em] text-stone-400">Sistema Central</p>
        <h1 className="mt-2 text-3xl font-semibold text-ink-900">Hotelaria</h1>
        <p className="font-ui mt-2 text-sm text-stone-500">{t("auth.loginSubtitle")}</p>
        <LoginForm
          labels={{
            email: t("auth.email"),
            password: t("auth.password"),
            submit: t("auth.login"),
            forgot: t("auth.forgotPassword"),
            error: t("auth.loginError"),
          }}
        />
        <p className="font-ui mt-6 text-sm text-stone-500">
          <Link className="text-teal-600 underline-offset-2 hover:underline" href="/onboarding">
            {t("auth.onboarding")}
          </Link>
        </p>
      </div>
    </main>
  );
}
