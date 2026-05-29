import type { Metadata } from "next";
import MarketingNav from "../_components/MarketingNav";
import MarketingFooter from "../_components/MarketingFooter";

export const metadata: Metadata = {
  title: "Industries — DEXA POS",
  description: "DEXA configures itself for eight different restaurant concepts.",
};

const INDUSTRIES: { img: string; title: string; desc: string; pills: string[] }[] = [
  {
    img: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=80",
    title: "Quick-Service",
    desc: "Built for speed. Counter-first ordering, two-tap modifiers, fast-pay integration. Average ticket time under 90 seconds.",
    pills: ["Counter-first UI", "Speed-of-service tracking", "Drive-thru ready"],
  },
  {
    img: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80",
    title: "Fine Dining",
    desc: "Coursing, seat-level tracking, allergen flagging, and tableside payment. The hospitality details that matter at $80 entrée tickets.",
    pills: ["Coursing", "Seat-level orders", "Wine list integration"],
  },
  {
    img: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=900&q=80",
    title: "Cafés & Coffee Shops",
    desc: "Morning rush handled. Recipe-linked inventory tracks beans, milks, and syrups in real time. Loyalty enrollment by phone number.",
    pills: ["Recipe inventory", "Phone loyalty", "Modifier-heavy menus"],
  },
  {
    img: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=900&q=80",
    title: "Pizzerias",
    desc: "Half-and-half toppings, by-the-slice pricing, delivery dispatch. Native integrations with Slice, Uber Eats, DoorDash, and Grubhub.",
    pills: ["Half-and-half", "Slice integration", "Delivery dispatch"],
  },
  {
    img: "https://images.unsplash.com/photo-1595257841889-eca2678454e2?auto=format&fit=crop&w=900&q=80",
    title: "Food Trucks",
    desc: "LTE-friendly. Fully offline-capable. Mobile printer support, single-tablet operation. Park anywhere, sell anywhere.",
    pills: ["Offline-first", "LTE optimized", "Single-tablet mode"],
  },
  {
    img: "https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=900&q=80",
    title: "Bars & Lounges",
    desc: "Open tabs with pre-auth, complex split checks, bottle-service tracking. Manager-PIN voids, cash-drawer audit trail.",
    pills: ["Open tabs", "Pre-auth holds", "Complex splits"],
  },
  {
    img: "https://images.unsplash.com/photo-1606787366850-de6330128bfc?auto=format&fit=crop&w=900&q=80",
    title: "Delis & Markets",
    desc: "Weight-based pricing, bulk-item barcodes, mixed retail and prepared food. Tax handling that knows the difference.",
    pills: ["Scale integration", "Barcode scanner", "Mixed tax rules"],
  },
  {
    img: "https://images.unsplash.com/photo-1551218808-94e220e084d2?auto=format&fit=crop&w=900&q=80",
    title: "Catering & Events",
    desc: "Pre-order workflow, deposit handling, headcount-based pricing. Custom invoicing with line-item breakdowns for corporate accounts.",
    pills: ["Pre-orders", "Deposits", "Custom invoicing"],
  },
];

export default function IndustriesPage() {
  return (
    <>
      <MarketingNav current="industries" />

      <section className="page-head">
        <div className="wrap">
          <div className="eyebrow reveal in">Industries</div>
          <h1 className="reveal in" style={{ transitionDelay: ".1s" }}>Built for the way your concept runs.</h1>
          <p className="lede reveal in" style={{ transitionDelay: ".2s" }}>DEXA configures itself for eight different restaurant concepts, with the right defaults already set for your operation.</p>
        </div>
      </section>

      <section className="ind-grid">
        <div className="wrap">
          <div className="ind-row reveal-stagger in">
            {INDUSTRIES.map((it) => (
              <div className="ind-card" key={it.title}>
                <div className="ind-image" style={{ backgroundImage: `url('${it.img}')` }}></div>
                <div className="ind-body">
                  <h3>{it.title}</h3>
                  <p>{it.desc}</p>
                  <div className="ind-pills">
                    {it.pills.map((p) => (
                      <span key={p}>{p}</span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* MULTI-LOCATION */}
      <section className="multi-loc">
        <div className="wrap">
          <div className="multi-card reveal in">
            <div className="multi-content">
              <div className="multi-eyebrow">Multi-Location</div>
              <h2>One platform. Every location.</h2>
              <p>Central menu management, per-location overrides, group reporting, and secure tenant isolation. Scale from one restaurant to fifty without changing tools — or training your managers twice.</p>
              <div className="multi-stats">
                <div className="multi-stat">
                  <div className="multi-stat-num">47</div>
                  <div className="multi-stat-label">Largest deployment</div>
                </div>
                <div className="multi-stat">
                  <div className="multi-stat-num">1</div>
                  <div className="multi-stat-label">Dashboard for all</div>
                </div>
              </div>
              <a href="/contact" className="btn btn-primary" style={{ background: "var(--paper)", color: "var(--ink)" }}>
                Talk to our multi-location team
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
              </a>
            </div>
            <div
              className="multi-image"
              style={{ backgroundImage: "url('https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=900&q=80')" }}
            ></div>
          </div>
        </div>
      </section>

      <section className="cta-strip">
        <div className="wrap">
          <div className="section-eyebrow" style={{ color: "var(--brand-300)", justifyContent: "center" }}>Built for your concept</div>
          <h2>Let&apos;s configure it for your operation.</h2>
          <p>Tell us your concept on the demo call and we&apos;ll bring DEXA up pre-configured — with the right defaults, the right hardware, and the right integrations for how you actually run service.</p>
          <div className="actions">
            <a href="/contact" className="btn btn-primary" style={{ background: "var(--paper)", color: "var(--ink)" }}>
              Request a Demo
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
            </a>
            <a href="/demo" className="btn btn-ghost-light">Try the demo</a>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </>
  );
}
