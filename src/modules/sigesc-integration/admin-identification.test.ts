import { describe, expect, it } from "vitest";
import {
  identifyAuthorizedAdministrator,
  isAggregateAdmin,
} from "./admin-identification";
import { MOCK_AGGREGATE_FIXTURE } from "./mock-adapter";
import type { AggregateOnboardingData } from "./types";
import { AggregateApiError } from "./types";

describe("official administrator identification", () => {
  it("selects active access_level=admin on owner company", () => {
    const result = identifyAuthorizedAdministrator(MOCK_AGGREGATE_FIXTURE);
    expect(result.user.email).toBe("sofia@baia.ao");
    expect(isAggregateAdmin(result.user)).toBe(true);
    expect(result.company.is_owner).toBe(true);
  });

  it("rejects when no admin exists", () => {
    const data: AggregateOnboardingData = {
      ...MOCK_AGGREGATE_FIXTURE,
      companies: [
        {
          ...MOCK_AGGREGATE_FIXTURE.companies[0]!,
          users: MOCK_AGGREGATE_FIXTURE.companies[0]!.users!.filter(
            (u) => u.access_level !== "admin",
          ),
        },
      ],
    };
    expect(() => identifyAuthorizedAdministrator(data)).toThrow(AggregateApiError);
  });

  it("rejects inactive admin even if only candidate", () => {
    const data: AggregateOnboardingData = {
      ...MOCK_AGGREGATE_FIXTURE,
      companies: [
        {
          ...MOCK_AGGREGATE_FIXTURE.companies[0]!,
          users: [
            {
              ...MOCK_AGGREGATE_FIXTURE.companies[0]!.users![0]!,
              state: "inactive",
            },
          ],
        },
      ],
    };
    expect(() => identifyAuthorizedAdministrator(data)).toThrow(/inactive/i);
  });

  it("picks lowest id when multiple equal-score admins", () => {
    const base = MOCK_AGGREGATE_FIXTURE.companies[0]!;
    const data: AggregateOnboardingData = {
      ...MOCK_AGGREGATE_FIXTURE,
      companies: [
        {
          ...base,
          users: [
            {
              id: 500,
              external_id: "500",
              company_id: 44,
              name: "B",
              surname: "Admin",
              full_name: "B Admin",
              email: "b@baia.ao",
              state: "active",
              access_level: "admin",
            },
            {
              id: 100,
              external_id: "100",
              company_id: 44,
              name: "A",
              surname: "Admin",
              full_name: "A Admin",
              email: "a@baia.ao",
              state: "active",
              access_level: "admin",
            },
          ],
        },
      ],
    };
    const result = identifyAuthorizedAdministrator(data);
    expect(result.user.id).toBe(100);
  });
});
