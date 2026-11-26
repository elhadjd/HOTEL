import { afterEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_ROLES } from "@/modules/iam/permissions";

const findManyMock = vi.fn();
const ensureInstitutionRolesMock = vi.fn();

vi.mock("@/server/db", () => ({
  prisma: {
    membership: {
      findMany: (...args: unknown[]) => findManyMock(...args),
    },
  },
}));

vi.mock("@/modules/iam/ensure-roles", () => ({
  ensureInstitutionRoles: (...args: unknown[]) => ensureInstitutionRolesMock(...args),
}));

import { resolveTenantContext } from "./tenant";

describe("resolveTenantContext system-role permission self-healing", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("backfills missing system-role permissions (e.g. integrations.invoices.settle) via ensureInstitutionRoles", async () => {
    const receptionistPerms = SYSTEM_ROLES.find((r) => r.code === "receptionist")!.permissions;
    const stalePerms = receptionistPerms.filter((p) => p !== "integrations.invoices.settle");

    findManyMock.mockResolvedValueOnce([
      {
        id: "mem-1",
        institutionId: "inst-1",
        role: {
          code: "receptionist",
          system: true,
          permissions: stalePerms.map((code) => ({ permission: { code } })),
        },
      },
    ]);
    ensureInstitutionRolesMock.mockResolvedValueOnce({});

    const ctx = await resolveTenantContext("user-1", "inst-1");

    expect(ensureInstitutionRolesMock).toHaveBeenCalledTimes(1);
    expect(ensureInstitutionRolesMock).toHaveBeenCalledWith(expect.anything(), "inst-1");
    expect(ctx.permissions).toContain("integrations.invoices.settle");
  });

  it("does not call ensureInstitutionRoles when system-role permissions are already complete", async () => {
    const receptionistPerms = SYSTEM_ROLES.find((r) => r.code === "receptionist")!.permissions;

    findManyMock.mockResolvedValueOnce([
      {
        id: "mem-2",
        institutionId: "inst-2",
        role: {
          code: "receptionist",
          system: true,
          permissions: receptionistPerms.map((code) => ({ permission: { code } })),
        },
      },
    ]);

    const ctx = await resolveTenantContext("user-2", "inst-2");

    expect(ensureInstitutionRolesMock).not.toHaveBeenCalled();
    expect(ctx.permissions).toContain("integrations.invoices.settle");
  });

  it("never alters custom (non-system) roles", async () => {
    findManyMock.mockResolvedValueOnce([
      {
        id: "mem-3",
        institutionId: "inst-3",
        role: {
          code: "receptionist",
          system: false,
          permissions: [{ permission: { code: "dashboard.read" } }],
        },
      },
    ]);

    const ctx = await resolveTenantContext("user-3", "inst-3");

    expect(ensureInstitutionRolesMock).not.toHaveBeenCalled();
    expect(ctx.permissions).toEqual(["dashboard.read"]);
  });
});
