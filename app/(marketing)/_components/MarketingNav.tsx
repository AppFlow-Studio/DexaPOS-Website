"use client";

import { useState } from "react";
import DexaWordmark from "./DexaWordmark";

export type MarketingNavKey =
  | "home"
  | "demo"
  | "features"
  | "pricing"
  | "why"
  | "hardware"
  | "industries"
  | "contact";

const NAV_ITEMS: { href: string; label: string; key: MarketingNavKey }[] = [
  { href: "/demo", label: "Live Demo", key: "demo" },
  { href: "/features", label: "Features", key: "features" },
  { href: "/pricing", label: "Pricing", key: "pricing" },
  { href: "/why", label: "Why DEXA", key: "why" },
  { href: "/hardware", label: "Hardware", key: "hardware" },
  { href: "/industries", label: "Industries", key: "industries" },
];

export default function MarketingNav({
  current,
}: {
  current?: MarketingNavKey;
}) {
  const [open, setOpen] = useState(false);

  return (
    <nav className="nav">
      <div className="wrap nav-inner">
        <a href="/" className="logo" aria-label="DEXA — home">
          <DexaWordmark />
        </a>

        <ul className={`nav-links${open ? " open" : ""}`}>
          {NAV_ITEMS.map((it) => (
            <li key={it.href}>
              <a
                href={it.href}
                className={it.key === current ? "current" : undefined}
                onClick={() => setOpen(false)}
              >
                {it.label}
              </a>
            </li>
          ))}
        </ul>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <a href="/contact" className="nav-cta">
            Request a Demo
          </a>
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
        </div>
      </div>
    </nav>
  );
}
