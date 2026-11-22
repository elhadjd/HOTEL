import { afterEach, describe, expect, it } from "vitest";
import { resolveValidatedAggregateHost } from "./host-allowlist";

describe("host allowlist", () => {
  const prevHost = process.env.SIGESC_AGGREGATE_HOST;
  const prevAllowed = process.env.SIGESC_AGGREGATE_ALLOWED_HOSTS;

  afterEach(() => {
    if (prevHost === undefined) delete process.env.SIGESC_AGGREGATE_HOST;
    else process.env.SIGESC_AGGREGATE_HOST = prevHost;
    if (prevAllowed === undefined) delete process.env.SIGESC_AGGREGATE_ALLOWED_HOSTS;
    else process.env.SIGESC_AGGREGATE_ALLOWED_HOSTS = prevAllowed;
  });

  it("accepts allowlisted https host", () => {
    process.env.SIGESC_AGGREGATE_HOST = "https://app.sisgesc.net";
    expect(resolveValidatedAggregateHost()).toBe("https://app.sisgesc.net");
  });

  it("accepts admin.sisgesc.net", () => {
    process.env.SIGESC_AGGREGATE_HOST = "https://admin.sisgesc.net";
    expect(resolveValidatedAggregateHost()).toBe("https://admin.sisgesc.net");
  });

  it("rejects http", () => {
    expect(() => resolveValidatedAggregateHost("http://app.sisgesc.net")).toThrow(/HTTPS/);
  });

  it("rejects unknown host", () => {
    expect(() => resolveValidatedAggregateHost("https://evil.example.com")).toThrow(
      /not allowlisted/,
    );
  });

  it("honours SIGESC_AGGREGATE_ALLOWED_HOSTS override", () => {
    process.env.SIGESC_AGGREGATE_ALLOWED_HOSTS = "custom.example.com";
    expect(resolveValidatedAggregateHost("https://custom.example.com")).toBe(
      "https://custom.example.com",
    );
    expect(() => resolveValidatedAggregateHost("https://admin.sisgesc.net")).toThrow(
      /not allowlisted/,
    );
  });
});
