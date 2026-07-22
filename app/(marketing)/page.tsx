import type { Metadata } from "next";
import Link from "next/link";
import AnimatedCounter from "@/components/marketing/AnimatedCounter";
import SectionRenderer from "@/components/cms/SectionRenderer";
import { getCmsPage } from "@/lib/cms/get-cms-page";

export async function generateMetadata(): Promise<Metadata> {
  const cms = await getCmsPage("/");
  return {
    title: cms?.title || "DEXA — Restaurant operations, simplified.",
    description: cms?.description || "The all-in-one point-of-sale platform built for modern restaurants.",
    openGraph: { title: cms?.title || "DEXA" },
  };
}

export default async function Home() {
  const cms = await getCmsPage("/");
  if (cms?.sections?.length) {
    return <SectionRenderer route="/" sections={cms.sections} />;
  }

  return (
    <>
      {/* HERO */}
      <section className="hero">
        <div className="wrap">
          <div className="hero-grid">
            <div className="reveal in">
              <h1>Run a smarter restaurant. <span className="accent">Start to<br />finish.</span></h1>
              <p className="hero-lede">DEXA is the all-in-one point-of-sale platform built for modern restaurants. From the first order to the last receipt, every part of your operation runs on one trusted system — designed for speed, accuracy, and peace of mind.</p>
              <div className="hero-actions">
                <Link href="/contact" className="btn btn-request-a-demo">
                  Request a Demo
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
                </Link>
                <Link href="/demo" className="btn btn-secondary">See it in action</Link>
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
              <figure className="hero-photo">
                <img src="/dexa-homehero.png" alt="A DEXA POS station in a café, taking an order at the counter" width={1040} height={676} />
              </figure>
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
            <Link href="/demo" className="explore-card">
              <div className="explore-image" style={{ backgroundImage: "url('/dexa-og.png')" }} />
              <div className="explore-body">
                <h3>Live Demo</h3>
                <p>Walk through the actual DEXA point-of-sale interface. See how orders flow from the front counter to the kitchen, how payments process, and how reporting comes together.</p>
                <span className="explore-link">
                  Open the demo
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
                </span>
              </div>
            </Link>

            <Link href="/features" className="explore-card">
              <div className="explore-image" style={{ backgroundImage: "url('/dexa-cash.png')" }} />
              <div className="explore-body">
                <h3>Features</h3>
                <p>Every capability DEXA offers, organized into ten clear categories. Ordering, payments, kitchen operations, staff management, reporting, and more.</p>
                <span className="explore-link">
                  View features
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
                </span>
              </div>
            </Link>

            <Link href="/why" className="explore-card">
              <div className="explore-image" style={{ backgroundImage: "url('/dexa-cafe.png')" }} />
              <div className="explore-body">
                <h3>Why DEXA</h3>
                <p>How DEXA compares to Toast, Square, and Clover — including the questions operators actually ask before they switch. Honest answers, no marketing spin.</p>
                <span className="explore-link">
                  See the comparison
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
                </span>
              </div>
            </Link>

            <Link href="/hardware" className="explore-card">
              <div className="explore-image" style={{ backgroundImage: "url('/dexa-hw2.png')" }} />
              <div className="explore-body">
                <h3>Hardware</h3>
                <p>iPad, Android, Castles, Dejavoo, Star Micronics, Landi. Mix and match the gear that fits your floor — no mandatory devices, no multi-year leases.</p>
                <span className="explore-link">
                  See compatible hardware
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
                </span>
              </div>
            </Link>
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
              <div className="proof-stat-value"><AnimatedCounter value={1284} /></div>
              <div className="proof-stat-label">Active restaurants</div>
            </div>
            <div className="proof-stat">
              <div className="proof-stat-value">$<AnimatedCounter value={48.2} />M</div>
              <div className="proof-stat-label">Processed today</div>
            </div>
            <div className="proof-stat">
              <div className="proof-stat-value"><AnimatedCounter value={99.99} />%</div>
              <div className="proof-stat-label">Uptime, 90 days</div>
            </div>
            <div className="proof-stat">
              <div className="proof-stat-value"><AnimatedCounter value={3.2} /><span>min</span></div>
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
            {[
              { name: "Quick-Service", icon: [<path key="a" d="M3 7h18l-2 12H5L3 7z" />, <path key="b" d="M8 7V5a4 4 0 018 0v2" />] },
              { name: "Fine Dining", icon: [<path key="a" d="M5 12V8a7 7 0 0114 0v4" />, <path key="b" d="M3 12h18l-1 9H4l-1-9z" />] },
              { name: "Cafés", icon: [<path key="a" d="M17 8h1a4 4 0 010 8h-1" />, <path key="b" d="M3 8h14v9a4 4 0 01-4 4H7a4 4 0 01-4-4V8z" />] },
              { name: "Pizzerias", icon: [<circle key="a" cx="12" cy="12" r="10" />, <circle key="b" cx="9" cy="10" r="1.2" fill="currentColor" />, <circle key="c" cx="14" cy="13" r="1.2" fill="currentColor" />] },
              { name: "Food Trucks", icon: [<rect key="a" x="3" y="6" width="14" height="12" rx="1.5" />, <path key="b" d="M17 11h3l1.5 3.5V17h-4.5" />, <circle key="c" cx="7" cy="20" r="2" />, <circle key="d" cx="18" cy="20" r="2" />] },
              { name: "Bars & Lounges", icon: [<path key="a" d="M5 8l4 12h6l4-12" />, <path key="b" d="M3 8h18M8 4h8" />] },
              { name: "Delis & Markets", icon: [<rect key="a" x="3" y="3" width="18" height="18" rx="2" />, <path key="b" d="M3 9h18M9 21V9" />] },
              { name: "Multi-Location", icon: [<circle key="a" cx="12" cy="12" r="9" />, <path key="b" d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" />] },
            ].map(({ name: industryName, icon }) => (
              <div key={industryName} className="industry-tag">
                <div className="industry-tag-icon">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">{icon}</svg>
                </div>
                <div className="industry-tag-name">{industryName}</div>
              </div>
            ))}
          </div>

          <div style={{ textAlign: "center", marginTop: 48 }} className="reveal in">
            <Link href="/industries" className="btn btn-secondary">
              See how each concept runs DEXA
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
            </Link>
          </div>
        </div>
      </section>

      {/* COMPARE */}
      <section className="compare-section dark">
        <div className="wrap">
          <div className="section-head center reveal in">
            <div className="section-eyebrow">Built Different</div>
            <h2 className="section-title">No lock-in. <span className="gold">On purpose.</span></h2>
            <p className="section-sub">No multi-year contracts, no captive hardware, no processor lock-in. Here&apos;s how DEXA compares to the platforms most operators evaluate before they switch.</p>
          </div>
          <div className="compare-scroll reveal in">
            <div className="compare-table">
              <div className="compare-r compare-head">
                <div className="compare-c">Capability</div>
                <div className="compare-c dexa">DEXA</div>
                <div className="compare-c">Toast</div>
                <div className="compare-c">Square</div>
                <div className="compare-c">Clover</div>
              </div>
              {[
                ["Dual pricing", "Built in", "Add-on", "Workaround", "3rd-party"],
                ["Hardware choice", "Open", "Toast only", "Square only", "Clover only"],
                ["Payment processor", "Configurable", "Toast Pay", "Square only", "Locked"],
                ["Offline mode", "Full", "Limited", "Limited", "Locked"],
                ["Cash audit log", "Automatic", "Manual", "Limited", "Limited"],
                ["Contract length", "Month-to-month", "2–3 years", "Variable", "Variable"],
                ["Multi-location", "Unlimited", "Tier-based", "Variable", "Per-device"],
              ].map(([feat, dexa, toast, square, clover]) => (
                <div className="compare-r" key={feat}>
                  <div className="compare-c feat">{feat}</div>
                  <div className="compare-c dexa">
                    <span className="ck">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                    </span> {dexa}
                  </div>
                  <div className="compare-c">{toast}</div>
                  <div className="compare-c">{square}</div>
                  <div className="compare-c">{clover}</div>
                </div>
              ))}
            </div>
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
            <Link href="/contact" className="btn btn-request-a-demo" style={{ background: "var(--paper)", color: "var(--ink)" }}>
              Request a Demo
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
            </Link>
            <Link href="/demo" className="btn btn-ghost-light">Try the demo</Link>
          </div>
        </div>
      </section>
    </>
  );
}
