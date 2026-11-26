import { getTranslations } from "next-intl/server";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db";
import { resolveTenantContext } from "@/modules/tenancy/tenant";
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

  let resolvedHotel = hotelName ?? "Hotelaria";
  let resolvedUser = userName ?? "Operador";
  let permissions: string[] | undefined;

  if (session?.user?.id) {
    resolvedUser = userName ?? session.user.name ?? session.user.email ?? resolvedUser;
    const institutionId = session.user.institutionId;

    const [institution, tenantCtx] = await Promise.all([
      !hotelName && institutionId
        ? prisma.institution.findUnique({
            where: { id: institutionId },
            select: { name: true },
          })
        : Promise.resolve(null),
      resolveTenantContext(
        session.user.id,
        typeof institutionId === "string" ? institutionId : undefined,
      ).catch(() => null),
    ]);

    if (institution?.name) resolvedHotel = institution.name;
    if (tenantCtx) permissions = tenantCtx.permissions;
  }

  const labels = Object.fromEntries([
    ...APP_NAV.map((item) => [item.labelKey, t(item.labelKey)]),
    ...APP_NAV_GROUPS.map((group) => [group.labelKey, t(group.labelKey)]),
  ]);

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Fixed-height column: sidebar never scrolls with the data list */}
      <Sidebar labels={labels} hotelName={resolvedHotel} permissions={permissions} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <TopBar
          title={title}
          userName={resolvedUser}
          hotelName={resolvedHotel}
          labels={labels}
          permissions={permissions}
          searchPlaceholder={t("common.search")}
          localeLabel={t("common.language")}
        />
        {mockMode ? (
          <div
            role="alert"
            className="font-ui border-b border-amber-300 bg-amber-100 px-4 py-2 text-xs font-medium text-amber-950 lg:px-8"
          >
            MODO SIMULAÇÃO: A ligação ao sistema central está em modo simulado — documentos,
            clientes e produtos não estão a ser enviados ao servidor externo real.
          </div>
        ) : null}
        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1400px] animate-fade-up">{children}</div>
        </main>
      </div>
    </div>
  );
}
