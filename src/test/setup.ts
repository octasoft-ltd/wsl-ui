import "@testing-library/jest-dom";
import { vi } from "vitest";

// Mock Tauri APIs for testing
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: vi.fn(),
  open: vi.fn(),
}));

