"use client";

import { useState } from "react";

type CompareSwitchProps = {
  /** Labels for the competitor columns, i.e. columns 2..N of the table. */
  competitors: string[];
  /** Palette of the surrounding section. */
  tone?: "dark" | "light";
  label?: string;
  children: React.ReactNode;
};

/**
 * Mobile affordance for the comparison tables.
 *
 * Below the switcher breakpoint (see marketing.css) a 5-column table cannot fit
 * a phone without horizontal scrolling, so the competitor columns collapse to a
 * single selectable column: the reader picks who DEXA is being compared with.
 * Desktop is untouched — the full table still renders, CSS just hides the
 * unselected competitors on small screens.
 *
 * Contract with the CSS: this wrapper carries data-active-col, and every header
 * and body cell of the table passed as children must carry data-col
 * (0 = row label, 1 = DEXA, 2+ = competitors).
 */
export default function CompareSwitch({
  competitors,
  tone = "light",
  label = "Compare DEXA with",
  children,
}: CompareSwitchProps) {
  const [active, setActive] = useState(0);

  // With one competitor there is nothing to switch between, and the table
  // already fits. Render it untouched.
  if (competitors.length < 2) return <>{children}</>;

  return (
    <div className="cmp-switchable" data-active-col={active + 2} data-tone={tone}>
      <div className="cmp-switch" role="group" aria-label={label}>
        <span className="cmp-switch-label">{label}</span>
        <div className="cmp-switch-opts">
          {competitors.map((competitor, i) => (
            <button
              key={`${competitor}-${i}`}
              type="button"
              className="cmp-switch-btn"
              aria-pressed={i === active}
              onClick={() => setActive(i)}
            >
              {competitor}
            </button>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}
