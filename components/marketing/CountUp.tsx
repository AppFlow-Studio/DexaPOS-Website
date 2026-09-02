"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Scroll-triggered count-up for CMS-authored stat strings.
 *
 * Unlike AnimatedCounter (which takes a number), this accepts the raw string
 * straight out of the CMS — "1,284", "99.99", "48.2" — and animates to it while
 * preserving the authored formatting: thousands separators and decimal places
 * are reproduced exactly, so the final rendered text matches what the editor
 * typed.
 *
 * Fails safe: if the string has no parsable number, if the browser has no
 * IntersectionObserver, or if the visitor prefers reduced motion, the final
 * value is rendered immediately. It never renders a placeholder or an empty
 * span.
 */
/**
 * Whether a parsed stat value is a quantity worth counting up to.
 *
 * Ratios like "24/7" are not quantities — animating them reads as "1/7", "2/7",
 * which is wrong. A target of 0 ("0-day") has no motion to show. Both render
 * static instead.
 */
function isCountable(value: string, suffix: string) {
  if (suffix.trimStart().startsWith("/")) return false;
  const n = Number(value.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0;
}

export default function CountUp({
  value,
  suffix = "",
  className,
}: {
  value: string;
  /** The stat's trailing text, used only to detect ratios like "24/7". */
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  // Always start from the real value so SSR/no-JS output is correct.
  const [displayed, setDisplayed] = useState<string>(value);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (!isCountable(value, suffix)) return;
    const target = Number(value.replace(/,/g, ""));

    // Reduced motion, or no IntersectionObserver: leave the value as-is. State
    // is already initialised to `value`, so there is nothing to set — the final
    // number is what renders.
    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced || typeof IntersectionObserver === "undefined") return;

    // Mirror the authored formatting.
    const decimals = (value.split(".")[1] || "").length;
    const grouped = value.includes(",");
    const format = (n: number) => {
      // Clamp: easing can land a hair below zero (and -0 formats as "-0"),
      // which briefly rendered values like "-47" and "-1/7" mid-animation.
      const safe = n <= 0 ? 0 : n;
      const fixed = safe.toFixed(decimals);
      if (!grouped) return fixed;
      const [whole, frac] = fixed.split(".");
      const withCommas = Number(whole).toLocaleString("en-US");
      return frac ? `${withCommas}.${frac}` : withCommas;
    };

    let raf = 0;
    const DUR = 1400;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const start = performance.now();
          const tick = (now: number) => {
            // Clamp low as well as high: the rAF timestamp is the frame start
            // time and can precede the performance.now() captured above, which
            // made t negative on the first frame and briefly rendered negative
            // values ("-47" counting up to 1,284).
            const t = Math.min(Math.max((now - start) / DUR, 0), 1);
            const eased = 1 - Math.pow(1 - t, 3);
            setDisplayed(format(target * eased));
            if (t < 1) raf = requestAnimationFrame(tick);
            else setDisplayed(value); // land exactly on the authored string
          };
          raf = requestAnimationFrame(tick);
          io.unobserve(entry.target);
        });
      },
      // threshold:0.25 rather than 0.4 — short, wide stat rows can scroll into
      // view without ever exposing 40% of their box, which silently skipped the
      // count-up entirely.
      { threshold: 0.25 },
    );
    io.observe(el);

    return () => {
      io.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [value, suffix]);

  return (
    <span ref={ref} className={className}>
      {displayed}
    </span>
  );
}
