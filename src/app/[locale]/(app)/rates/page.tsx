import { ModulePage } from "@/components/layout/module-page";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <ModulePage locale={locale} navKey="nav.rates" />;
}
