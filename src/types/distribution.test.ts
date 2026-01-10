import { describe, it, expect } from "vitest";
import { formatBytes } from "./distribution";

describe("formatBytes", () => {
  it("returns 'Unknown' for 0 bytes", () => {
    expect(formatBytes(0)).toBe("Unknown");
  });

  it("formats bytes correctly", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("formats kilobytes correctly", () => {
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("2 KB"); // 1.5 KB rounds to 2
    expect(formatBytes(10240)).toBe("10 KB");
  });

  it("formats megabytes correctly", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(1.5 * 1024 * 1024)).toBe("1.5 MB");
    expect(formatBytes(100 * 1024 * 1024)).toBe("100.0 MB");
  });

  it("formats gigabytes correctly", () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe("1.0 GB");
    expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe("2.5 GB");
    expect(formatBytes(500 * 1024 * 1024 * 1024)).toBe("500.0 GB");
  });

  it("formats terabytes correctly", () => {
    expect(formatBytes(1024 * 1024 * 1024 * 1024)).toBe("1.0 TB");
    expect(formatBytes(1.5 * 1024 * 1024 * 1024 * 1024)).toBe("1.5 TB");
  });

  it("handles edge cases at unit boundaries", () => {
    // Just under 1 KB
    expect(formatBytes(1023)).toBe("1023 B");
    // Exactly 1 KB
    expect(formatBytes(1024)).toBe("1 KB");
    // Just over 1 KB
    expect(formatBytes(1025)).toBe("1 KB");
  });
});





