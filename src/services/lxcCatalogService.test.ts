import { describe, it, expect } from "vitest";
import { compareVersionsDesc } from "./lxcCatalogService";

// GH #122: parseFloat-based sorting ordered Alpine 3.10 below 3.9, showing the
// oldest release as newest.
describe("compareVersionsDesc", () => {
  it("orders multi-digit minor versions numerically", () => {
    const versions = ["3.9", "3.21", "3.10", "3.20"];
    versions.sort(compareVersionsDesc);
    expect(versions).toEqual(["3.21", "3.20", "3.10", "3.9"]);
  });

  it("orders major versions numerically", () => {
    const versions = ["9", "10", "11"];
    versions.sort(compareVersionsDesc);
    expect(versions).toEqual(["11", "10", "9"]);
  });

  it("keeps ubuntu-style versions in order", () => {
    const versions = ["22.04", "24.04", "20.04"];
    versions.sort(compareVersionsDesc);
    expect(versions).toEqual(["24.04", "22.04", "20.04"]);
  });

  it("falls back to string comparison for non-numeric versions", () => {
    expect(compareVersionsDesc("current", "current")).toBe(0);
    // deterministic ordering either way round
    expect(compareVersionsDesc("edge", "current")).toBe(
      -compareVersionsDesc("current", "edge"),
    );
  });

  it("treats longer versions as newer when prefixes match", () => {
    const versions = ["15", "15.6"];
    versions.sort(compareVersionsDesc);
    expect(versions).toEqual(["15.6", "15"]);
  });
});
