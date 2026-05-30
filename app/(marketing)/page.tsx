import type { Metadata } from "next";
import MarketingNav from "./_components/MarketingNav";
import MarketingFooter from "./_components/MarketingFooter";
import CountUp from "./_components/CountUp";

export const metadata: Metadata = {
  title: {
    absolute: "DEXA POS — Restaurant operations, simplified.",
  },
  description:
    "The all-in-one point-of-sale platform built for modern restaurants. From quick-service to fine dining.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "DEXA POS",
    url: "/",
    title: "DEXA POS — Restaurant operations, simplified.",
    description:
      "The all-in-one point-of-sale platform built for modern restaurants. From quick-service to fine dining.",
    images: [
      { url: "/dexalogolight.png", width: 1200, height: 630, alt: "DEXA POS" },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "DEXA POS — Restaurant operations, simplified.",
    description:
      "The all-in-one point-of-sale platform built for modern restaurants. From quick-service to fine dining.",
    images: ["/dexalogolight.png"],
  },
};

export default function Home() {
  return (
    <>
      <MarketingNav current="home" />

      {/* HERO */}
      <section className="hero">
        <div className="wrap">
          <div className="hero-grid">
            <div className="reveal in">
              <h1>
                Run a smarter restaurant.{" "}
                <span className="accent">Start to finish.</span>
              </h1>
              <p className="hero-lede">
                DEXA is the all-in-one point-of-sale platform built for modern
                restaurants. From the first order to the last receipt, every
                part of your operation runs on one trusted system — designed for
                speed, accuracy, and peace of mind.
              </p>
              <div className="hero-actions">
                <a href="/contact" className="btn btn-primary">
                  Request a Demo
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
                </a>
                <a href="/demo" className="btn btn-secondary">See it in action</a>
              </div>
              <div className="hero-trust">
                <div className="hero-trust-item">
                  <span className="hero-trust-num">1,200+</span>
                  <span className="hero-trust-label">Restaurants on DEXA</span>
                </div>
                <div className="hero-trust-item">
                  <span className="hero-trust-num">99.99%</span>
                  <span className="hero-trust-label">Uptime, last 90 days</span>
                </div>
                <div className="hero-trust-item">
                  <span className="hero-trust-num">24/7</span>
                  <span className="hero-trust-label">US-based support</span>
                </div>
              </div>
            </div>

            <div className="hero-visual reveal in" style={{ transitionDelay: ".15s" }}>
              <div className="pos-preview">
                <div className="pos-preview-head">
                  <div className="pos-preview-brand">
                    <span className="pos-preview-brand-dot"></span>
                    <span>Station 01 · Front Counter</span>
                  </div>
                  <div className="pos-preview-user">
                    <div className="pos-preview-avatar">MK</div>
                    <span className="pos-preview-user-name">Moe</span>
                  </div>
                </div>
                <div className="pos-preview-section-label">Operations</div>
                <div className="pos-preview-tiles">
                  <div className="pos-preview-tile">
                    <div className="pos-preview-tile-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.7 13.4a2 2 0 002 1.6h9.7a2 2 0 002-1.6L23 6H6" /></svg></div>
                    <div className="pos-preview-tile-name">Sales</div>
                  </div>
                  <div className="pos-preview-tile">
                    <div className="pos-preview-tile-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg></div>
                    <div className="pos-preview-tile-name">Tables</div>
                  </div>
                  <div className="pos-preview-tile">
                    <div className="pos-preview-tile-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 109-9" /><path d="M3 4v5h5" /><path d="M12 7v5l3 2" /></svg></div>
                    <div className="pos-preview-tile-name">Previous</div>
                  </div>
                  <div className="pos-preview-tile">
                    <div className="pos-preview-tile-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 11v6a3 3 0 003 3h6a3 3 0 003-3v-6" /><path d="M4 8a4 4 0 014-4 4 4 0 018 0 4 4 0 014 4v3H4z" /></svg></div>
                    <div className="pos-preview-tile-name">Kitchen</div>
                  </div>
                  <div className="pos-preview-tile">
                    <div className="pos-preview-tile-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="9" r="6" /><path d="M9 14l-2 7 5-3 5 3-2-7" /></svg></div>
                    <div className="pos-preview-tile-name">Loyalty</div>
                  </div>
                </div>
                <div className="pos-preview-stat-strip">
                  <div className="pos-stat-mini">
                    <div className="pos-stat-mini-value">$11,860</div>
                    <div className="pos-stat-mini-label">Sales today</div>
                  </div>
                  <div className="pos-stat-mini">
                    <div className="pos-stat-mini-value">184</div>
                    <div className="pos-stat-mini-label">Orders</div>
                  </div>
                  <div className="pos-stat-mini">
                    <div className="pos-stat-mini-value">$64.40</div>
                    <div className="pos-stat-mini-label">Avg ticket</div>
                  </div>
                </div>
              </div>
              <div className="hero-floating">
                <div className="hero-floating-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12l5 5L20 7" /></svg>
                </div>
                <div className="hero-floating-text">
                  <strong>Live order processed</strong>
                  $87.64 · Card · Just now
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* VALUE PROPS */}
      <section className="value-props">
        <div className="wrap">
          <div className="section-head reveal in">
            <div className="section-eyebrow">Why operators choose DEXA</div>
            <h2 className="section-title">Everything your restaurant needs, in one place.</h2>
            <p className="section-sub">Stop juggling six tools to run one restaurant. DEXA brings ordering, payments, kitchen, staff, and reporting together — so you can focus on hospitality.</p>
          </div>

          <div className="value-grid reveal-stagger in">
            <div className="value-card">
              <div className="value-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /></svg>
              </div>
              <h3>Built for full-service</h3>
              <p>Coursing, split checks, seat-level tracking, and tableside payments. Every detail of full-service hospitality, handled.</p>
            </div>
            <div className="value-card">
              <div className="value-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12c0 5.5-4.5 10-10 10S2 17.5 2 12 6.5 2 12 2s10 4.5 10 10z" /><path d="M9 12l2 2 4-4" /></svg>
              </div>
              <h3>Reliable, even offline</h3>
              <p>Wi-Fi drops? DEXA keeps selling. Orders fire to the kitchen, payments settle, the floor never knows there was an issue.</p>
            </div>
            <div className="value-card">
              <div className="value-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="6" width="20" height="13" rx="2" /><path d="M2 11h20" /></svg>
              </div>
              <h3>Transparent pricing</h3>
              <p>Cash and card prices on every check. No bundled processor markup, no multi-year hardware lock — keep what you earn.</p>
            </div>
          </div>
        </div>
      </section>

      {/* EXPLORE */}
      <section className="explore">
        <div className="wrap">
          <div className="section-head reveal in">
            <div className="section-eyebrow">Explore</div>
            <h2 className="section-title">Take a closer look.</h2>
            <p className="section-sub">Whether you want to see DEXA in action, compare it side-by-side with the platform you have today, or check whether your existing hardware works — start here.</p>
          </div>

          <div className="explore-grid reveal-stagger in">
            <a href="/demo" className="explore-card">
              <div className="explore-image" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1556742044-3c52d6e88c62?auto=format&fit=crop&w=900&q=80')" }}></div>
              <div className="explore-body">
                <h3>Live Demo</h3>
                <p>Walk through the actual DEXA point-of-sale interface. See how orders flow from the front counter to the kitchen, how payments process, and how reporting comes together.</p>
                <span className="explore-link">
                  Open the demo
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
                </span>
              </div>
            </a>

            <a href="/features" className="explore-card">
              <div className="explore-image" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80')" }}></div>
              <div className="explore-body">
                <h3>Features</h3>
                <p>Every capability DEXA offers, organized into ten clear categories. Ordering, payments, kitchen operations, staff management, reporting, and more.</p>
                <span className="explore-link">
                  View features
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
                </span>
              </div>
            </a>

            <a href="/why" className="explore-card">
              <div className="explore-image" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=900&q=80')" }}></div>
              <div className="explore-body">
                <h3>Why DEXA</h3>
                <p>How DEXA compares to Toast, Square, and Clover — including the questions operators actually ask before they switch. Honest answers, no marketing spin.</p>
                <span className="explore-link">
                  See the comparison
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
                </span>
              </div>
            </a>

            <a href="/hardware" className="explore-card">
              <div className="explore-image" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1556742393-d75f468bfcb0?auto=format&fit=crop&w=900&q=80')" }}></div>
              <div className="explore-body">
                <h3>Hardware</h3>
                <p>iPad, Android, Castles, Dejavoo, Star Micronics, Landi. Mix and match the gear that fits your floor — no mandatory devices, no multi-year leases.</p>
                <span className="explore-link">
                  See compatible hardware
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
                </span>
              </div>
            </a>
          </div>
        </div>
      </section>

      {/* PROOF */}
      <section className="proof">
        <div className="wrap">
          <div className="section-head center reveal in">
            <div className="section-eyebrow">Trusted operations</div>
            <h2 className="section-title" style={{ color: "var(--paper)" }}>A platform restaurants run on every day.</h2>
            <p className="section-sub" style={{ color: "rgba(255,255,255,0.70)" }}>From single-location food trucks to 50-unit groups, DEXA scales with your business.</p>
          </div>

          <div className="proof-grid reveal-stagger in">
            <div className="proof-stat">
              <div className="proof-stat-value"><CountUp value={1284} /></div>
              <div className="proof-stat-label">Active restaurants</div>
            </div>
            <div className="proof-stat">
              <div className="proof-stat-value">$<CountUp value={48.2} decimals={1} />M</div>
              <div className="proof-stat-label">Processed today</div>
            </div>
            <div className="proof-stat">
              <div className="proof-stat-value"><CountUp value={99.99} decimals={2} />%</div>
              <div className="proof-stat-label">Uptime, 90 days</div>
            </div>
            <div className="proof-stat">
              <div className="proof-stat-value"><CountUp value={3.2} decimals={1} /><span>min</span></div>
              <div className="proof-stat-label">Avg support response</div>
            </div>
          </div>
        </div>
      </section>

      {/* INDUSTRIES */}
      <section className="industries-strip">
        <div className="wrap">
          <div className="section-head reveal in">
            <div className="section-eyebrow">Built for your concept</div>
            <h2 className="section-title">Whatever you serve, DEXA fits.</h2>
            <p className="section-sub">DEXA configures itself for eight different restaurant concepts, with the right defaults already set for your operation.</p>
          </div>

          <div className="industry-row reveal-stagger in">
            <div className="industry-tag">
              <div className="industry-tag-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 7h18l-2 12H5L3 7z" /><path d="M8 7V5a4 4 0 018 0v2" /></svg>
              </div>
              <div className="industry-tag-name">Quick-Service</div>
            </div>
            <div className="industry-tag">
              <div className="industry-tag-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 12V8a7 7 0 0114 0v4" /><path d="M3 12h18l-1 9H4l-1-9z" /></svg>
              </div>
              <div className="industry-tag-name">Fine Dining</div>
            </div>
            <div className="industry-tag">
              <div className="industry-tag-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M17 8h1a4 4 0 010 8h-1" /><path d="M3 8h14v9a4 4 0 01-4 4H7a4 4 0 01-4-4V8z" /></svg>
              </div>
              <div className="industry-tag-name">Cafés</div>
            </div>
            <div className="industry-tag">
              <div className="industry-tag-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><circle cx="9" cy="10" r="1.2" fill="currentColor" /><circle cx="14" cy="13" r="1.2" fill="currentColor" /></svg>
              </div>
              <div className="industry-tag-name">Pizzerias</div>
            </div>
            <div className="industry-tag">
              <div className="industry-tag-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="6" width="14" height="12" rx="1.5" /><path d="M17 11h3l1.5 3.5V17h-4.5" /><circle cx="7" cy="20" r="2" /><circle cx="18" cy="20" r="2" /></svg>
              </div>
              <div className="industry-tag-name">Food Trucks</div>
            </div>
            <div className="industry-tag">
              <div className="industry-tag-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 8l4 12h6l4-12" /><path d="M3 8h18M8 4h8" /></svg>
              </div>
              <div className="industry-tag-name">Bars &amp; Lounges</div>
            </div>
            <div className="industry-tag">
              <div className="industry-tag-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></svg>
              </div>
              <div className="industry-tag-name">Delis &amp; Markets</div>
            </div>
            <div className="industry-tag">
              <div className="industry-tag-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" /></svg>
              </div>
              <div className="industry-tag-name">Multi-Location</div>
            </div>
          </div>

          <div style={{ textAlign: "center", marginTop: 48 }} className="reveal in">
            <a href="/industries" className="btn btn-secondary">
              See how each concept runs DEXA
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
            </a>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-strip">
        <div className="wrap">
          <div className="section-eyebrow" style={{ color: "var(--brand-300)", justifyContent: "center" }}>Ready when you are</div>
          <h2>See DEXA in your restaurant.</h2>
          <p>Schedule a 30-minute walkthrough. We&apos;ll bring DEXA up on the hardware that fits your concept, configure it for your menu, and answer every question your operator is going to ask.</p>
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
