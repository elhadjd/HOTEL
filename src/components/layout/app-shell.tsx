import { getTranslations } from "next-intl/server";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { isAggregateMockMode } from "@/modules/sigesc-integration/port";
import { Sidebar } from "./sidebar";
import { TopBar } from "./topbar";
import { APP_NAV, APP_NAV_GROUPS } from "./nav-config";

export async function AppShell({
  children,
  title,
  hotelName,
  userName,
}: {
  children: React.ReactNode;
  title: string;
  hotelName?: string;
  userName?: string;
}) {
  const t = await getTranslations();
  const session = await auth();
  const mockMode = isAggregateMockMode();

  let resolvedHotel = hotelName ?? "Workspace";
  let resolvedUser = userName ?? "Operador";

  if (session?.user) {
    resolvedUser = userName ?? session.user.name ?? session.user.email ?? resolvedUser;
    const institutionId = session.user.institutionId;
    if (!hotelName && institutionId) {
      const institution = await prisma.institution.findUnique({
        where: { id: institutionId },
        select: { name: true },
      });
      if (institution?.name) resolvedHotel = institution.name;
    }
  }

  const labels = Object.fromEntries([
    ...APP_NAV.map((item) => [item.labelKey, t(item.labelKey)]),
    ...APP_NAV_GROUPS.map((group) => [group.labelKey, t(group.labelKey)]),
  ]);

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Fixed-height column: sidebar never scrolls with the data list */}
      <Sidebar labels={labels} hotelName={resolvedHotel} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <TopBar
          title={title}
          userName={resolvedUser}
          hotelName={resolvedHotel}
          labels={labels}
          searchPlaceholder={t("common.search")}
          localeLabel={t("common.language")}
        />
        {mockMode ? (
          <div
            role="alert"
            className="font-ui border-b border-amber-300 bg-amber-100 px-4 py-2 text-xs font-medium text-amber-950 lg:px-8"
          >
            MODO SIMULAÇÃO (MOCK): A integração SIGESC está em modo simulado — documentos, clientes
            e produtos NÃO estão a ser enviados ao sistema externo real. Configure{" "}
            <code>SIGESC_AGGREGATE_MODE=http</code> para envio real.
          </div>
        ) : null}
        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1400px] animate-fade-up">{children}</div>
        </main>
      </div>
    </div>
  );
}
