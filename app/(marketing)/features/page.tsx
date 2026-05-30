import type { Metadata } from "next";
import MarketingNav from "../_components/MarketingNav";
import MarketingFooter from "../_components/MarketingFooter";

export const metadata: Metadata = {
  title: "Features",
  description: "Everything DEXA does — at a glance.",
  alternates: { canonical: "/features" },
  openGraph: {
    type: "website",
    siteName: "DEXA POS",
    url: "/features",
    title: "Features — DEXA POS",
    description: "Everything DEXA does — at a glance.",
    images: [
      { url: "/dexalogolight.png", width: 1200, height: 630, alt: "DEXA POS" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Features — DEXA POS",
    description: "Everything DEXA does — at a glance.",
    images: ["/dexalogolight.png"],
  },
};

export default function FeaturesPage() {
  return (
    <>
      <MarketingNav current="features" />

      <section className="page-head">
        <div className="wrap">
          <div className="eyebrow reveal in">Features</div>
          <h1 className="reveal in" style={{ transitionDelay: ".1s" }}>Everything you need. Nothing you don&apos;t.</h1>
          <p className="lede reveal in" style={{ transitionDelay: ".2s" }}>Six features that change how you operate. Ten capabilities, one platform.</p>
        </div>
      </section>

      {/* CORE FEATURES */}
      <section className="core">
        <div className="wrap">
          <div className="section-head reveal in">
            <div className="section-eyebrow">The essentials</div>
            <h2 className="section-title">What you&apos;ll notice on day one.</h2>
          </div>

          <div className="core-grid reveal-stagger in">
            <div className="core-card">
              <div className="core-image" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=900&q=80')" }}></div>
              <div className="core-body">
                <div className="core-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="6" width="20" height="13" rx="2" /><path d="M2 11h20" /></svg></div>
                <h3>Dual pricing, built in</h3>
                <p>Cash and card prices on every check, every receipt. No add-ons, no math at the register.</p>
              </div>
            </div>

            <div className="core-card">
              <div className="core-image" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&w=900&q=80')" }}></div>
              <div className="core-body">
                <div className="core-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12c0 5.5-4.5 10-10 10S2 17.5 2 12 6.5 2 12 2s10 4.5 10 10z" /><path d="M9 12l2 2 4-4" /></svg></div>
                <h3>Works offline</h3>
                <p>Wi-Fi drops? You keep selling. Orders fire to the kitchen, payments settle when back online.</p>
              </div>
            </div>

            <div className="core-card">
              <div className="core-image" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=900&q=80')" }}></div>
              <div className="core-body">
                <div className="core-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 11v6a3 3 0 003 3h6a3 3 0 003-3v-6" /><path d="M4 8a4 4 0 014-4 4 4 0 018 0 4 4 0 014 4v3H4z" /></svg></div>
                <h3>Smart kitchen display</h3>
                <p>Tickets routed by station. Allergens flagged. Aging timers and bulk advance built in.</p>
              </div>
            </div>

            <div className="core-card">
              <div className="core-image" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=900&q=80')" }}></div>
              <div className="core-body">
                <div className="core-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 9h6v6H9z" /></svg></div>
                <h3>Cash integrity</h3>
                <p>Every drawer action logged with timestamp and PIN. Suspicious patterns flagged automatically.</p>
              </div>
            </div>

            <div className="core-card">
              <div className="core-image" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=900&q=80')" }}></div>
              <div className="core-body">
                <div className="core-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 20h18" /><rect x="5" y="10" width="3" height="10" /><rect x="11" y="6" width="3" height="14" /><rect x="17" y="13" width="3" height="7" /></svg></div>
                <h3>Real-time analytics</h3>
                <p>Sales, labor, top items, payment mix — live from any device. Run from the floor.</p>
              </div>
            </div>

            <div className="core-card">
              <div className="core-image" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1556745757-8d76bdb6984b?auto=format&fit=crop&w=900&q=80')" }}></div>
              <div className="core-body">
                <div className="core-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="14" rx="2" /><path d="M9 21h6M12 17v4" /></svg></div>
                <h3>Hardware freedom</h3>
                <p>iPad, Android, Castles, Dejavoo, Star Micronics. Run on the gear you already own.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CAPABILITY GRID */}
      <section className="capabilities">
        <div className="wrap">
          <div className="section-head reveal in">
            <div className="section-eyebrow">Full capability surface</div>
            <h2 className="section-title">Ten focused areas. One platform.</h2>
            <p className="section-sub">Configurable per location, per station, per role.</p>
          </div>

          <div className="cap-grid reveal-stagger in">
            <Capability title="Order Management" desc="The core ordering surface. Configurable per concept — counter, table, bar, or mixed." pills={["Coursing", "Split checks", "Modifiers", "Open tabs"]}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /></svg>
            </Capability>

            <Capability title="Payments & Processing" desc="Configurable processor, dual pricing, tip-at-sale, Apple Pay and Google Pay." pills={["Cash discount", "Tip-at-sale", "Apple Pay", "Pre-auth tabs"]}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="6" width="20" height="13" rx="2" /><path d="M2 11h20" /></svg>
            </Capability>

            <Capability title="Online Ordering & Delivery" desc="Direct ordering plus integrations with Uber Eats, DoorDash, Grubhub." pills={["Website", "Uber Eats", "DoorDash", "Grubhub"]}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="6" width="13" height="11" rx="1.5" /><path d="M16 10h3l2 3v4h-5" /><circle cx="7" cy="19" r="1.8" /><circle cx="17" cy="19" r="1.8" /></svg>
            </Capability>

            <Capability title="Kitchen Operations" desc="Per-station kitchen display, allergen detection, and aging timers." pills={["KDS", "Allergen flags", "Aging timers", "Routing"]}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 11v6a3 3 0 003 3h6a3 3 0 003-3v-6" /><path d="M4 8a4 4 0 014-4 4 4 0 018 0 4 4 0 014 4v3H4z" /></svg>
            </Capability>

            <Capability title="Menu & Inventory" desc="Visual menu builder, recipe-linked stock, low-stock alerts, scheduled menus." pills={["Menu builder", "Auto-deduct", "Stock alerts", "Schedules"]}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7h18l-2 14H5L3 7z" /><path d="M8 7V5a4 4 0 018 0v2" /></svg>
            </Capability>

            <Capability title="Staff & Scheduling" desc="Role-based access, PIN logins, drag-to-assign scheduling, tip distribution." pills={["PIN login", "Roles", "Scheduling", "Tip splits"]}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /></svg>
            </Capability>

            <Capability title="Reporting & Analytics" desc="Live sales, labor cost, top items, menu engineering, daily closeout." pills={["Live sales", "Menu engineering", "Closeout", "P&L"]}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 20h18" /><rect x="5" y="10" width="3" height="10" /><rect x="11" y="6" width="3" height="14" /><rect x="17" y="13" width="3" height="7" /></svg>
            </Capability>

            <Capability title="Loyalty & Marketing" desc="Phone-based loyalty (no app needed), SMS marketing, birthday offers." pills={["Phone signup", "Points", "SMS", "Offers"]}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" /></svg>
            </Capability>

            <Capability title="Accounting & API" desc="QuickBooks integration, sales tax handling, payroll exports, open API." pills={["QuickBooks", "Tax", "Payroll", "API"]}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 9h6v6H9z" /></svg>
            </Capability>

            <Capability title="Multi-Location" desc="Central menu, per-location overrides, group reporting, secure tenant isolation." pills={["Central menu", "Overrides", "Group P&L", "Permissions"]}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 010 18" /></svg>
            </Capability>
          </div>
        </div>
      </section>

      {/* COMPARE */}
      <section className="compare-strip">
        <div className="wrap">
          <div className="compare-card reveal in">
            <div>
              <h2>How does this compare to what we have?</h2>
              <p>Side-by-side honesty on the differences that matter — dual pricing, processor freedom, contract length, offline reliability.</p>
              <a href="/why" className="btn btn-primary" style={{ background: "var(--paper)", color: "var(--ink)" }}>
                See the comparison
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
              </a>
            </div>
            <div className="compare-side">
              <CompareRow label="Dual pricing" value="DEXA: built in" />
              <CompareRow label="Hardware" value="DEXA: open" />
              <CompareRow label="Processor" value="DEXA: configurable" />
              <CompareRow label="Contract" value="DEXA: month-to-month" />
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-strip">
        <div className="wrap">
          <div className="section-eyebrow" style={{ color: "var(--brand-300)", justifyContent: "center" }}>See it live</div>
          <h2>Ready to see DEXA in action?</h2>
          <p>Walk through the full feature set on a 30-minute call. We&apos;ll configure it for your menu, your hardware, and your concept.</p>
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

function Capability({
  title,
  desc,
  pills,
  children,
}: {
  title: string;
  desc: string;
  pills: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="cap">
      <div className="cap-head">
        <div className="cap-icon">{children}</div>
        <h3>{title}</h3>
      </div>
      <p>{desc}</p>
      <div className="cap-pills">
        {pills.map((p) => (
          <span key={p}>{p}</span>
        ))}
      </div>
    </div>
  );
}

function CompareRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="compare-row">
      <span className="compare-row-label">{label}</span>
      <span className="compare-row-good">{value}</span>
    </div>
  );
}
