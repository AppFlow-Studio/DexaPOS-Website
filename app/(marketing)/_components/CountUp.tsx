"use client";

import { useEffect, useRef, useState } from "react";

function format(value: number, decimals: number): string {
  if (decimals > 0) return value.toFixed(decimals);
  return Math.round(value).toLocaleString();
}

export default function CountUp({
  value,
  decimals = 0,
  duration = 1400,
}: {
  value: number;
  decimals?: number;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [display, setDisplay] = useState(() => format(value, decimals));
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!ref.current || started) return;
    const el = ref.current;
    setDisplay(format(0, decimals));
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          setStarted(true);
          io.disconnect();
          const start = performance.now();
          const tick = (now: number) => {
            const t = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - t, 3);
            setDisplay(format(value * eased, decimals));
            if (t < 1) requestAnimationFrame(tick);
            else setDisplay(format(value, decimals));
          };
          requestAnimationFrame(tick);
        });
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [value, decimals, duration, started]);

  return <span ref={ref}>{display}</span>;
}
