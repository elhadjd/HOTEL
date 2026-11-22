import type { AggregatePort } from "./port";
import { resolveAggregateMode } from "./port";
import { MockAggregateAdapter } from "./mock-adapter";
import { HttpAggregateAdapter } from "./http-adapter";

let singleton: AggregatePort | null = null;

export function getAggregateClient(): AggregatePort {
  if (singleton) return singleton;
  const mode = resolveAggregateMode();
  singleton = mode === "http" ? new HttpAggregateAdapter() : new MockAggregateAdapter();
  return singleton;
}

/** Test helper — reset singleton between cases. */
export function resetAggregateClient(): void {
  singleton = null;
}

export function createAggregateClient(mode: "mock" | "http" = "mock"): AggregatePort {
  return mode === "http" ? new HttpAggregateAdapter() : new MockAggregateAdapter();
}
