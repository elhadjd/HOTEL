import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { auth } from "@/server/auth";
import { SetPasswordForm } from "@/components/auth/set-password-form";

export default async function SetPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  if (!session.user.mustChangePassword) {
    redirect("/dashboard");
  }

  const t = await getTranslations();

  return (
    <main className="relative mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(180deg,#f7f5f1_0%,#e7f0ee_100%)]"
      />
      <div className="surface animate-fade-up p-8">
        <p className="font-ui text-xs uppercase tracking-[0.22em] text-stone-400">SIGESC</p>
        <h1 className="mt-2 text-3xl font-semibold text-ink-900">{t("auth.setPasswordTitle")}</h1>
        <SetPasswordForm
          labels={{
            password: t("auth.newPassword"),
            confirm: t("auth.confirmPassword"),
            submit: t("auth.savePassword"),
            help: t("auth.setPasswordHelp"),
          }}
        />
      </div>
    </main>
  );
}
