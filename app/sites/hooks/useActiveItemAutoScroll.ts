"use client";

import { useEffect, type RefObject } from "react";

const ACTIVE_ITEM_ATTRIBUTE = "data-auto-scroll-id";

/**
 * Centers the active item inside a horizontal overflow navigation bar.
 * The bar remains manually scrollable and keeps its natural edge alignment;
 * items near either end center only as far as the real scroll range allows.
 */
export function useActiveItemAutoScroll<T extends HTMLElement>(
  containerRef: RefObject<T | null>,
  activeId: string
) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !activeId) return;

    const activeItem = Array.from(
      container.querySelectorAll<HTMLElement>(`[${ACTIVE_ITEM_ATTRIBUTE}]`)
    ).find((item) => item.dataset.autoScrollId === activeId);

    if (!activeItem) return;

    let frameId: number | null = null;
    const centerActiveItem = () => {
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        if (container.scrollWidth <= container.clientWidth + 1) return;

        const containerRect = container.getBoundingClientRect();
        const itemRect = activeItem.getBoundingClientRect();
        const delta =
          itemRect.left +
          itemRect.width / 2 -
          (containerRect.left + containerRect.width / 2);

        if (Math.abs(delta) < 1) return;

        const reduceMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)"
        ).matches;

        container.scrollBy({
          left: delta,
          behavior: reduceMotion ? "auto" : "smooth",
        });
      });
    };

    centerActiveItem();
    const resizeObserver = new ResizeObserver(centerActiveItem);
    resizeObserver.observe(container);
    resizeObserver.observe(activeItem);

    return () => {
      if (frameId !== null) cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
    };
  }, [activeId, containerRef]);
}
