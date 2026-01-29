import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NoRdpDetectedDialog } from "./NoRdpDetectedDialog";

describe("NoRdpDetectedDialog", () => {
  it("renders when open", () => {
    render(
      <NoRdpDetectedDialog isOpen={true} onClose={() => {}} />
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("No Desktop Environment Detected")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(
      <NoRdpDetectedDialog isOpen={false} onClose={() => {}} />
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows xrdp setup message", () => {
    render(
      <NoRdpDetectedDialog isOpen={true} onClose={() => {}} />
    );

    expect(screen.getByText(/couldn't detect xrdp running/)).toBeInTheDocument();
    expect(screen.getByText(/set up a desktop environment and xrdp server/)).toBeInTheDocument();
  });

  it("calls onClose when close button clicked", () => {
    const onClose = vi.fn();
    render(
      <NoRdpDetectedDialog isOpen={true} onClose={onClose} />
    );

    fireEvent.click(screen.getByTestId("dialog-close-button"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Escape key pressed", () => {
    const onClose = vi.fn();
    render(
      <NoRdpDetectedDialog isOpen={true} onClose={onClose} />
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when backdrop clicked", () => {
    const onClose = vi.fn();
    render(
      <NoRdpDetectedDialog isOpen={true} onClose={onClose} />
    );

    // The backdrop is the first child div with the blur class
    const backdrop = document.querySelector(".backdrop-blur-xs");
    expect(backdrop).toBeInTheDocument();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("contains link to blog series with correct URL", () => {
    render(
      <NoRdpDetectedDialog isOpen={true} onClose={() => {}} />
    );

    const link = screen.getByRole("link", { name: /Learn how to set up a Linux desktop/i });
    expect(link).toHaveAttribute(
      "href",
      "https://wsl-ui.octasoft.co.uk/blog/series/wsl2-linux-desktop"
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("has correct test id on dialog", () => {
    render(
      <NoRdpDetectedDialog isOpen={true} onClose={() => {}} />
    );

    expect(screen.getByTestId("no-rdp-detected-dialog")).toBeInTheDocument();
  });

  it("does not call onClose on Escape when dialog is closed", () => {
    const onClose = vi.fn();
    render(
      <NoRdpDetectedDialog isOpen={false} onClose={onClose} />
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});
