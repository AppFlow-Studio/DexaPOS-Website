"use client";

import { useEffect, useRef, useState } from "react";

export default function AnimatedCounter({ value, suffix = "" }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [displayed, setDisplayed] = useState<string>(String(value));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const target = value;
            const dur = 1400;
            const start = performance.now();
            const decimals = (String(target).split(".")[1] || "").length;
            function tick(now: number) {
              const t = Math.min((now - start) / dur, 1);
              const eased = 1 - Math.pow(1 - t, 3);
              const cur = target * eased;
              setDisplayed(decimals ? cur.toFixed(decimals) : Math.round(cur).toLocaleString());
              if (t < 1) requestAnimationFrame(tick);
              else setDisplayed(decimals ? target.toFixed(decimals) : target.toLocaleString());
            }
            requestAnimationFrame(tick);
            io.unobserve(el);
          }
        });
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [value]);

  return <span ref={ref}>{displayed}{suffix}</span>;
}
