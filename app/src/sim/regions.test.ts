import { describe, expect, it } from "vitest";
import { copyRegions, isPlaceable, regionId, rtt } from "./regions";

describe("rtt", () => {
  it("is zero within a region and positive across regions", () => {
    expect(rtt("us", "us")).toBe(0);
    expect(rtt("us", "eu")).toBe(85);
    expect(rtt("us", "ap")).toBe(160);
    expect(rtt(undefined, "us")).toBe(0);
  });
});

describe("regionId", () => {
  it("accepts id or label", () => {
    expect(regionId("us")).toBe("us");
    expect(regionId("Europe")).toBe("eu");
    expect(regionId("nope", "ap")).toBe("ap");
  });
});

describe("isPlaceable", () => {
  it("marks servers and stores as placeable, users and CDN as not", () => {
    expect(isPlaceable("server")).toBe(true);
    expect(isPlaceable("database")).toBe(true);
    expect(isPlaceable("user")).toBe(false);
    expect(isPlaceable("cdn")).toBe(false);
  });
});

describe("copyRegions", () => {
  it("collects other replica regions and drops the home region", () => {
    expect(copyRegions({ replicaRegions: ["Europe", "Asia Pacific", "US East"] }, "us")).toEqual(["eu", "ap"]);
    expect(copyRegions({ replicaRegions: ["nope", "eu"] }, "eu")).toEqual([]);
  });
});
