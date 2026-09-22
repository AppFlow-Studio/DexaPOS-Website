// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StorefrontMenu } from "@/types/storefront";
import { MenuBrowser } from "../MenuBrowser";

vi.mock("next/image", () => ({
  default: ({ fill: _fill, alt = "", ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}));

vi.mock("motion/react", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: {
    div: ({
      children,
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & Record<string, unknown>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

vi.mock("../../hooks/useCart", () => ({
  useCart: () => ({
    pendingModalItem: null,
    clearPendingModalItem: vi.fn(),
  }),
}));

vi.mock("../../hooks/useActiveItemAutoScroll", () => ({
  useActiveItemAutoScroll: vi.fn(),
}));

vi.mock("../ItemDetailsModal", () => ({
  ItemDetailsModal: () => null,
}));

class TestResizeObserver {
  observe() {}
  disconnect() {}
}

const menus: StorefrontMenu[] = [
  {
    id: "menu-1",
    name: "Main Menu",
    categories: [
      {
        id: "category-1",
        name: "Coffee Shop",
        display_order: 1,
        items: [
          {
            id: "item-1",
            name: "Test Item",
            description: "A searchable item",
            price: 1,
            cash_price: 1,
            delivery_price: 1,
            image: null,
            availability: true,
          },
        ],
      },
    ],
  },
];

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  vi.stubGlobal("ResizeObserver", TestResizeObserver);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<MenuBrowser menus={menus} />);
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("MenuBrowser search context", () => {
  it("preserves the query when the customer interacts outside search", () => {
    const input = container.querySelector<HTMLInputElement>('input[placeholder="Search menu..."]');
    expect(input).not.toBeNull();
    if (!input) return;

    act(() => type(input, "test"));
    act(() => document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));

    expect(input.value).toBe("test");
  });

  it("holds the browse height while a search has no results", () => {
    const input = container.querySelector<HTMLInputElement>('input[placeholder="Search menu..."]');
    const results = container.querySelector<HTMLElement>('[data-testid="menu-browse-results"]');
    expect(input).not.toBeNull();
    expect(results).not.toBeNull();
    if (!input || !results) return;

    Object.defineProperty(results, "offsetHeight", { configurable: true, value: 840 });
    vi.spyOn(results, "getBoundingClientRect").mockReturnValue({
      bottom: 0,
      height: 840,
      left: 0,
      right: 0,
      top: -120,
      width: 0,
      x: 0,
      y: -120,
      toJSON: () => ({}),
    });
    act(() => type(input, "missing"));

    expect(results.style.minHeight).toBe("840px");
    expect(container.textContent).toContain("No items found");
  });
});
