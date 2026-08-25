import type { Metadata } from "next";
import Link from "next/link";
import { Reveal } from "@/components/marketing/Reveal";
import SectionRenderer from "@/components/cms/SectionRenderer";
import { getCmsPage } from "@/lib/cms/get-cms-page";
import "./features.css";

export async function generateMetadata(): Promise<Metadata> {
  const cms = await getCmsPage("/features");
  return {
    title: cms?.title || "Features",
    description: cms?.description || "Take control of your entire restaurant with DEXA's all-in-one platform — POS, payments, online ordering, inventory, scheduling, and real-time reporting.",
    openGraph: { title: cms?.title || "DEXA Features", url: "/features" },
  };
}

export default async function Features() {
  const cms = await getCmsPage("/features");
  const sections = cms?.sections || [];
  const hasCmsHero = sections.some((section) => section.id === "features-hero");

  return (
    <>
      {!hasCmsHero && <section className="page-head">
        <div className="wrap">
          <Reveal className="eyebrow reveal">Features</Reveal>
          {/* Delay belongs on the .reveal element — the transition lives there,
              so a delay on the inner tag would never apply. */}
          <Reveal as="h1" className="reveal" style={{ transitionDelay: ".1s" }}>
            Everything you need. Nothing you don&apos;t.
          </Reveal>
          <Reveal as="p" className="lede reveal" style={{ transitionDelay: ".2s" }}>
            Six features that change how you operate. Ten capabilities, one platform.
          </Reveal>
        </div>
      </section>}

      {sections.length > 0 && <SectionRenderer route="/features" sections={sections} />}

      {sections.length === 0 && (
        <>
          <section className="core">
            <div className="wrap">
              <Reveal className="section-head reveal">
                <div className="section-eyebrow">The essentials</div>
                <h2 className="section-title">What you&apos;ll notice on day one.</h2>
              </Reveal>

              <Reveal className="core-grid reveal-stagger">
                <div className="core-card">
                  <div className="core-image" style={{ backgroundImage: "url('/dexa-dp2.png')" }} />
                  <div className="core-body">
                    <div className="core-icon">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="6" width="20" height="13" rx="2" /><path d="M2 11h20" /></svg>
                    </div>
                    <h3>Dual pricing, built in</h3>
                    <p>Cash and card prices on every check, every receipt. No add-ons, no math at the register.</p>
                  </div>
                </div>
                <div className="core-card">
                  <div className="core-image" style={{ backgroundImage: "url('/dexa-og2.png')" }} />
                  <div className="core-body">
                    <div className="core-icon">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 12c0 5.5-4.5 10-10 10S2 17.5 2 12 6.5 2 12 2s10 4.5 10 10z" /><path d="M9 12l2 2 4-4" /></svg>
                    </div>
                    <h3>Works offline</h3>
                    <p>Wi-Fi drops? You keep selling. Orders fire to the kitchen, payments settle when back online.</p>
                  </div>
                </div>
                <div className="core-card">
                  <div className="core-image" style={{ backgroundImage: "url('/dexa-kds2.png')" }} />
                  <div className="core-body">
                    <div className="core-icon">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 11v6a3 3 0 003 3h6a3 3 0 003-3v-6" /><path d="M4 8a4 4 0 014-4 4 4 0 018 0 4 4 0 014 4v3H4z" /></svg>
                    </div>
                    <h3>Smart kitchen display</h3>
                    <p>Tickets routed by station. Allergens flagged. Aging timers and bulk advance built in.</p>
                  </div>
                </div>
                <div className="core-card">
                  <div className="core-image" style={{ backgroundImage: "url('/dexa-cash.png')" }} />
                  <div className="core-body">
                    <div className="core-icon">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 9h6v6H9z" /></svg>
                    </div>
                    <h3>Cash integrity</h3>
                    <p>Every drawer action logged with timestamp and PIN. Suspicious patterns flagged automatically.</p>
                  </div>
                </div>
                <div className="core-card">
                  <div className="core-image" style={{ backgroundImage: "url('/dexa-analytics3.png')" }} />
                  <div className="core-body">
                    <div className="core-icon">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 20h18" /><rect x="5" y="10" width="3" height="10" /><rect x="11" y="6" width="3" height="14" /><rect x="17" y="13" width="3" height="7" /></svg>
                    </div>
                    <h3>Real-time analytics</h3>
                    <p>Sales, labor, top items, payment mix — live from any device. Run from the floor.</p>
                  </div>
                </div>
                <div className="core-card">
                  <div className="core-image" style={{ backgroundImage: "url('/dexa-hw1.png')" }} />
                  <div className="core-body">
                    <div className="core-icon">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="14" rx="2" /><path d="M9 21h6M12 17v4" /></svg>
                    </div>
                    <h3>Hardware freedom</h3>
                    <p>iPad, Android, Castles, Dejavoo, Star Micronics. Run on the gear you already own.</p>
                  </div>
                </div>
              </Reveal>
            </div>
          </section>

          <section className="capabilities">
            <div className="wrap">
              <Reveal className="section-head reveal">
                <div className="section-eyebrow">Full capability surface</div>
                <h2 className="section-title">Ten focused areas. One platform.</h2>
                <p className="section-sub">Configurable per location, per station, per role.</p>
              </Reveal>

              <Reveal className="cap-grid reveal-stagger">
                <div className="cap">
                  <div className="cap-head">
                    <div className="cap-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /></svg>
                    </div>
                    <h3>Order Management</h3>
                  </div>
                  <p>The core ordering surface. Configurable per concept — counter, table, bar, or mixed.</p>
                  <div className="cap-pills"><span>Coursing</span><span>Split checks</span><span>Modifiers</span><span>Open tabs</span></div>
                </div>
                <div className="cap">
                  <div className="cap-head">
                    <div className="cap-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="6" width="20" height="13" rx="2" /><path d="M2 11h20" /></svg>
                    </div>
                    <h3>Payments &amp; Processing</h3>
                  </div>
                  <p>Configurable processor, dual pricing, tip-at-sale, Apple Pay and Google Pay.</p>
                  <div className="cap-pills"><span>Cash discount</span><span>Tip-at-sale</span><span>Apple Pay</span><span>Pre-auth tabs</span></div>
                </div>
                <div className="cap">
                  <div className="cap-head">
                    <div className="cap-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="6" width="13" height="11" rx="1.5" /><path d="M16 10h3l2 3v4h-5" /><circle cx="7" cy="19" r="1.8" /><circle cx="17" cy="19" r="1.8" /></svg>
                    </div>
                    <h3>Online Ordering &amp; Delivery</h3>
                  </div>
                  <p>Direct ordering plus integrations with Uber Eats, DoorDash, Grubhub.</p>
                  <div className="cap-pills"><span>Website</span><span>Uber Eats</span><span>DoorDash</span><span>Grubhub</span></div>
                </div>
                <div className="cap">
                  <div className="cap-head">
                    <div className="cap-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 11v6a3 3 0 003 3h6a3 3 0 003-3v-6" /><path d="M4 8a4 4 0 014-4 4 4 0 018 0 4 4 0 014 4v3H4z" /></svg>
                    </div>
                    <h3>Kitchen Operations</h3>
                  </div>
                  <p>Per-station kitchen display, allergen detection, and aging timers.</p>
                  <div className="cap-pills"><span>KDS</span><span>Allergen flags</span><span>Aging timers</span><span>Routing</span></div>
                </div>
                <div className="cap">
                  <div className="cap-head">
                    <div className="cap-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7h18l-2 14H5L3 7z" /><path d="M8 7V5a4 4 0 018 0v2" /></svg>
                    </div>
                    <h3>Menu &amp; Inventory</h3>
                  </div>
                  <p>Visual menu builder, recipe-linked stock, low-stock alerts, scheduled menus.</p>
                  <div className="cap-pills"><span>Menu builder</span><span>Auto-deduct</span><span>Stock alerts</span><span>Schedules</span></div>
                </div>
                <div className="cap">
                  <div className="cap-head">
                    <div className="cap-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /></svg>
                    </div>
                    <h3>Staff &amp; Scheduling</h3>
                  </div>
                  <p>Role-based access, PIN logins, drag-to-assign scheduling, tip distribution.</p>
                  <div className="cap-pills"><span>PIN login</span><span>Roles</span><span>Scheduling</span><span>Tip splits</span></div>
                </div>
                <div className="cap">
                  <div className="cap-head">
                    <div className="cap-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 20h18" /><rect x="5" y="10" width="3" height="10" /><rect x="11" y="6" width="3" height="14" /><rect x="17" y="13" width="3" height="7" /></svg>
                    </div>
                    <h3>Reporting &amp; Analytics</h3>
                  </div>
                  <p>Live sales, labor cost, top items, menu engineering, daily closeout.</p>
                  <div className="cap-pills"><span>Live sales</span><span>Menu engineering</span><span>Closeout</span><span>P&amp;L</span></div>
                </div>
                <div className="cap">
                  <div className="cap-head">
                    <div className="cap-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" /></svg>
                    </div>
                    <h3>Loyalty &amp; Marketing</h3>
                  </div>
                  <p>Phone-based loyalty (no app needed), SMS marketing, birthday offers.</p>
                  <div className="cap-pills"><span>Phone signup</span><span>Points</span><span>SMS</span><span>Offers</span></div>
                </div>
                <div className="cap">
                  <div className="cap-head">
                    <div className="cap-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 9h6v6H9z" /></svg>
                    </div>
                    <h3>Accounting &amp; API</h3>
                  </div>
                  <p>QuickBooks integration, sales tax handling, payroll exports, open API.</p>
                  <div className="cap-pills"><span>QuickBooks</span><span>Tax</span><span>Payroll</span><span>API</span></div>
                </div>
                <div className="cap">
                  <div className="cap-head">
                    <div className="cap-icon">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 010 18" /></svg>
                    </div>
                    <h3>Multi-Location</h3>
                  </div>
                  <p>Central menu, per-location overrides, group reporting, secure tenant isolation.</p>
                  <div className="cap-pills"><span>Central menu</span><span>Overrides</span><span>Group P&amp;L</span><span>Permissions</span></div>
                </div>
              </Reveal>
            </div>
          </section>

          <section className="compare-strip">
            <div className="wrap">
              <Reveal className="compare-card reveal">
                <div>
                  <h2>How does this compare to what we have?</h2>
                  <p>Side-by-side honesty on the differences that matter — dual pricing, processor freedom, contract length, offline reliability.</p>
                  <Link href="/why" className="btn btn-primary" style={{ background: "var(--paper)", color: "var(--ink)" }}>
                    See the comparison
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
                  </Link>
                </div>
                <div className="compare-side">
                  <div className="compare-row">
                    <span className="compare-row-label">Dual pricing</span>
                    <span className="compare-row-good">DEXA: built in</span>
                  </div>
                  <div className="compare-row">
                    <span className="compare-row-label">Hardware</span>
                    <span className="compare-row-good">DEXA: open</span>
                  </div>
                  <div className="compare-row">
                    <span className="compare-row-label">Processor</span>
                    <span className="compare-row-good">DEXA: configurable</span>
                  </div>
                  <div className="compare-row">
                    <span className="compare-row-label">Contract</span>
                    <span className="compare-row-good">DEXA: month-to-month</span>
                  </div>
                </div>
              </Reveal>
            </div>
          </section>

          <section className="cta-strip">
            <div className="wrap">
              <div className="section-eyebrow" style={{ color: "var(--brand-300)", justifyContent: "center" }}>See it live</div>
              <h2>Ready to see DEXA in action?</h2>
              <p>Walk through the full feature set on a 30-minute call. We&apos;ll configure it for your menu, your hardware, and your concept.</p>
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
      )}
    </>
  );
}
