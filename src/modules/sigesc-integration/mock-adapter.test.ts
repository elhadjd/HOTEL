import { describe, expect, it } from "vitest";
import {
  MockAggregateAdapter,
  MOCK_NOSCOPE_MCA_KEY,
  MOCK_REVOKED_MCA_KEY,
  MOCK_VALID_MCA_KEY,
} from "./mock-adapter";
import { AggregateApiError } from "./types";

describe("MockAggregateAdapter", () => {
  const client = new MockAggregateAdapter();

  it("returns onboarding for valid key", async () => {
    const data = await client.fetchOnboarding(MOCK_VALID_MCA_KEY);
    expect(data.companies.length).toBeGreaterThan(0);
    expect(data.key.scopes).toContain("all");
  });

  it("rejects revoked key", async () => {
    await expect(client.fetchOnboarding(MOCK_REVOKED_MCA_KEY)).rejects.toBeInstanceOf(
      AggregateApiError,
    );
  });

  it("rejects missing scope", async () => {
    await expect(client.fetchUsers(MOCK_NOSCOPE_MCA_KEY)).rejects.toMatchObject({
      status: 403,
    });
  });

  it("lists customers scoped to company", async () => {
    const list = await client.listCustomers(MOCK_VALID_MCA_KEY, { company_id: 44 });
    expect(list.success).toBe(true);
    expect(list.data?.every((c) => c.company_id === 44)).toBe(true);
  });
});
