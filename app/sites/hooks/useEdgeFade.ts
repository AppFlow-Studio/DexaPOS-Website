"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Edge-fade for a horizontal scroll strip. Returns a callback ref for the
 * scroller and a CSSProperties mask that fades only the edges that actually have
 * more content:
 *   - no fade on the left until the user has scrolled right (first item stays sharp)
 *   - fade on the right only while there is more to scroll (i.e. content overflows)
 * When nothing overflows, no mask is applied at all.
 *
 * Uses a callback ref (not useRef + useEffect) so it binds correctly even when
 * the scroller mounts lazily — e.g. inside a drawer/modal that opens after the
 * component has already rendered.
 */
export function useEdgeFade(
  fadePx = 32
): { ref: (node: HTMLElement | null) => void; maskStyle: React.CSSProperties } {
  const [edges, setEdges] = useState({ left: false, right: false });
  const cleanupRef = useRef<(() => void) | null>(null);

  const measure = useCallback((el: HTMLElement) => {
    const maxScroll = el.scrollWidth - el.clientWidth;
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft < maxScroll - 1;
    setEdges((prev) =>
      prev.left === left && prev.right === right ? prev : { left, right }
    );
  }, []);

  const ref = useCallback(
    (node: HTMLElement | null) => {
      // Tear down any listeners from a previous node.
      cleanupRef.current?.();
      cleanupRef.current = null;

      if (!node) {
        // Bail if already cleared — returning a fresh object here would change
        // state on every detach, re-render, re-attach the callback ref, and loop.
        setEdges((prev) =>
          !prev.left && !prev.right ? prev : { left: false, right: false }
        );
        return;
      }

      // rAF-throttle so a fast scroll can't queue a setState per scroll event.
      let ticking = false;
      const schedule = () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          measure(node);
          ticking = false;
        });
      };

      node.addEventListener("scroll", schedule, { passive: true });
      const ro = new ResizeObserver(schedule);
      ro.observe(node);
      schedule();

      cleanupRef.current = () => {
        node.removeEventListener("scroll", schedule);
        ro.disconnect();
      };
    },
    [measure]
  );

  const { left, right } = edges;
  if (!left && !right) return { ref, maskStyle: {} };

  const from = left ? "transparent 0" : "#000 0";
  const to = right ? "transparent 100%" : "#000 100%";
  const gradient = `linear-gradient(to right, ${from}, #000 ${fadePx}px, #000 calc(100% - ${fadePx}px), ${to})`;

  return {
    ref,
    maskStyle: { maskImage: gradient, WebkitMaskImage: gradient },
  };
}
