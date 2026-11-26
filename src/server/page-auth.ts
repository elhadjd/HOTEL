import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import {
  resolveTenantContext,
  TenantAccessError,
  type TenantContext,
} from "@/modules/tenancy/tenant";

export async function requirePageTenant(permission?: string): Promise<TenantContext> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.mustChangePassword) redirect("/set-password");

  let ctx: TenantContext;
  try {
    ctx = await resolveTenantContext(
      session.user.id,
      typeof session.user.institutionId === "string" ? session.user.institutionId : undefined,
    );
  } catch (err) {
    if (err instanceof TenantAccessError) {
      redirect("/login");
    }
    throw err;
  }

  if (permission && !ctx.permissions.includes(permission)) {
    redirect(`/forbidden?permission=${encodeURIComponent(permission)}`);
  }
  return ctx;
}
