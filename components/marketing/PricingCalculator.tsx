"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { SectionItem } from "@/lib/cms/cms-sections";

type PriceKey = "additionalLocation" | "tablet" | "kds" | "onlineOrdering" | "loyalty" | "delivery" | "fineDining";
type StepperKey = "locations" | "tablets" | "kds";
type ToggleKey = "onlineOrdering" | "loyalty" | "delivery" | "fineDining";
type CalculatorKey = StepperKey | ToggleKey;
type CalculatorState = Record<StepperKey, number> & Record<ToggleKey, boolean>;

export interface PricingCalculatorSettings {
  prices?: Partial<Record<PriceKey, number>>;
  limits?: Partial<Record<StepperKey, { min?: number; max?: number }>>;
  defaults?: Partial<CalculatorState>;
  groups?: {
    devicesTitle?: string;
    devicesHelp?: string;
    addonsTitle?: string;
    addonsHelp?: string;
  };
  summaryTitle?: string;
  totalLabel?: string;
  emptyText?: string;
  ctaText?: string;
  ctaLink?: string;
  footnote?: string;
  savingsTemplate?: string;
}

// First location is free; each additional location adds a flat merchant fee.
const DEFAULT_PRICE: Record<PriceKey, number> = {
  additionalLocation: 60,
  tablet: 39,
  kds: 29,
  onlineOrdering: 100,
  loyalty: 79,
  delivery: 79,
  fineDining: 30,
};

const DEFAULT_LIMITS: Record<StepperKey, { min: number; max: number }> = {
  locations: { min: 1, max: 20 },
  tablets: { min: 0, max: 30 },
  kds: { min: 0, max: 10 },
};

const DEFAULT_ITEMS: Record<CalculatorKey, { title: string; description: string }> = {
  locations: { title: "Locations", description: "First location free - $60/mo each additional" },
  tablets: { title: "POS Tablets", description: "$39/month each - tableside ordering" },
  kds: { title: "Kitchen Displays", description: "$29/month each - station routing" },
  onlineOrdering: { title: "Online Ordering", description: "$100/month - branded ordering page, no commission" },
  loyalty: { title: "Loyalty Program", description: "$79/month - points, rewards, SMS marketing" },
  delivery: { title: "Delivery App Integration", description: "$79/month - Uber Eats, Grubhub, DoorDash" },
  fineDining: { title: "Fine Dining", description: "$30/month - table mapping, reservations, coursing" },
};

function fmt(n: number) {
  return "$" + n.toLocaleString("en-US");
}

function compute(state: CalculatorState, prices: Record<PriceKey, number>) {
  let total = 0;
  const lines: { label: string; qty: number; sub: number }[] = [];

  // Merchant tier: first location free, +$60/mo per additional location.
  if (state.locations > 1) {
    const extra = state.locations - 1;
    const sub = extra * prices.additionalLocation;
    total += sub;
    lines.push({ label: "Additional locations", qty: extra, sub });
  }
  if (state.tablets > 0) {
    const sub = state.tablets * prices.tablet;
    total += sub;
    lines.push({ label: "POS Tablets", qty: state.tablets, sub });
  }
  if (state.kds > 0) {
    const sub = state.kds * prices.kds;
    total += sub;
    lines.push({ label: "Kitchen Displays", qty: state.kds, sub });
  }
  if (state.onlineOrdering) {
    total += prices.onlineOrdering;
    lines.push({ label: "Online Ordering", qty: 1, sub: prices.onlineOrdering });
  }
  if (state.loyalty) {
    total += prices.loyalty;
    lines.push({ label: "Loyalty Program", qty: 1, sub: prices.loyalty });
  }
  if (state.delivery) {
    total += prices.delivery;
    lines.push({ label: "Delivery Integration", qty: 1, sub: prices.delivery });
  }
  if (state.fineDining) {
    total += prices.fineDining;
    lines.push({ label: "Fine Dining", qty: 1, sub: prices.fineDining });
  }

  return { total, lines };
}

function mergeLimits(settings?: PricingCalculatorSettings) {
  return {
    locations: { ...DEFAULT_LIMITS.locations, ...settings?.limits?.locations },
    tablets: { ...DEFAULT_LIMITS.tablets, ...settings?.limits?.tablets },
    kds: { ...DEFAULT_LIMITS.kds, ...settings?.limits?.kds },
  };
}

function getCalculatorItem(items: SectionItem[], key: CalculatorKey) {
  const item = items.find((candidate) => candidate.link === key);
  return {
    title: item?.title || DEFAULT_ITEMS[key].title,
    description: item?.description || DEFAULT_ITEMS[key].description,
  };
}

export default function PricingCalculator({
  items = [],
  settings,
}: {
  items?: SectionItem[];
  settings?: PricingCalculatorSettings;
}) {
  const prices = { ...DEFAULT_PRICE, ...settings?.prices };
  const limits = mergeLimits(settings);
  const defaults = settings?.defaults || {};

  const [locations, setLocations] = useState(typeof defaults.locations === "number" ? defaults.locations : 1);
  const [tablets, setTablets] = useState(typeof defaults.tablets === "number" ? defaults.tablets : 1);
  const [kds, setKds] = useState(typeof defaults.kds === "number" ? defaults.kds : 1);
  const [onlineOrdering, setOnlineOrdering] = useState(Boolean(defaults.onlineOrdering));
  const [loyalty, setLoyalty] = useState(Boolean(defaults.loyalty));
  const [delivery, setDelivery] = useState(Boolean(defaults.delivery));
  const [fineDining, setFineDining] = useState(Boolean(defaults.fineDining));

  const state: CalculatorState = { locations, tablets, kds, onlineOrdering, loyalty, delivery, fineDining };
  const { total, lines } = compute(state, prices);

  const toastEquiv =
    Math.max(0, state.locations) * 69 +
    Math.max(0, state.locations - 1) * 90 +
    state.tablets * 50 +
    state.kds * 40 +
    (state.onlineOrdering ? 135 : 0) +
    (state.loyalty ? 99 : 0) +
    (state.delivery ? 99 : 0) +
    (state.fineDining ? 60 : 0) +
    (state.locations > 0 ? 200 : 0);

  const savings = Math.max(0, toastEquiv - total);
  const showSavings = savings >= 50;

  const stepper = useCallback(
    (key: StepperKey, delta: number) => {
      const setter = { locations: setLocations, tablets: setTablets, kds: setKds }[key];
      setter((prev) => {
        const next = prev + delta;
        if (next < limits[key].min || next > limits[key].max) return prev;
        return next;
      });
    },
    [limits],
  );

  const deviceRows: { key: StepperKey; value: number }[] = [
    { key: "locations", value: locations },
    { key: "tablets", value: tablets },
    { key: "kds", value: kds },
  ];
  const addonRows: { key: ToggleKey; checked: boolean; setter: (checked: boolean) => void }[] = [
    { key: "onlineOrdering", checked: onlineOrdering, setter: setOnlineOrdering },
    { key: "loyalty", checked: loyalty, setter: setLoyalty },
    { key: "delivery", checked: delivery, setter: setDelivery },
    { key: "fineDining", checked: fineDining, setter: setFineDining },
  ];
  const savingsText = (settings?.savingsTemplate || "Save approx. {amount}/mo vs a comparable Toast setup").replace("{amount}", fmt(savings));

  return (
    <div className="calc-wrap">
      <div className="calc-controls">
        <div className="calc-group">
          <div className="calc-group-head">
            <div className="title">{settings?.groups?.devicesTitle || "Locations & devices"}</div>
            <div className="help">{settings?.groups?.devicesHelp || "Your first location is free"}</div>
          </div>
          {deviceRows.map(({ key, value }) => {
            const item = getCalculatorItem(items, key);
            return (
              <div className="calc-row" key={key}>
                <div className="calc-label">
                  <span className="name">{item.title}</span>
                  <span className="meta">{item.description}</span>
                </div>
                <div className="calc-stepper">
                  <button className="step-btn" onClick={() => stepper(key, -1)} disabled={value <= limits[key].min} aria-label={`Decrease ${item.title}`}>-</button>
                  <span className="step-val">{value}</span>
                  <button className="step-btn" onClick={() => stepper(key, 1)} disabled={value >= limits[key].max} aria-label={`Increase ${item.title}`}>+</button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="calc-group">
          <div className="calc-group-head">
            <div className="title">{settings?.groups?.addonsTitle || "Add-ons"}</div>
            <div className="help">{settings?.groups?.addonsHelp || "Optional - turn on what you need"}</div>
          </div>
          {addonRows.map(({ key, checked, setter }) => {
            const item = getCalculatorItem(items, key);
            return (
              <div className="calc-row" key={key}>
                <div className="calc-label">
                  <span className="name">{item.title}</span>
                  <span className="meta">{item.description}</span>
                </div>
                <label className="calc-toggle">
                  <input type="checkbox" checked={checked} onChange={(e) => setter(e.target.checked)} aria-label={item.title} />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            );
          })}
        </div>
      </div>

      <aside className="calc-summary">
        <div className="summary-title">{settings?.summaryTitle || "Your monthly cost"}</div>
        <ul className="summary-breakdown">
          {lines.length === 0 ? (
            <li className="summary-empty">{settings?.emptyText || "One location, no add-ons - you're on us."}</li>
          ) : (
            lines.map((line, i) => (
              <li className="summary-line" key={i}>
                <span className="lbl">
                  {line.qty > 1 ? <span className="x">{line.qty}x</span> : null}
                  {line.label}
                </span>
                <span className="val">{fmt(line.sub)}</span>
              </li>
            ))
          )}
        </ul>
        <div className="summary-total">
          <div className="row">
            <span className="label">{settings?.totalLabel || "Total / month"}</span>
            <span className="amount">{fmt(total)}<span className="per">/mo</span></span>
          </div>
        </div>
        {showSavings && (
          <div className="summary-savings">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 2v20M5 12h14" /></svg>
            <span>{savingsText}</span>
          </div>
        )}
        <Link href={settings?.ctaLink || "/contact"} className="summary-cta">
          {settings?.ctaText || "Lock this plan in"}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
        </Link>
        <p className="summary-foot">{settings?.footnote || "No setup fees - Cancel anytime - 30-day notice"}</p>
      </aside>
    </div>
  );
}
