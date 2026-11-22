import { afterEach, describe, expect, it } from "vitest";
import { resolveValidatedAggregateHost } from "./host-allowlist";

describe("host allowlist", () => {
  const prevHost = process.env.SIGESC_AGGREGATE_HOST;
  const prevAllowed = process.env.SIGESC_AGGREGATE_ALLOWED_HOSTS;

  afterEach(() => {
    process.env.SIGESC_AGGREGATE_HOST = prevHost;
    process.env.SIGESC_AGGREGATE_ALLOWED_HOSTS = prevAllowed;
  });

  it("accepts allowlisted https host", () => {
    process.env.SIGESC_AGGREGATE_HOST = "https://app.sisgesc.net";
    expect(resolveValidatedAggregateHost()).toBe("https://app.sisgesc.net");
  });

  it("rejects http", () => {
    expect(() => resolveValidatedAggregateHost("http://app.sisgesc.net")).toThrow(/HTTPS/);
  });

  it("rejects unknown host", () => {
    expect(() => resolveValidatedAggregateHost("https://evil.example.com")).toThrow(
      /not allowlisted/,
    );
  });
});
