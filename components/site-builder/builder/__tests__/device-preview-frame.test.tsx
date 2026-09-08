// @vitest-environment happy-dom

import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DevicePreviewFrame from "../DevicePreviewFrame";

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

class TestResizeObserver {
  observe() {}
  disconnect() {}
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("ResizeObserver", TestResizeObserver);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("device preview frame", () => {
  it("portals the current canvas into a phone-sized iframe", () => {
    const hostRef = createRef<HTMLDivElement>();
    const onClick = vi.fn();

    act(() => {
      root.render(
        <DevicePreviewFrame device="mobile" hostRef={hostRef} onClick={onClick}>
          <button type="button">Reserve</button>
        </DevicePreviewFrame>,
      );
    });

    const frame = container.querySelector("iframe");
    expect(frame).not.toBeNull();
    expect(frame!.title).toBe("Phone website preview");
    expect(frame!.style.width).toBe("390px");
    expect(frame!.style.height).toBe("844px");

    act(() => frame!.dispatchEvent(new Event("load")));

    const button = frame!.contentDocument?.querySelector("button");
    expect(button?.textContent).toBe("Reserve");
    expect(hostRef.current?.ownerDocument).toBe(frame!.contentDocument);

    act(() => button!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
