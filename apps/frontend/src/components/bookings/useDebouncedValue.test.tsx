import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useDebouncedValue } from "./useDebouncedValue";

function Harness({ value }: { value: string }) {
  return <div>{useDebouncedValue(value, 300)}</div>;
}

describe("useDebouncedValue", () => {
  it("waits for the debounce interval and collapses rapid changes", () => {
    vi.useFakeTimers();
    const view = render(<Harness value="a" />);
    view.rerender(<Harness value="ab" />);
    view.rerender(<Harness value="abc" />);

    expect(screen.getByText("a")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(299));
    expect(screen.getByText("a")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText("abc")).toBeInTheDocument();
    vi.useRealTimers();
  });
});
