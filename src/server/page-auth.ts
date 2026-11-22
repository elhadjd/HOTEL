import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import {
  assertPermission,
  resolveTenantContext,
  type TenantContext,
} from "@/modules/tenancy/tenant";

export async function requirePageTenant(permission?: string): Promise<TenantContext> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.mustChangePassword) redirect("/set-password");

  const ctx = await resolveTenantContext(
    session.user.id,
    typeof session.user.institutionId === "string" ? session.user.institutionId : undefined,
  );
  if (permission) assertPermission(ctx, permission);
  return ctx;
}
