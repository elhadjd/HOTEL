import type { AggregatePort } from "./port";
import { resolveAggregateMode } from "./port";
import { resolveValidatedAggregateHost } from "./host-allowlist";
import { MockAggregateAdapter } from "./mock-adapter";
import { HttpAggregateAdapter } from "./http-adapter";

let mockSingleton: AggregatePort | null = null;
const httpByHost = new Map<string, HttpAggregateAdapter>();

export function getAggregateClient(host?: string): AggregatePort {
  const mode = resolveAggregateMode();
  if (mode === "mock") {
    if (!mockSingleton) mockSingleton = new MockAggregateAdapter();
    return mockSingleton;
  }
  const validatedHost = resolveValidatedAggregateHost(host);
  let adapter = httpByHost.get(validatedHost);
  if (!adapter) {
    adapter = new HttpAggregateAdapter(validatedHost);
    httpByHost.set(validatedHost, adapter);
  }
  return adapter;
}

/** Test helper — reset singletons between cases. */
export function resetAggregateClient(): void {
  mockSingleton = null;
  httpByHost.clear();
}

export function createAggregateClient(
  mode: "mock" | "http" = "mock",
  host?: string,
): AggregatePort {
  return mode === "http" ? new HttpAggregateAdapter(host) : new MockAggregateAdapter();
}
