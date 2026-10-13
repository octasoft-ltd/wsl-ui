import { describe, expect, it, vi } from "vitest";
import { getWebViewRuntimeVersion } from "../../scripts/webview-runtime";

describe("WebView2 runtime detection for desktop E2E", () => {
  it("selects WebView2 when the standalone Edge browser has a newer version", () => {
    const query = vi.fn((key: string) => key.includes("F3017226")
      ? "    pv    REG_SZ    154.0.4258.62\r\n"
      : "    pv    REG_SZ    155.0.4283.45\r\n");
    expect(getWebViewRuntimeVersion(query)).toBe("154.0.4258.62");
  });

  it("falls back to a per-user installation when machine keys are missing", () => {
    const query = vi.fn((key: string) => key.startsWith("HKCU")
      ? "    pv    REG_SZ    154.0.4258.62\r\n" : null);
    expect(getWebViewRuntimeVersion(query)).toBe("154.0.4258.62");
  });

  it("ignores zero and malformed versions and returns null when absent", () => {
    const query = vi.fn().mockReturnValueOnce("pv REG_SZ 0.0.0.0")
      .mockReturnValueOnce("pv REG_SZ broken").mockReturnValue(null);
    expect(getWebViewRuntimeVersion(query)).toBeNull();
  });
});
