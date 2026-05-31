"use client";

import { useEffect, useState } from "react";

type NavItem = { href: string; label: string; current?: boolean };

export default function MobileNavToggle({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const close = () => setOpen(false);
    window.addEventListener("resize", close);
    return () => window.removeEventListener("resize", close);
  }, []);

  return (
    <>
      <ul className={`nav-links${open ? " open" : ""}`}>
        {items.map((it) => (
          <li key={it.href}>
            <a
              href={it.href}
              className={it.current ? "current" : undefined}
              onClick={() => setOpen(false)}
            >
              {it.label}
            </a>
          </li>
        ))}
      </ul>
      <button
        className="menu-toggle"
        type="button"
        aria-label="Menu"
        onClick={() => setOpen((v) => !v)}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
        >
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </button>
    </>
  );
}
