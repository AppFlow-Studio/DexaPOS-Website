/** @vitest-environment happy-dom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
  default: ({ src, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img src={typeof src === "string" ? src : undefined} {...props} />
  ),
}));

const { HqBrandMark, resolveHqLogoSource } = await import("../HqBrandMark");

describe("HqBrandMark", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("replaces a failed HQ image with the shield fallback", () => {
    act(() => {
      root.render(
        <HqBrandMark
          imageUrl="https://cdn.example.test/missing.png"
          organizationName="Dexa POS HQ"
        />,
      );
    });

    const image = container.querySelector("img");
    expect(image).not.toBeNull();

    act(() => {
      image?.dispatchEvent(new Event("error"));
    });

    expect(container.querySelector("img")).toBeNull();
    expect(
      container.querySelector('[aria-label="Dexa POS HQ logo fallback"]'),
    ).not.toBeNull();
  });

  it("rejects malformed and non-web image sources", () => {
    expect(resolveHqLogoSource("not a URL")).toBeNull();
    expect(resolveHqLogoSource("javascript:alert(1)")).toBeNull();
    expect(resolveHqLogoSource("//untrusted.example/logo.png")).toBeNull();
    expect(resolveHqLogoSource(" /brand/dexa.svg ")).toBe("/brand/dexa.svg");
  });
});
