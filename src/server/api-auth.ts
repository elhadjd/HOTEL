import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import {
  assertPermission,
  resolveTenantContext,
  TenantAccessError,
  type TenantContext,
} from "@/modules/tenancy/tenant";

export async function requireTenant(permission?: string): Promise<
  | { ok: true; ctx: TenantContext }
  | { ok: false; response: NextResponse }
> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (session.user.mustChangePassword) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Password change required" }, { status: 403 }),
    };
  }

  try {
    const ctx = await resolveTenantContext(
      session.user.id,
      typeof session.user.institutionId === "string" ? session.user.institutionId : undefined,
    );
    if (permission) assertPermission(ctx, permission);
    return { ok: true, ctx };
  } catch (err) {
    if (err instanceof TenantAccessError) {
      return { ok: false, response: NextResponse.json({ error: err.message }, { status: 403 }) };
    }
    throw err;
  }
}

export function jsonError(err: unknown, fallback = "Request failed") {
  if (err instanceof TenantAccessError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  const message = err instanceof Error ? err.message : fallback;
  const status = /not found/i.test(message)
    ? 404
    : /conflict|overlap|unavailable/i.test(message)
      ? 409
      : /invalid|required|must/i.test(message)
        ? 400
        : 500;
  return NextResponse.json({ error: message }, { status });
}
