import type { Metadata } from "next";
import Link from "next/link";
import { Reveal } from "@/components/marketing/Reveal";
import SectionRenderer from "@/components/cms/SectionRenderer";
import { getCmsPage } from "@/lib/cms/get-cms-page";
import DemoFrame from "@/components/marketing/DemoFrame";
import "./demo.css";

export async function generateMetadata(): Promise<Metadata> {
  const cms = await getCmsPage("/demo");
  return {
    title: cms?.title || "Live Demo",
    description: cms?.description || "Take the DEXA point-of-sale system for a spin. Explore the interface, try order entry, tables, and payment flows right in your browser.",
    openGraph: { title: cms?.title || "DEXA Live Demo", url: "/demo" },
  };
}

export default async function DemoPage() {
  const cms = await getCmsPage("/demo");
  const sections = cms?.sections || [];
  const hasCmsHero = sections.some((section) => section.id === "demo-hero");

  return (
    <>
      {!hasCmsHero && <section className="page-head">
        <div className="wrap">
          <Reveal as="div" className="eyebrow reveal">Live Demo</Reveal>
          <Reveal as="h1" className="reveal" style={{ transitionDelay: ".1s" }}>See DEXA. The way your team will.</Reveal>
          <Reveal as="p" className="lede reveal" style={{ transitionDelay: ".2s" }}>This is the actual DEXA point-of-sale interface, running below in your browser. Tap any tile — Sales, Tables, Kitchen Display, Inventory, Analytics — to see real screens with real data.</Reveal>
        </div>
      </section>}

      {sections.length > 0 && <SectionRenderer route="/demo" sections={sections} />}

      {sections.length === 0 && (
        <>
          <section className="demo-section">
            <div className="wrap">
              <Reveal className="reveal">
                <DemoFrame />
              </Reveal>
              <div className="demo-hint">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></svg>
                Tip: try Sales (build an order) → Inventory (see stock levels) → Analytics (revenue by day)
              </div>
            </div>
          </section>
          <section className="annotations">
            <div className="wrap">
              <Reveal className="reveal">
                <div className="section-head center">
                  <div className="section-eyebrow">What you&apos;re seeing</div>
                  <h2 className="section-title">Three things to notice as you click around.</h2>
                </div>
              </Reveal>
              <Reveal className="reveal-stagger">
                <div className="ann-grid">
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
              </Reveal>
            </div>
          </section>
          <section className="cta-strip">
            <div className="wrap">
              <div className="section-eyebrow" style={{ color: "var(--brand-300)", justifyContent: "center" }}>Want the full walkthrough?</div>
              <h2>Better in person.</h2>
              <p>Schedule a 30-minute live demo. We&apos;ll bring DEXA up on real hardware, configure it for your menu, and show you the moments that don&apos;t make it into the demo above.</p>
              <div className="actions">
                <Link href="/contact" className="btn btn-request-a-demo" style={{ background: "var(--paper)", color: "var(--ink)" }}>
                  Request a Demo
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
                </Link>
                <Link href="/features" className="btn btn-ghost-light">See full features</Link>
              </div>
            </div>
          </section>
        </>
      )}
    </>
  );
}
