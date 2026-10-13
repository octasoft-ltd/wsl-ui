import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationBanner } from "./NotificationBanner";

describe("NotificationBanner dismissal", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("cancels a pending dismissal when the banner is replaced", () => {
    function Notifications() {
      const [id, setId] = useState(1);
      const [dismissed, setDismissed] = useState(false);
      return <>
        <button onClick={() => setId(2)}>Replace error</button>
        {!dismissed && <NotificationBanner key={id} type="error" title="Error"
          message="Operation failed" onDismiss={() => setDismissed(true)} />}
      </>;
    }
    render(<Notifications />);
    fireEvent.click(screen.getByTestId("notification-dismiss-button"));
    act(() => vi.advanceTimersByTime(100));
    fireEvent.click(screen.getByText("Replace error"));
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByText("Operation failed")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("notification-dismiss-button"));
    act(() => vi.advanceTimersByTime(300));
    expect(screen.queryByText("Operation failed")).not.toBeInTheDocument();
  });
});
