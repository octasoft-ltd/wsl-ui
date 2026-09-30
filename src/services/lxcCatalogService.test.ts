import { describe, it, expect, vi } from "vitest";
import { compareVersionsDesc, lxcCatalogService } from "./lxcCatalogService";
import { DEFAULT_DISTRIBUTION_SOURCE_SETTINGS } from "../types/lxcCatalog";

it("invalidates the catalog when filters, mirror or cache duration change", async () => {
  localStorage.clear();
  const product = (release: string) => ({ os: "alpine", release, arch: "amd64", versions: {
    latest: { items: { "rootfs.tar.xz": { path: `${release}/rootfs.tar.xz`, size: 100 } } },
  } });
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ products: {
    "alpine:3.22:amd64:default": product("3.22"), "alpine:edge:amd64:default": product("edge"),
  } }) });
  vi.stubGlobal("fetch", fetchMock);
  try {
    const config = { ...DEFAULT_DISTRIBUTION_SOURCE_SETTINGS, showUnstableReleases: false };
    expect((await lxcCatalogService.fetchCatalog(config)).distributions).toHaveLength(1);
    await lxcCatalogService.fetchCatalog(config);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await lxcCatalogService.fetchCatalog({ ...config, showUnstableReleases: true })).distributions).toHaveLength(2);
    const mirror = { ...config, lxcBaseUrl: "https://mirror.example.test" };
    const result = await lxcCatalogService.fetchCatalog(mirror);
    expect(result.distributions[0].downloadUrl).toMatch(/^https:\/\/mirror.example.test\//);
    await lxcCatalogService.fetchCatalog({ ...mirror, cacheDurationHours: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  } finally { vi.unstubAllGlobals(); localStorage.clear(); }
});

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
