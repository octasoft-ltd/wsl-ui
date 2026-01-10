import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PreflightBanner } from "./PreflightBanner";
import { usePreflightStore } from "../store/preflightStore";
import { open } from "@tauri-apps/plugin-shell";

// Mock the store
vi.mock("../store/preflightStore");

// Mock the shell plugin
vi.mock("@tauri-apps/plugin-shell", () => ({
  open: vi.fn(),
}));

describe("PreflightBanner", () => {
  const mockCheckPreflight = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when hasChecked is false", () => {
    vi.mocked(usePreflightStore).mockReturnValue({
      status: null,
      hasChecked: false,
      isReady: false,
      isChecking: false,
      title: "",
      message: "",
      helpUrl: null,
      checkPreflight: mockCheckPreflight,
    });

    const { container } = render(<PreflightBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when WSL is ready", () => {
    vi.mocked(usePreflightStore).mockReturnValue({
      status: { status: "ready" },
      hasChecked: true,
      isReady: true,
      isChecking: false,
      title: "WSL Ready",
      message: "WSL is installed and ready to use.",
      helpUrl: null,
      checkPreflight: mockCheckPreflight,
    });

    const { container } = render(<PreflightBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("renders error banner when WSL is not installed", () => {
    vi.mocked(usePreflightStore).mockReturnValue({
      status: { status: "notInstalled", configuredPath: "C:\\Windows\\System32\\wsl.exe" },
      hasChecked: true,
      isReady: false,
      isChecking: false,
      title: "WSL Not Installed",
      message: "WSL executable not found.",
      helpUrl: "https://learn.microsoft.com/en-us/windows/wsl/install",
      checkPreflight: mockCheckPreflight,
    });

    render(<PreflightBanner />);

    expect(screen.getByText("WSL Not Installed")).toBeInTheDocument();
    expect(screen.getByText("WSL executable not found.")).toBeInTheDocument();
    expect(screen.getByTestId("preflight-banner")).toBeInTheDocument();
  });

  it("renders warning banner for kernel update required", () => {
    vi.mocked(usePreflightStore).mockReturnValue({
      status: { status: "kernelUpdateRequired" },
      hasChecked: true,
      isReady: false,
      isChecking: false,
      title: "WSL Kernel Update Required",
      message: "WSL2 kernel needs to be updated.",
      helpUrl: "https://learn.microsoft.com/en-us/windows/wsl/install#update-to-wsl-2",
      checkPreflight: mockCheckPreflight,
    });

    render(<PreflightBanner />);

    expect(screen.getByText("WSL Kernel Update Required")).toBeInTheDocument();
  });

  it("shows Retry Check button", () => {
    vi.mocked(usePreflightStore).mockReturnValue({
      status: { status: "notInstalled", configuredPath: "wsl.exe" },
      hasChecked: true,
      isReady: false,
      isChecking: false,
      title: "WSL Not Installed",
      message: "WSL not found.",
      helpUrl: "https://example.com",
      checkPreflight: mockCheckPreflight,
    });

    render(<PreflightBanner />);

    expect(screen.getByText("Retry Check")).toBeInTheDocument();
  });

  it("calls checkPreflight when Retry Check is clicked", () => {
    vi.mocked(usePreflightStore).mockReturnValue({
      status: { status: "notInstalled", configuredPath: "wsl.exe" },
      hasChecked: true,
      isReady: false,
      isChecking: false,
      title: "WSL Not Installed",
      message: "WSL not found.",
      helpUrl: "https://example.com",
      checkPreflight: mockCheckPreflight,
    });

    render(<PreflightBanner />);

    fireEvent.click(screen.getByText("Retry Check"));

    expect(mockCheckPreflight).toHaveBeenCalled();
  });

  it("shows loading state on Retry Check button while checking", () => {
    vi.mocked(usePreflightStore).mockReturnValue({
      status: { status: "notInstalled", configuredPath: "wsl.exe" },
      hasChecked: true,
      isReady: false,
      isChecking: true,
      title: "WSL Not Installed",
      message: "WSL not found.",
      helpUrl: "https://example.com",
      checkPreflight: mockCheckPreflight,
    });

    render(<PreflightBanner />);

    const retryButton = screen.getByText("Retry Check").closest("button");
    expect(retryButton).toBeInTheDocument();
  });

  it("shows Learn More button when helpUrl is present", () => {
    vi.mocked(usePreflightStore).mockReturnValue({
      status: { status: "notInstalled", configuredPath: "wsl.exe" },
      hasChecked: true,
      isReady: false,
      isChecking: false,
      title: "WSL Not Installed",
      message: "WSL not found.",
      helpUrl: "https://learn.microsoft.com/en-us/windows/wsl/install",
      checkPreflight: mockCheckPreflight,
    });

    render(<PreflightBanner />);

    expect(screen.getByText("Learn More")).toBeInTheDocument();
  });

  it("opens help URL when Learn More is clicked", () => {
    const helpUrl = "https://learn.microsoft.com/en-us/windows/wsl/install";
    vi.mocked(usePreflightStore).mockReturnValue({
      status: { status: "notInstalled", configuredPath: "wsl.exe" },
      hasChecked: true,
      isReady: false,
      isChecking: false,
      title: "WSL Not Installed",
      message: "WSL not found.",
      helpUrl,
      checkPreflight: mockCheckPreflight,
    });

    render(<PreflightBanner />);

    fireEvent.click(screen.getByText("Learn More"));

    expect(open).toHaveBeenCalledWith(helpUrl);
  });

  it("does not show Learn More button when helpUrl is null", () => {
    vi.mocked(usePreflightStore).mockReturnValue({
      status: { status: "unknown", message: "Some error" },
      hasChecked: true,
      isReady: false,
      isChecking: false,
      title: "WSL Unavailable",
      message: "Some error occurred.",
      helpUrl: null,
      checkPreflight: mockCheckPreflight,
    });

    render(<PreflightBanner />);

    expect(screen.queryByText("Learn More")).not.toBeInTheDocument();
  });

  it("renders error type for featureDisabled status", () => {
    vi.mocked(usePreflightStore).mockReturnValue({
      status: { status: "featureDisabled", errorCode: "0x8007019e" },
      hasChecked: true,
      isReady: false,
      isChecking: false,
      title: "WSL Feature Disabled",
      message: "The Windows Subsystem for Linux feature is not enabled.",
      helpUrl: "https://learn.microsoft.com/en-us/windows/wsl/install",
      checkPreflight: mockCheckPreflight,
    });

    render(<PreflightBanner />);

    expect(screen.getByText("WSL Feature Disabled")).toBeInTheDocument();
    expect(screen.getByTestId("preflight-banner")).toBeInTheDocument();
  });

  it("renders error type for virtualizationDisabled status", () => {
    vi.mocked(usePreflightStore).mockReturnValue({
      status: { status: "virtualizationDisabled", errorCode: "0x80370102" },
      hasChecked: true,
      isReady: false,
      isChecking: false,
      title: "Virtualization Not Enabled",
      message: "Virtual Machine Platform is not enabled.",
      helpUrl: "https://learn.microsoft.com/en-us/windows/wsl/troubleshooting",
      checkPreflight: mockCheckPreflight,
    });

    render(<PreflightBanner />);

    expect(screen.getByText("Virtualization Not Enabled")).toBeInTheDocument();
  });
});
