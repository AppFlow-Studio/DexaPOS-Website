import { Reveal } from "@/components/marketing/Reveal";
import type { Metadata } from "next";
import Link from "next/link";
import AnimatedCounter from "@/components/marketing/AnimatedCounter";
import FaqAccordion from "@/components/marketing/FaqAccordion";
import SectionRenderer from "@/components/cms/SectionRenderer";
import { getCmsPage } from "@/lib/cms/get-cms-page";
import "./why.css";

export async function generateMetadata(): Promise<Metadata> {
  const cms = await getCmsPage("/why");
  return {
    title: cms?.title || "Why DEXA",
    description: cms?.description || "See how DEXA compares to Toast, Square, and Clover — lower cost, open hardware, transparent processing, and no long-term contracts.",
    openGraph: { title: cms?.title || "Why DEXA", url: "/why" },
  };
}

const faqItems = [
  {
    question: "Is DEXA actually cheaper than Toast or Square?",
    answer: `<p>It depends on volume. The DEXA software fee is competitive — but the real savings come from <strong>not paying captive-hardware margin and not paying captive-processor margin.</strong> On $1M+ in card volume per year, the processor difference alone usually pays for the entire DEXA subscription.</p><p>For low-volume single locations, the dollar difference is smaller. For multi-unit operators, it compounds quickly. We're happy to run the math against your actual statements during the demo.</p>`,
  },
  {
    question: "How long does migration take?",
    answer: `<p>For a single-location restaurant, two weeks. For a 5–10 location group, four to six weeks. Our migration team handles menu rebuild, staff PIN setup, hardware provisioning, and one week of on-site coverage during cutover.</p><p><strong>We don't do "you're on your own" migrations.</strong> Every DEXA deployment includes white-glove onboarding because a botched migration costs everyone money.</p>`,
  },
  {
    question: "What about my existing payment processor?",
    answer: `<p>If your existing processor supports our integrated terminals, keep them. If they don't, we'll introduce you to processors who do — typically at rates 15–30 basis points below what bundled-POS operators pay.</p><p>We have no exclusive arrangement with any processor. <strong>We make our money from software, not from a transaction tax.</strong></p>`,
  },
  {
    question: "What happens if my internet goes down?",
    answer: `<p>DEXA keeps running. New orders fire to the kitchen. Cash settles. Tables merge. Drawers open. Refunds process under manager PIN. The customer never knows there was an issue.</p><p>When connectivity returns, the queue syncs in the right order. <strong>You won't lose a transaction to a network outage.</strong></p>`,
  },
  {
    question: "Is there a multi-year contract?",
    answer: `<p>No. Software is month-to-month. Hardware you buy outright. There's no early termination fee, no minimum-volume clause, no automatic renewal that requires 90 days of written notice to escape.</p><p><strong>If we don't earn your business every month, you don't owe us next month.</strong></p>`,
  },
  {
    question: "When is DEXA NOT the right fit?",
    answer: `<p>Three cases. <strong>One:</strong> very low-volume operations doing under $100K per year — Square's free tier is genuinely cheaper. <strong>Two:</strong> operators who want zero configuration — DEXA gives you per-station tuning, which means somebody has to make decisions during onboarding. <strong>Three:</strong> operators who specifically want a bundled processor at a markup.</p><p>If any of those describe you, we'll tell you on the call. We'd rather lose a sale than lose a customer in month four.</p>`,
  },
  {
    question: "Who's actually using DEXA today?",
    answer: `<p>Over 1,200 restaurants across the United States. The mix skews toward full-service: coursing-heavy fine dining, multi-unit pizzeria groups, café chains, and bars with complex tab management.</p><p>Largest deployment: 47 locations across two states. <strong>Smallest: a single food truck running offline-first because their commissary's Wi-Fi is unreliable.</strong> We're equally happy with both.</p>`,
  },
  {
    question: "What kind of support do you offer after launch?",
    answer: `<p>24/7 phone support, US-based. Real humans, no chatbot screening you out before you can speak to someone. Average response time under three minutes for urgent calls during service hours.</p><p>Every account also gets a dedicated onboarding specialist for the first 90 days. <strong>If you have a problem, you have a person.</strong></p>`,
  },
];

export default async function WhyPage() {
  const cms = await getCmsPage("/why");
  if (cms?.sections?.length) {
    return <SectionRenderer route="/why" sections={cms.sections} />;
  }

  return (
    <>
      <section className="page-head">
        <div className="wrap">
          <Reveal as="div" className="eyebrow reveal">Why DEXA</Reveal>
          <Reveal as="h1" className="reveal" style={{ transitionDelay: ".1s" }}>Built different. On purpose.</Reveal>
          <Reveal as="p" className="lede reveal" style={{ transitionDelay: ".2s" }}>No multi-year contracts, no captive hardware, no processor lock-in. Here&apos;s how DEXA stacks up against the platforms most operators evaluate — and the questions they ask before switching.</Reveal>
        </div>
      </section>

      <section className="trust">
        <div className="wrap">
          <Reveal as="div" className="trust-grid reveal-stagger">
            <div className="trust-stat">
              <div className="trust-stat-value"><AnimatedCounter value={1284} /></div>
              <div className="trust-stat-label">Restaurants on DEXA</div>
            </div>
            <div className="trust-stat">
              <div className="trust-stat-value"><AnimatedCounter value={99.99} suffix="%" /></div>
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
          </Reveal>
        </div>
      </section>

      <section className="why-photo">
        <div className="wrap">
          <Reveal as="figure" className="why-photo-frame reveal">
            <img src="/dexa-hero.png" alt="A DEXA POS terminal running in a working restaurant dining room" />
            <figcaption className="why-photo-cap">
              <p>Your hardware. Your processor. Your terms.</p>
            </figcaption>
          </Reveal>
        </div>
      </section>

      <section className="comparison">
        <div className="wrap">
          <Reveal as="div" className="section-head center reveal">
            <div className="section-eyebrow">The comparison</div>
            <h2 className="section-title">DEXA vs. the rest.</h2>
            <p className="section-sub">An honest side-by-side. Here&apos;s how DEXA stacks up against the platforms most operators evaluate.</p>
          </Reveal>

          <Reveal as="div" className="comp-card reveal">
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

              <div className="comp-row-feature">Dual pricing</div>
              <div className="comp-cell" style={{ borderBottom: "1px solid var(--slate-100)" }}><span style={{ background: "var(--brand-50)", color: "var(--brand-500)", padding: "5px 12px", borderRadius: "6px", fontWeight: 600, fontSize: "12.5px" }}>Built in</span></div>
              <div className="comp-cell competitor">Add-on</div>
              <div className="comp-cell competitor">Workaround</div>
              <div className="comp-cell competitor">3rd-party</div>

              <div className="comp-row-feature">Hardware choice</div>
              <div className="comp-cell" style={{ borderBottom: "1px solid var(--slate-100)" }}><span style={{ background: "var(--brand-50)", color: "var(--brand-500)", padding: "5px 12px", borderRadius: "6px", fontWeight: 600, fontSize: "12.5px" }}>Open</span></div>
              <div className="comp-cell competitor">Toast only</div>
              <div className="comp-cell competitor">Square only</div>
              <div className="comp-cell competitor">Clover only</div>

              <div className="comp-row-feature">Payment processor</div>
              <div className="comp-cell" style={{ borderBottom: "1px solid var(--slate-100)" }}><span style={{ background: "var(--brand-50)", color: "var(--brand-500)", padding: "5px 12px", borderRadius: "6px", fontWeight: 600, fontSize: "12.5px" }}>Configurable</span></div>
              <div className="comp-cell competitor">Toast Pay</div>
              <div className="comp-cell competitor">Square only</div>
              <div className="comp-cell competitor">Locked</div>

              <div className="comp-row-feature">Offline mode</div>
              <div className="comp-cell" style={{ borderBottom: "1px solid var(--slate-100)" }}><span style={{ background: "var(--brand-50)", color: "var(--brand-500)", padding: "5px 12px", borderRadius: "6px", fontWeight: 600, fontSize: "12.5px" }}>Full</span></div>
              <div className="comp-cell competitor">Limited</div>
              <div className="comp-cell competitor">Limited</div>
              <div className="comp-cell competitor">Limited</div>

              <div className="comp-row-feature">Cash audit log</div>
              <div className="comp-cell" style={{ borderBottom: "1px solid var(--slate-100)" }}><span style={{ background: "var(--brand-50)", color: "var(--brand-500)", padding: "5px 12px", borderRadius: "6px", fontWeight: 600, fontSize: "12.5px" }}>Automatic</span></div>
              <div className="comp-cell competitor">Manual</div>
              <div className="comp-cell competitor">Manual</div>
              <div className="comp-cell competitor">Manual</div>

              <div className="comp-row-feature">Contract length</div>
              <div className="comp-cell" style={{ borderBottom: "1px solid var(--slate-100)" }}><span style={{ background: "var(--brand-50)", color: "var(--brand-500)", padding: "5px 12px", borderRadius: "6px", fontWeight: 600, fontSize: "12.5px" }}>Month-to-month</span></div>
              <div className="comp-cell competitor">2–3 yr</div>
              <div className="comp-cell competitor">Variable</div>
              <div className="comp-cell competitor">Variable</div>

              <div className="comp-row" style={{ borderBottom: "none" }}>
                <div className="comp-row-feature" style={{ borderBottom: "none" }}>Multi-location</div>
              </div>
              <div className="comp-cell" style={{ borderBottom: "none" }}><span style={{ background: "var(--brand-50)", color: "var(--brand-500)", padding: "5px 12px", borderRadius: "6px", fontWeight: 600, fontSize: "12.5px" }}>Unlimited</span></div>
              <div className="comp-cell competitor" style={{ borderBottom: "none" }}>Tier-based</div>
              <div className="comp-cell competitor" style={{ borderBottom: "none" }}>Limited</div>
              <div className="comp-cell competitor" style={{ borderBottom: "none" }}>Per-device</div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="why-diff">
        <div className="wrap">
          <Reveal as="div" className="section-head center reveal">
            <div className="section-eyebrow">What sets us apart</div>
            <h2 className="section-title">Built different — and here&apos;s why it matters.</h2>
            <p className="section-sub">The table above is the summary. Here&apos;s the substance behind each line — the design decisions that change what your week actually looks like.</p>
          </Reveal>

          <Reveal as="div" className="diff-grid reveal-stagger">
            <div className="diff-card">
              <div className="diff-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></svg></div>
              <h3>Dual pricing, built in</h3>
              <p>Cash and card prices are structural to the platform — not a third-party add-on or a manual workaround. Customers see both prices, and you stop absorbing card fees on every single sale.</p>
            </div>
            <div className="diff-card">
              <div className="diff-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg></div>
              <h3>Open hardware</h3>
              <p>Run DEXA on the gear that fits your floor. No captive, single-vendor hardware — bring what you already own or choose from a wide range of terminals, tablets, and printers.</p>
            </div>
            <div className="diff-card">
              <div className="diff-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" /></svg></div>
              <h3>Configurable processor</h3>
              <p>Keep your processor or move to a better rate. DEXA isn&apos;t a payments company taking a slice of every swipe — the software is the product, so your processing stays competitive.</p>
            </div>
            <div className="diff-card">
              <div className="diff-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 1l22 22" /><path d="M16.72 11.06A10.94 10.94 0 0119 12.55" /><path d="M5 12.55a10.94 10.94 0 015.17-2.39" /><path d="M10.71 5.05A16 16 0 0122.58 9" /><path d="M1.42 9a15.91 15.91 0 014.7-2.88" /><path d="M8.53 16.11a6 6 0 016.95 0" /><line x1="12" y1="20" x2="12.01" y2="20" /></svg></div>
              <h3>Full offline mode</h3>
              <p>21 core operations keep running when the internet drops — orders, payments, drawers, refunds under manager PIN. The queue syncs in the right order the moment you reconnect.</p>
            </div>
            <div className="diff-card">
              <div className="diff-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" /></svg></div>
              <h3>Automatic cash audit</h3>
              <p>Every drawer event is logged with timestamp and PIN. Reconciliation, variance thresholds, and fraud detection are built into the platform — not bolted on after a discrepancy.</p>
            </div>
            <div className="diff-card">
              <div className="diff-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" /></svg></div>
              <h3>Month-to-month</h3>
              <p>Software is month-to-month; hardware you own outright. No multi-year lock-in, no early-termination fee, no auto-renewal that needs 90 days&apos; written notice to escape.</p>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="why-pricing">
        <div className="wrap">
          <Reveal as="div" className="wp-inner reveal">
            <div className="wp-copy">
              <div className="section-eyebrow">Honest pricing</div>
              <h2>Priced to scale.<br />Never to trap.</h2>
              <p>Start with what you need today and add only what your concept actually uses — kitchen display, online ordering, loyalty, delivery. Transparent monthly pricing, month-to-month, always.</p>
              <Link href="/pricing" className="btn btn-ghost-light">
                See full pricing
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
              </Link>
            </div>
            <div className="wp-plans">
              <div className="wp-plan"><span className="wp-price">$99</span><span className="lbl">/mo</span><span className="add">First station</span></div>
              <div className="wp-plan"><span className="wp-price">$49</span><span className="lbl">/mo</span><span className="add">Additional station</span></div>
              <div className="wp-plan"><span className="wp-price">$39</span><span className="lbl">/mo</span><span className="add">Handheld tablet</span></div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="faq-section">
        <div className="wrap">
          <Reveal as="div" className="section-head center reveal">
            <div className="section-eyebrow">Common questions</div>
            <h2 className="section-title">The questions operators ask.</h2>
            <p className="section-sub">Honest answers, no marketing spin.</p>
          </Reveal>

          <FaqAccordion items={faqItems} />
        </div>
      </section>

      <section className="cta-strip">
        <div className="wrap">
          <div className="section-eyebrow" style={{ color: "var(--brand-300)", justifyContent: "center" }}>Run the math</div>
          <h2>Compare against your current platform.</h2>
          <p>Send us a recent processing statement. We&apos;ll come back with a side-by-side cost breakdown — line by line — within one business day.</p>
          <div className="actions">
            <Link href="/contact" className="btn btn-request-a-demo" style={{ background: "var(--paper)", color: "var(--ink)" }}>
              Request the comparison
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
            </Link>
            <Link href="/demo" className="btn btn-ghost-light">Try the demo first</Link>
          </div>
        </div>
      </section>

    </>
  );
}
