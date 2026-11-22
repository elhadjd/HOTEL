import { afterEach, describe, expect, it } from "vitest";
import {
  assertMcaKeyFormat,
  decryptAggregateKey,
  encryptAggregateKey,
  keyPrefixFromRaw,
} from "./crypto";

describe("aggregate crypto", () => {
  const prevKey = process.env.AGGREGATE_ENCRYPTION_KEY;

  afterEach(() => {
    process.env.AGGREGATE_ENCRYPTION_KEY = prevKey;
  });

  it("encrypts and decrypts round-trip", () => {
    process.env.AGGREGATE_ENCRYPTION_KEY = "test-aggregate-encryption-key-32chars!!";
    const raw = "mca_mockvalidkeyforonboardingtestsxxxxxx";
    const enc = encryptAggregateKey(raw);
    expect(enc).not.toContain(raw);
    expect(decryptAggregateKey(enc)).toBe(raw);
  });

  it("validates mca key format", () => {
    expect(() => assertMcaKeyFormat("mca_short")).toThrow();
    expect(() => assertMcaKeyFormat("bad_key_xxxxxxxxxxxxxxx")).toThrow();
    expect(() => assertMcaKeyFormat("mca_mockvalidkeyforonboardingtestsxxxxxx")).not.toThrow();
  });

  it("returns non-secret prefix", () => {
    expect(keyPrefixFromRaw("mca_mockvalidkeyforonboardingtestsxxxxxx")).toBe("mca_mockvali");
  });
});
