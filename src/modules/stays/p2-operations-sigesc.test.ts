import { describe, expect, it } from "vitest";
import { deriveHousekeepingRoomStatus } from "@/modules/housekeeping/housekeeping-service";
import { deriveMaintenanceRoomStatus } from "@/modules/maintenance/maintenance-service";

describe("P2 housekeeping room status derivation with multiple open tasks", () => {
  it("marks room CLEAN only when no other open housekeeping tasks remain", () => {
    expect(deriveHousekeepingRoomStatus([])).toBe("CLEAN");
  });

  it("keeps room DIRTY, CLEANING, or INSPECTING when other tasks are still open", () => {
    expect(deriveHousekeepingRoomStatus(["PENDING"])).toBe("DIRTY");
    expect(deriveHousekeepingRoomStatus(["ASSIGNED"])).toBe("DIRTY");
    expect(deriveHousekeepingRoomStatus(["INSPECTION_REQUIRED"])).toBe("INSPECTING");
    expect(deriveHousekeepingRoomStatus(["IN_PROGRESS", "INSPECTION_REQUIRED"])).toBe("CLEANING");
    expect(deriveHousekeepingRoomStatus(["REJECTED", "IN_PROGRESS"])).toBe("DIRTY");
  });
});

describe("P2 maintenance room status derivation (OUT_OF_SERVICE vs UNDER_MAINTENANCE)", () => {
  it("returns OK when no blocking maintenance requests remain", () => {
    expect(deriveMaintenanceRoomStatus([])).toBe("OK");
  });

  it("differentiates CRITICAL outages as OUT_OF_SERVICE and non-critical blocks as UNDER_MAINTENANCE", () => {
    expect(deriveMaintenanceRoomStatus([{ priority: "NORMAL" }])).toBe("UNDER_MAINTENANCE");
    expect(deriveMaintenanceRoomStatus([{ priority: "HIGH" }])).toBe("UNDER_MAINTENANCE");
    expect(
      deriveMaintenanceRoomStatus([{ priority: "NORMAL" }, { priority: "CRITICAL" }]),
    ).toBe("OUT_OF_SERVICE");
  });
});
