"use client";

import { useEffect, useRef, useState } from "react";

const PRICE = {
  firstStation: 99,
  addlStation: 49,
  tablet: 39,
  kds: 29,
  onlineOrdering: 100,
  loyalty: 79,
  delivery: 79,
  franchise: 399,
};

const LIMITS = {
  stations: { min: 1, max: 20 },
  tablets: { min: 0, max: 30 },
  kds: { min: 0, max: 10 },
} as const;

type CountKey = keyof typeof LIMITS;
type ToggleKey = "onlineOrdering" | "loyalty" | "delivery" | "franchise";

type State = Record<CountKey, number> & Record<ToggleKey, boolean>;

type Line = { label: string; qty: number; sub: number };

function fmt(n: number) {
  return "$" + n.toLocaleString("en-US");
}

function compute(state: State): { total: number; lines: Line[] } {
  let total = 0;
  const lines: Line[] = [];

  if (state.stations >= 1) {
    total += PRICE.firstStation;
    lines.push({ label: "First POS station", qty: 1, sub: PRICE.firstStation });
    if (state.stations > 1) {
      const extra = state.stations - 1;
      const sub = extra * PRICE.addlStation;
      total += sub;
      lines.push({ label: "Additional stations", qty: extra, sub });
    }
  }
  if (state.tablets > 0) {
    const sub = state.tablets * PRICE.tablet;
    total += sub;
    lines.push({ label: "POS Tablets", qty: state.tablets, sub });
  }
  if (state.kds > 0) {
    const sub = state.kds * PRICE.kds;
    total += sub;
    lines.push({ label: "Kitchen Displays", qty: state.kds, sub });
  }
  if (state.onlineOrdering) { total += PRICE.onlineOrdering; lines.push({ label: "Online Ordering", qty: 1, sub: PRICE.onlineOrdering }); }
  if (state.loyalty) { total += PRICE.loyalty; lines.push({ label: "Loyalty Program", qty: 1, sub: PRICE.loyalty }); }
  if (state.delivery) { total += PRICE.delivery; lines.push({ label: "Delivery Integration", qty: 1, sub: PRICE.delivery }); }
  if (state.franchise) { total += PRICE.franchise; lines.push({ label: "Franchise Package", qty: 1, sub: PRICE.franchise }); }

  return { total, lines };
}

function savingsVsToast(state: State, total: number): number {
  const toastEquiv =
    (state.stations === 0 ? 0 : 69 + Math.max(0, state.stations - 1) * 55) +
    state.tablets * 50 +
    state.kds * 40 +
    (state.onlineOrdering ? 135 : 0) +
    (state.loyalty ? 99 : 0) +
    (state.delivery ? 99 : 0) +
    (state.franchise ? 450 : 0) +
    (state.stations > 0 ? 200 : 0) + // processor markup
    (state.stations > 0 ? 60 * state.stations : 0); // hardware lease
  return Math.max(0, toastEquiv - total);
}

export default function PricingCalculator() {
  const [state, setState] = useState<State>({
    stations: 1,
    tablets: 1,
    kds: 1,
    onlineOrdering: false,
    loyalty: false,
    delivery: false,
    franchise: false,
  });

  const { total, lines } = compute(state);
  const savings = savingsVsToast(state, total);

  // Total "bump" pulse on change (skips first mount).
  const [bump, setBump] = useState(false);
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    setBump(true);
    const t = setTimeout(() => setBump(false), 220);
    return () => clearTimeout(t);
  }, [total]);

  function step(key: CountKey, delta: number) {
    setState((s) => {
      const next = s[key] + delta;
      if (next < LIMITS[key].min || next > LIMITS[key].max) return s;
      return { ...s, [key]: next };
    });
  }

  function toggle(key: ToggleKey, checked: boolean) {
    setState((s) => ({ ...s, [key]: checked }));
  }

  const counters: { key: CountKey; name: string; meta: string }[] = [
    { key: "stations", name: "POS Stations", meta: "$99 first · $49 each additional" },
    { key: "tablets", name: "POS Tablets", meta: "$39/month each · tableside ordering" },
    { key: "kds", name: "Kitchen Displays", meta: "$29/month each · station routing" },
  ];

  const toggles: { key: ToggleKey; name: string; meta: string }[] = [
    { key: "onlineOrdering", name: "Online Ordering", meta: "$100/month · branded ordering page, no commission" },
    { key: "loyalty", name: "Loyalty Program", meta: "$79/month · points, rewards, SMS marketing" },
    { key: "delivery", name: "Delivery App Integration", meta: "$79/month · Uber Eats, Grubhub, DoorDash" },
    { key: "franchise", name: "Franchise Package", meta: "$399/month · multi-location tools, royalty calcs" },
  ];

  return (
    <div className="calc-wrap reveal in">
      {/* Controls */}
      <div className="calc-controls">
        <div className="calc-group">
          <div className="calc-group-head">
            <div className="title">Stations &amp; tablets</div>
            <div className="help">How many devices on your floor</div>
          </div>
          {counters.map((c) => (
            <div className="calc-row" key={c.key}>
              <div className="calc-label">
                <span className="name">{c.name}</span>
                <span className="meta">{c.meta}</span>
              </div>
              <div className="calc-stepper">
                <button
                  className="step-btn"
                  type="button"
                  aria-label="Decrease"
                  disabled={state[c.key] <= LIMITS[c.key].min}
                  onClick={() => step(c.key, -1)}
                >
                  −
                </button>
                <span className="step-val">{state[c.key]}</span>
                <button
                  className="step-btn"
                  type="button"
                  aria-label="Increase"
                  disabled={state[c.key] >= LIMITS[c.key].max}
                  onClick={() => step(c.key, 1)}
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="calc-group">
          <div className="calc-group-head">
            <div className="title">Add-ons</div>
            <div className="help">Optional · turn on what you need</div>
          </div>
          {toggles.map((t) => (
            <div className="calc-row" key={t.key}>
              <div className="calc-label">
                <span className="name">{t.name}</span>
                <span className="meta">{t.meta}</span>
              </div>
              <label className="calc-toggle">
                <input
                  type="checkbox"
                  checked={state[t.key]}
                  onChange={(e) => toggle(t.key, e.target.checked)}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Summary */}
      <aside className="calc-summary">
        <div className="summary-title">Your monthly cost</div>
        <ul className="summary-breakdown">
          {lines.length === 0 ? (
            <li className="summary-empty">Add at least one station to start.</li>
          ) : (
            lines.map((l) => (
              <li className="summary-line" key={l.label}>
                <span className="lbl">
                  {l.qty > 1 ? <span className="x">{l.qty}×</span> : null}
                  {l.label}
                </span>
                <span className="val">{fmt(l.sub)}</span>
              </li>
            ))
          )}
        </ul>
        <div className="summary-total">
          <div className="row">
            <span className="label">Total / month</span>
            <span className={`amount${bump ? " bump" : ""}`}>
              {fmt(total)}
              <span className="per">/mo</span>
            </span>
          </div>
        </div>
        <div className="summary-savings" style={{ display: savings >= 50 ? "flex" : "none" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 2v20M5 12h14" /></svg>
          <span>{savings >= 50 ? `Save approx. ${fmt(savings)}/mo vs a comparable Toast setup` : ""}</span>
        </div>
        <a href="/contact" className="summary-cta">
          Lock this plan in
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
        </a>
        <p className="summary-foot">No setup fees · Cancel anytime · 30-day notice</p>
      </aside>
    </div>
  );
}
