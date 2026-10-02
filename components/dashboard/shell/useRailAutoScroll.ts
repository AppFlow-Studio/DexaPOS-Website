'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Keeps the active pill of a horizontally scrolling tab rail centred in view
 * (UI-DESIGN-SYSTEM §13.2, D-24). Returns a callback ref for the scrolling
 * element; each trigger inside it carries `data-tab-value={value}`.
 *
 * - Scrolls the rail itself with `scrollTo`, clamped to its range, never
 *   `scrollIntoView`, which also scrolls every scrollable ancestor.
 * - Measures through a `ResizeObserver`: on a cold load the rail is not at its
 *   final width when the effect first runs, so a one-shot measurement found the
 *   tab "already in view" and never scrolled.
 * - A callback ref, so a rail that mounts late (after a loading state) is
 *   still picked up.
 * - The first positioning is instant, so a deep-linked tab is already in place;
 *   later tab changes animate, unless the user prefers reduced motion.
 *
 * Pair it with `no-scrollbar` on the rail so the bar stays invisible.
 */
export function useRailAutoScroll<T extends HTMLElement = HTMLDivElement>(activeValue: string) {
  const [rail, setRail] = useState<T | null>(null)
  const hasPositioned = useRef(false)

  useEffect(() => {
    if (!rail) return

    let aligned = false
    const align = () => {
      const maxScroll = rail.scrollWidth - rail.clientWidth
      if (aligned || maxScroll <= 0) return
      const tab = rail.querySelector<HTMLElement>(`[data-tab-value="${CSS.escape(activeValue)}"]`)
      if (!tab) return

      // The tab's position inside the rail's scrollable content, from rects
      // plus the current scroll. Unlike `offsetLeft`, this does not depend on
      // the rail being the tab's positioned ancestor.
      const tabLeft =
        tab.getBoundingClientRect().left - rail.getBoundingClientRect().left + rail.scrollLeft
      const target = tabLeft - (rail.clientWidth - tab.offsetWidth) / 2
      const smooth =
        hasPositioned.current && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      rail.scrollTo({
        left: Math.max(0, Math.min(target, maxScroll)),
        behavior: smooth ? 'smooth' : 'auto',
      })
      aligned = true
      hasPositioned.current = true
    }

    align()
    const observer = new ResizeObserver(align)
    observer.observe(rail)
    return () => observer.disconnect()
  }, [rail, activeValue])

  return setRail
}
