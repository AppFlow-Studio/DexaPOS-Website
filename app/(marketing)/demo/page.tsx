import type { Metadata } from "next";
import MarketingNav from "../_components/MarketingNav";
import MarketingFooter from "../_components/MarketingFooter";
import DemoFrame from "../_components/DemoFrame";

export const metadata: Metadata = {
  title: "Live Demo — DEXA POS",
  description:
    "See DEXA running. The actual point-of-sale interface, in your browser.",
};

export default function DemoPage() {
  return (
    <>
      <MarketingNav current="demo" />

      <section className="page-head">
        <div className="wrap">
          <div className="eyebrow reveal in">Live Demo</div>
          <h1 className="reveal in" style={{ transitionDelay: ".1s" }}>See DEXA. The way your team will.</h1>
          <p className="lede reveal in" style={{ transitionDelay: ".2s" }}>This is the actual DEXA point-of-sale interface, running below in your browser. Tap any tile — Sales, Tables, Kitchen Display, Inventory, Analytics — to see real screens with real data.</p>
        </div>
      </section>

      <section className="demo-section">
        <div className="wrap">
          <DemoFrame />
          <div className="demo-hint">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></svg>
            Tip: try Sales (build an order) → Inventory (see stock levels) → Analytics (revenue by day)
          </div>
        </div>
      </section>

      <section className="annotations">
        <div className="wrap">
          <div className="section-head reveal in">
            <div className="section-eyebrow">What you&apos;re seeing</div>
            <h2 className="section-title">Three things to notice as you click around.</h2>
          </div>

          <div className="ann-grid reveal-stagger in">
            <div className="ann">
              <div className="ann-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="6" width="20" height="13" rx="2" /><path d="M2 11h20" /></svg>
              </div>
              <h3>Two prices on every item</h3>
              <p>Open Sales. Each menu card shows the card price in black and the cash price in green. The order totals carry both through to the receipt — built-in, not an add-on.</p>
            </div>
            <div className="ann">
              <div className="ann-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" /><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" /></svg>
              </div>
              <h3>Inventory tied to the menu</h3>
              <p>Open Inventory. Stock levels update in real time as orders fire. Low-stock and out-of-stock items surface automatically with reorder buttons.</p>
            </div>
            <div className="ann">
              <div className="ann-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 20h18" /><rect x="5" y="10" width="3" height="10" /><rect x="11" y="6" width="3" height="14" /><rect x="17" y="13" width="3" height="7" /></svg>
              </div>
              <h3>Decisions, not just data</h3>
              <p>Open Analytics. Daily revenue, top items, payment mix, channel breakdown — the views your operators actually use to run the business, not generic dashboards.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="cta-strip">
        <div className="wrap">
          <div className="section-eyebrow" style={{ color: "var(--brand-300)", justifyContent: "center" }}>Want the full walkthrough?</div>
          <h2>Better in person.</h2>
          <p>Schedule a 30-minute live demo. We&apos;ll bring DEXA up on real hardware, configure it for your menu, and show you the moments that don&apos;t make it into the demo above.</p>
          <div className="actions">
            <a href="/contact" className="btn btn-primary" style={{ background: "var(--paper)", color: "var(--ink)" }}>
              Request a Demo
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
            </a>
            <a href="/features" className="btn btn-ghost-light">See full features</a>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </>
  );
}
