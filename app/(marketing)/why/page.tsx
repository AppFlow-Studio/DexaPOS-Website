import type { Metadata } from "next";
import MarketingNav from "../_components/MarketingNav";
import MarketingFooter from "../_components/MarketingFooter";
import CountUp from "../_components/CountUp";
import Faq from "../_components/Faq";

export const metadata: Metadata = {
  title: "Why DEXA",
  description:
    "How DEXA compares — and the questions operators actually ask before they switch.",
  alternates: { canonical: "/why" },
  openGraph: {
    type: "website",
    siteName: "DEXA POS",
    url: "/why",
    title: "Why DEXA — DEXA POS",
    description:
      "How DEXA compares — and the questions operators actually ask before they switch.",
    images: [
      { url: "/dexalogolight.png", width: 1200, height: 630, alt: "DEXA POS" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Why DEXA — DEXA POS",
    description:
      "How DEXA compares — and the questions operators actually ask before they switch.",
    images: ["/dexalogolight.png"],
  },
};

const FAQ_ITEMS = [
  {
    q: "Is DEXA actually cheaper than Toast or Square?",
    a: (
      <>
        <p>It depends on volume. The DEXA software fee is competitive — but the real savings come from <strong>not paying captive-hardware margin and not paying captive-processor margin.</strong> On $1M+ in card volume per year, the processor difference alone usually pays for the entire DEXA subscription.</p>
        <p>For low-volume single locations, the dollar difference is smaller. For multi-unit operators, it compounds quickly. We&apos;re happy to run the math against your actual statements during the demo.</p>
      </>
    ),
  },
  {
    q: "How long does migration take?",
    a: (
      <>
        <p>For a single-location restaurant, two weeks. For a 5–10 location group, four to six weeks. Our migration team handles menu rebuild, staff PIN setup, hardware provisioning, and one week of on-site coverage during cutover.</p>
        <p><strong>We don&apos;t do &quot;you&apos;re on your own&quot; migrations.</strong> Every DEXA deployment includes white-glove onboarding because a botched migration costs everyone money.</p>
      </>
    ),
  },
  {
    q: "What about my existing payment processor?",
    a: (
      <>
        <p>If your existing processor supports our integrated terminals, keep them. If they don&apos;t, we&apos;ll introduce you to processors who do — typically at rates 15–30 basis points below what bundled-POS operators pay.</p>
        <p>We have no exclusive arrangement with any processor. <strong>We make our money from software, not from a transaction tax.</strong></p>
      </>
    ),
  },
  {
    q: "What happens if my internet goes down?",
    a: (
      <>
        <p>DEXA keeps running. New orders fire to the kitchen. Cash settles. Tables merge. Drawers open. Refunds process under manager PIN. The customer never knows there was an issue.</p>
        <p>When connectivity returns, the queue syncs in the right order. <strong>You won&apos;t lose a transaction to a network outage.</strong></p>
      </>
    ),
  },
  {
    q: "Is there a multi-year contract?",
    a: (
      <>
        <p>No. Software is month-to-month. Hardware you buy outright. There&apos;s no early termination fee, no minimum-volume clause, no automatic renewal that requires 90 days of written notice to escape.</p>
        <p><strong>If we don&apos;t earn your business every month, you don&apos;t owe us next month.</strong></p>
      </>
    ),
  },
  {
    q: "When is DEXA NOT the right fit?",
    a: (
      <>
        <p>Three cases. <strong>One:</strong> very low-volume operations doing under $100K per year — Square&apos;s free tier is genuinely cheaper. <strong>Two:</strong> operators who want zero configuration — DEXA gives you per-station tuning, which means somebody has to make decisions during onboarding. <strong>Three:</strong> operators who specifically want a bundled processor at a markup.</p>
        <p>If any of those describe you, we&apos;ll tell you on the call. We&apos;d rather lose a sale than lose a customer in month four.</p>
      </>
    ),
  },
  {
    q: "Who's actually using DEXA today?",
    a: (
      <>
        <p>Over 1,200 restaurants across the United States. The mix skews toward full-service: coursing-heavy fine dining, multi-unit pizzeria groups, café chains, and bars with complex tab management.</p>
        <p>Largest deployment: 47 locations across two states. <strong>Smallest: a single food truck running offline-first because their commissary&apos;s Wi-Fi is unreliable.</strong> We&apos;re equally happy with both.</p>
      </>
    ),
  },
  {
    q: "What kind of support do you offer after launch?",
    a: (
      <>
        <p>24/7 phone support, US-based. Real humans, no chatbot screening you out before you can speak to someone. Average response time under three minutes for urgent calls during service hours.</p>
        <p>Every account also gets a dedicated onboarding specialist for the first 90 days. <strong>If you have a problem, you have a person.</strong></p>
      </>
    ),
  },
];

const ROWS: { feature: string; dexa: string; toast: string; square: string; clover: string }[] = [
  { feature: "Dual pricing", dexa: "Built in", toast: "Add-on", square: "Workaround", clover: "3rd-party" },
  { feature: "Hardware choice", dexa: "Open", toast: "Toast only", square: "Square only", clover: "Clover only" },
  { feature: "Payment processor", dexa: "Configurable", toast: "Toast Pay", square: "Square only", clover: "Locked" },
  { feature: "Offline mode", dexa: "Full", toast: "Limited", square: "Limited", clover: "Limited" },
  { feature: "Cash audit log", dexa: "Automatic", toast: "Manual", square: "Manual", clover: "Manual" },
  { feature: "Contract length", dexa: "Month-to-month", toast: "2–3 yr", square: "Variable", clover: "Variable" },
  { feature: "Multi-location", dexa: "Unlimited", toast: "Tier-based", square: "Limited", clover: "Per-device" },
];

export default function WhyPage() {
  return (
    <>
      <MarketingNav current="why" />

      <section className="page-head">
        <div className="wrap">
          <div className="eyebrow reveal in">Why DEXA</div>
          <h1 className="reveal in" style={{ transitionDelay: ".1s" }}>Built different. On purpose.</h1>
          <p className="lede reveal in" style={{ transitionDelay: ".2s" }}>No multi-year contracts, no captive hardware, no processor lock-in. Here&apos;s how DEXA stacks up against the platforms most operators evaluate — and the questions they ask before switching.</p>
        </div>
      </section>

      {/* TRUST */}
      <section className="trust">
        <div className="wrap">
          <div className="trust-grid reveal-stagger in">
            <div className="trust-stat">
              <div className="trust-stat-value"><CountUp value={1284} /></div>
              <div className="trust-stat-label">Restaurants on DEXA</div>
            </div>
            <div className="trust-stat">
              <div className="trust-stat-value"><CountUp value={99.99} decimals={2} />%</div>
              <div className="trust-stat-label">Uptime, last 90 days</div>
            </div>
            <div className="trust-stat">
              <div className="trust-stat-value">24<span>/7</span></div>
              <div className="trust-stat-label">US-based support</div>
            </div>
            <div className="trust-stat">
              <div className="trust-stat-value">0<span>-day</span></div>
              <div className="trust-stat-label">Contract minimum</div>
            </div>
          </div>
        </div>
      </section>

      {/* COMPARISON */}
      <section className="comparison">
        <div className="wrap">
          <div className="section-head center reveal in">
            <div className="section-eyebrow">The comparison</div>
            <h2 className="section-title">DEXA vs. the rest.</h2>
            <p className="section-sub">An honest side-by-side. Here&apos;s how DEXA stacks up against the platforms most operators evaluate.</p>
          </div>

          <div className="comp-card reveal in">
            <div className="comp-head-row">
              <h3>Capability comparison</h3>
              <p>The differences operators care about</p>
            </div>

            <div className="comp-table">
              <div className="comp-th feature-col">Capability</div>
              <div className="comp-th dexa-col">DEXA</div>
              <div className="comp-th">Toast</div>
              <div className="comp-th">Square</div>
              <div className="comp-th">Clover</div>

              {ROWS.map((r, i) => {
                const last = i === ROWS.length - 1;
                const rowStyle = last ? { borderBottom: "none" } : undefined;
                return (
                  <div key={r.feature} style={{ display: "contents" }}>
                    <div className="comp-row-feature" style={rowStyle}>{r.feature}</div>
                    <div className="comp-cell" style={rowStyle}>
                      <span style={{ background: "var(--brand-50)", color: "var(--brand-500)", padding: "5px 12px", borderRadius: 6, fontWeight: 600, fontSize: "12.5px" }}>
                        {r.dexa}
                      </span>
                    </div>
                    <div className="comp-cell competitor" style={rowStyle}>{r.toast}</div>
                    <div className="comp-cell competitor" style={rowStyle}>{r.square}</div>
                    <div className="comp-cell competitor" style={rowStyle}>{r.clover}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="faq-section">
        <div className="wrap">
          <div className="section-head center reveal in">
            <div className="section-eyebrow">Common questions</div>
            <h2 className="section-title">The questions operators ask.</h2>
            <p className="section-sub">Honest answers, no marketing spin.</p>
          </div>

          <Faq items={FAQ_ITEMS} />
        </div>
      </section>

      <section className="cta-strip">
        <div className="wrap">
          <div className="section-eyebrow" style={{ color: "var(--brand-300)", justifyContent: "center" }}>Run the math</div>
          <h2>Compare against your current platform.</h2>
          <p>Send us a recent processing statement. We&apos;ll come back with a side-by-side cost breakdown — line by line — within one business day.</p>
          <div className="actions">
            <a href="/contact" className="btn btn-primary" style={{ background: "var(--paper)", color: "var(--ink)" }}>
              Request the comparison
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
            </a>
            <a href="/demo" className="btn btn-ghost-light">Try the demo first</a>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </>
  );
}
