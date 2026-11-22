import type { AggregateCompany, AggregateOnboardingData, AggregateUser } from "./types";
import { AggregateApiError } from "./types";

/**
 * Official administrator identification rules from Aggregate onboarding docs:
 * - access_level / role.level === "admin" maps to organization owner/administrator
 * - Prefer active users
 * - Prefer users belonging to the key owner company
 * - Deterministic selection when multiple admins exist (lowest numeric id)
 *
 * @see docs/contracts/API_AGGREGATE_ONBOARDING_PARCEIRO.md §4 access_levels
 */
export function isAggregateAdmin(user: AggregateUser): boolean {
  const level = (user.access_level || user.role?.level || "").toLowerCase();
  return level === "admin";
}

export function isRemoteUserActive(user: AggregateUser): boolean {
  return (user.state ?? "active").toLowerCase() === "active";
}

export type IdentifiedAdministrator = {
  user: AggregateUser;
  company: AggregateCompany;
  reason: string;
};

export function identifyAuthorizedAdministrator(
  onboarding: AggregateOnboardingData,
): IdentifiedAdministrator {
  if (!onboarding.companies.length) {
    throw new AggregateApiError("No companies linked to this Aggregate key", 422, 422);
  }

  const ownerCompanyId = onboarding.key.owner_company_id;
  const companies = [...onboarding.companies].sort((a, b) => {
    const aOwner = a.is_owner || a.id === ownerCompanyId ? 0 : 1;
    const bOwner = b.is_owner || b.id === ownerCompanyId ? 0 : 1;
    if (aOwner !== bOwner) return aOwner - bOwner;
    return a.id - b.id;
  });

  const candidates: Array<{ user: AggregateUser; company: AggregateCompany; score: number }> = [];

  for (const company of companies) {
    for (const user of company.users ?? []) {
      if (!isAggregateAdmin(user)) continue;
      if (!user.email?.trim()) continue;
      let score = 0;
      if (isRemoteUserActive(user)) score += 100;
      if (company.id === ownerCompanyId || company.is_owner) score += 50;
      if (user.company_id === ownerCompanyId) score += 25;
      candidates.push({ user, company, score });
    }
  }

  if (candidates.length === 0) {
    throw new AggregateApiError(
      "No authorized SIGESC administrator (access_level=admin) found for this Aggregate key",
      422,
      422,
    );
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.user.id - b.user.id;
  });

  const best = candidates[0]!;
  if (!isRemoteUserActive(best.user)) {
    throw new AggregateApiError(
      "The identified SIGESC administrator account is inactive",
      422,
      422,
    );
  }

  return {
    user: best.user,
    company: best.company,
    reason:
      "Selected active Aggregate user with access_level=admin on the key owner company (official partner mapping)",
  };
}

export function toPublicAdminPreview(admin: AggregateUser) {
  return {
    externalId: admin.external_id || String(admin.id),
    email: admin.email.trim().toLowerCase(),
    fullName:
      admin.full_name?.trim() ||
      [admin.name, admin.surname].filter(Boolean).join(" ").trim() ||
      admin.email,
    accessLevel: admin.access_level,
    state: admin.state ?? "active",
  };
}

export function toPublicCompanyPreview(company: AggregateCompany) {
  return {
    externalId: company.external_id || String(company.id),
    name: company.name,
    email: company.email ?? null,
    nif: company.nif ?? null,
    phone: company.phone ?? null,
    city: company.city ?? null,
    country: company.country ?? null,
    currency: company.currency ?? null,
    timezone: company.timezone ?? null,
    language: company.language ?? null,
    isOwner: Boolean(company.is_owner),
  };
}
