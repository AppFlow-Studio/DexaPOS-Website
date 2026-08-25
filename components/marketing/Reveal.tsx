"use client";

import { useEffect, useRef } from "react";

type RevealProps = React.HTMLAttributes<HTMLElement> & {
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /**
   * Element to render. Defaults to "div".
   *
   * Reveal replaces the element it animates rather than wrapping it, so layout
   * classes (grids, figures, headings) keep their position in the parent's
   * layout. Use this instead of nesting a Reveal around a grid — an extra
   * wrapper div would break grid/flex parents.
   */
  as?: "div" | "section" | "figure" | "h1" | "h2" | "p" | "ul" | "li";
};

/**
 * Extra props (notably the CMS `data-cms-*` editing attributes spread in by
 * SectionRenderer) are forwarded to the rendered element — dropping them would
 * silently break the in-place CMS editor.
 */
export function Reveal({ children, className = "", style, as: Tag = "div", ...rest }: RevealProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Reduced motion: reveal immediately, skip the observer entirely.
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      el.classList.add("in");
      return;
    }

    // No IntersectionObserver (old browser): fail visible rather than leaving
    // the element stranded at opacity:0.
    if (typeof IntersectionObserver === "undefined") {
      el.classList.add("in");
      return;
    }

    const reveal = () => {
      el.classList.add("in");
      io.disconnect();
      clearTimeout(failsafe);
    };

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          // threshold:0 — reveal as soon as ANY part of the element is visible.
          // The old `threshold: 0.1` (plus a negative bottom rootMargin) needed
          // 10% of the box inside a shrunken viewport, which short, wide
          // elements like the stats grid could scroll past without ever
          // satisfying — leaving them stuck at opacity:0 (invisible stats).
          if (e.isIntersecting || e.intersectionRatio > 0) reveal();
        });
      },
      { threshold: 0, rootMargin: "0px 0px -40px 0px" },
    );
    io.observe(el);

    // Belt-and-braces: if the observer somehow never fires (element already
    // on-screen at mount, layout shift, tab restored from bfcache), show the
    // content anyway. Invisible text is never an acceptable resting state.
    const failsafe = setTimeout(() => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) reveal();
    }, 1200);

    return () => {
      io.disconnect();
      clearTimeout(failsafe);
    };
  }, []);

  return (
    <Tag ref={ref as React.Ref<never>} className={className} style={style} {...rest}>
      {children}
    </Tag>
  );
}

export default Reveal;
