import { afterEach, describe, expect, it } from "vitest";

import {
  claimOverlay,
  isOverlayOpen,
  resetOverlayClaimsForTest,
} from "../hooks/overlay-open";

/**
 * The dashboard shell switches itself off while a builder overlay owns the
 * screen. A boolean would have been enough for one overlay and wrong for two:
 * the page editor can open the New Page overlay over itself, and the inner
 * one's unmount would have woken the app up underneath the outer one.
 */
afterEach(() => resetOverlayClaimsForTest());

describe("overlay claims", () => {
  it("is closed until something claims the screen", () => {
    expect(isOverlayOpen()).toBe(false);

    const release = claimOverlay();
    expect(isOverlayOpen()).toBe(true);

    release();
    expect(isOverlayOpen()).toBe(false);
  });

  it("stays open while an outer overlay still holds a claim", () => {
    const outer = claimOverlay();
    const inner = claimOverlay();

    inner();
    // The whole reason this is a counter.
    expect(isOverlayOpen()).toBe(true);

    outer();
    expect(isOverlayOpen()).toBe(false);
  });

  it("ignores a release that has already been used", () => {
    const release = claimOverlay();
    release();
    release();

    // A double-invoked effect in development must not drive the count negative
    // and leave the shell permanently inert.
    expect(isOverlayOpen()).toBe(false);
    const next = claimOverlay();
    expect(isOverlayOpen()).toBe(true);
    next();
  });
});
