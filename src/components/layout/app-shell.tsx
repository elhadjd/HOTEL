import { getTranslations } from "next-intl/server";
import { Sidebar } from "./sidebar";
import { TopBar } from "./topbar";
import { APP_NAV } from "./nav-config";

export async function AppShell({
  children,
  title,
  hotelName = "Workspace",
  userName = "Operador",
}: {
  children: React.ReactNode;
  title: string;
  hotelName?: string;
  userName?: string;
}) {
  const t = await getTranslations();
  const labels = Object.fromEntries(APP_NAV.map((item) => [item.labelKey, t(item.labelKey)]));

  return (
    <div className="flex min-h-screen">
      <Sidebar labels={labels} hotelName={hotelName} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          title={title}
          userName={userName}
          searchPlaceholder={t("common.search")}
          localeLabel={t("common.language")}
        />
        <main className="flex-1 px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
