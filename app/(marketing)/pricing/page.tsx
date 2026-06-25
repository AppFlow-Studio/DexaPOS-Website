import type { Metadata } from "next";
import MarketingNav from "../_components/MarketingNav";
import MarketingFooter from "../_components/MarketingFooter";
import CountUp from "../_components/CountUp";
import PricingCalculator from "../_components/PricingCalculator";
import "../pricing.css";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Transparent monthly pricing for DEXA POS. Build your plan with the live calculator. First station $99/mo, additional stations $49/mo, plus à la carte add-ons for KDS, online ordering, loyalty, delivery, and multi-location operators.",
  alternates: { canonical: "/pricing" },
};

const CHECK = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M5 12l5 5L20 7" /></svg>
);
const STAR = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z" /></svg>
);

export default function PricingPage() {
  return (
    <main className="mk-pricing">
      <MarketingNav current="pricing" />

      {/* HERO */}
      <section className="pricing-hero">
        <div className="wrap">
          <div className="reveal in">
            <div className="eyebrow">Pricing</div>
            <h1>Honest pricing.<br />Real numbers.<br /><span className="accent">No tricks.</span></h1>
            <p className="lede">Build the plan that fits your floor. One POS station, or fifty. Pay only for what you turn on. No multi-year contracts, no hidden hardware leases, no per-transaction commissions on direct orders.</p>
            <div className="hero-cta">
              <a href="#calculator" className="btn btn-primary">
                Calculate your price
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              </a>
              <a href="/contact" className="btn btn-ghost">Request a demo</a>
            </div>
            <div className="hero-trust">
              <span className="dots"><span></span><span></span><span></span></span>
              Trusted by <b>1,284 restaurants</b> across 38 states
            </div>
          </div>

          {/* Hero preview card */}
          <div className="hero-preview reveal in" style={{ transitionDelay: ".15s" }}>
            <div className="preview-head">
              <h4>Typical full-service setup</h4>
              <span className="live-pill"><span className="pulse"></span>Live</span>
            </div>
            <div className="preview-line"><div className="item"><span className="qty">1×</span>First POS station</div><div className="price">$99</div></div>
            <div className="preview-line"><div className="item"><span className="qty">1×</span>POS tablet</div><div className="price">$39</div></div>
            <div className="preview-line"><div className="item"><span className="qty">1×</span>Kitchen Display</div><div className="price">$29</div></div>
            <div className="preview-total">
              <div>
                <div className="label">Total</div>
                <div style={{ fontSize: 11, color: "var(--slate-500)", marginTop: 4 }}>No setup fees</div>
              </div>
              <div className="amount">$167<span className="per">/mo</span></div>
            </div>
            <p className="preview-foot">Configure your exact plan below ↓</p>
          </div>
        </div>
      </section>

      {/* CALCULATOR */}
      <section className="psec" id="calculator">
        <div className="wrap">
          <div className="section-head reveal in">
            <div className="section-eyebrow">Build your plan</div>
            <h2 className="section-title">Calculate your monthly cost.</h2>
            <p className="section-sub">Move the controls. The total updates live — no email signup, no quote request, just the real price you&apos;d pay.</p>
          </div>

          <PricingCalculator />
        </div>
      </section>

      {/* CORE POS CARDS */}
      <section className="psec alt">
        <div className="wrap">
          <div className="section-head reveal in">
            <div className="section-eyebrow">Core POS</div>
            <h2 className="section-title">Start with what you need today.</h2>
            <p className="section-sub">Add stations as your floor grows. Every device runs the same full DEXA platform — no feature tiers, no upsells, no &ldquo;you&apos;ll need to upgrade for that.&rdquo;</p>
          </div>

          <div className="price-grid reveal-stagger in">
            <div className="price-card featured">
              <span className="pill-feat">Start here</span>
              <div className="icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="14" rx="2" /><path d="M8 22h8M12 18v4" /></svg>
              </div>
              <h3>First POS Station</h3>
              <div className="price-row">
                <span className="price">$99</span><span className="price-suffix">/month</span>
              </div>
              <p className="desc">Your main register. Full DEXA platform — ordering, payments, menu management, reporting, inventory, staff. One price, every feature.</p>
              <ul className="feat-list">
                <li>{CHECK}Unlimited orders &amp; transactions</li>
                <li>{CHECK}Full reporting &amp; analytics</li>
                <li>{CHECK}Menu management &amp; modifiers</li>
                <li>{CHECK}24/7 support included</li>
              </ul>
            </div>

            <div className="price-card">
              <div className="icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="11" height="11" rx="2" /><rect x="11" y="9" width="11" height="11" rx="2" /></svg>
              </div>
              <h3>Additional Station</h3>
              <div className="price-row">
                <span className="price">$49</span><span className="price-suffix">/month each</span>
              </div>
              <p className="desc">Every register after the first. Same full platform, half the price. Add as many as your floor needs — bar, counter, takeout window.</p>
              <ul className="feat-list">
                <li>{CHECK}Real-time sync with main station</li>
                <li>{CHECK}Shared menu, staff, &amp; reports</li>
                <li>{CHECK}No feature limits</li>
                <li>{CHECK}Add or remove anytime</li>
              </ul>
            </div>

            <div className="price-card">
              <div className="icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" /><circle cx="12" cy="18" r="1" /></svg>
              </div>
              <h3>POS Tablet</h3>
              <div className="price-row">
                <span className="price">$39</span><span className="price-suffix">/month each</span>
              </div>
              <p className="desc">Handheld tableside ordering. Servers send tickets straight to the kitchen and run cards at the table. Perfect for full-service and patios.</p>
              <ul className="feat-list">
                <li>{CHECK}Tableside ordering &amp; payments</li>
                <li>{CHECK}Works on iPad or Android</li>
                <li>{CHECK}Auto-fires to Kitchen Display</li>
                <li>{CHECK}Bluetooth printer support</li>
              </ul>
            </div>
          </div>

          {/* Always included */}
          <div className="included-strip reveal in">
            <div className="included-head">
              <div className="text">
                <h3>Always included, every plan.</h3>
                <p>You won&apos;t see these as line items. They come standard with every DEXA subscription.</p>
              </div>
              <span className="badge">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12l5 5L20 7" /></svg>
                No extra cost
              </span>
            </div>
            <div className="included-grid">
              <div className="included-item"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12l5 5L20 7" /></svg>24/7 phone &amp; chat support</div>
              <div className="included-item"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12l5 5L20 7" /></svg>Free software updates</div>
              <div className="included-item"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12l5 5L20 7" /></svg>Onboarding &amp; training</div>
              <div className="included-item"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12l5 5L20 7" /></svg>Real-time reporting</div>
              <div className="included-item"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12l5 5L20 7" /></svg>Menu &amp; modifier management</div>
              <div className="included-item"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12l5 5L20 7" /></svg>Staff &amp; shift management</div>
              <div className="included-item"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12l5 5L20 7" /></svg>Inventory tracking</div>
              <div className="included-item"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12l5 5L20 7" /></svg>Offline mode &amp; auto-sync</div>
            </div>
          </div>
        </div>
      </section>

      {/* ADD-ONS */}
      <section className="psec">
        <div className="wrap">
          <div className="section-head reveal in">
            <div className="section-eyebrow">Add-ons</div>
            <h2 className="section-title">Bolt on what your concept actually uses.</h2>
            <p className="section-sub">Every add-on is optional and priced à la carte. Turn them on when you&apos;re ready, turn them off if your needs change.</p>
          </div>

          <div className="addons-grid reveal-stagger in">
            <div className="addon-card">
              <div className="addon-head">
                <div className="addon-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M2 20h20M12 16v4" /></svg></div>
                <div className="addon-meta-col">
                  <div className="addon-price">$29<span className="per">/mo each</span></div>
                </div>
              </div>
              <div className="addon-name">Kitchen Display (KDS)</div>
              <p className="addon-desc">Replace paper tickets. Orders fire from the POS to the kitchen with station routing, course timing, and bump-to-done tracking.</p>
              <span className="addon-tag">Operations</span>
            </div>

            <div className="addon-card">
              <div className="addon-head">
                <div className="addon-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2c2.5 3 4 6.5 4 10s-1.5 7-4 10c-2.5-3-4-6.5-4-10s1.5-7 4-10z" /></svg></div>
                <div className="addon-meta-col">
                  <div className="addon-price">$100<span className="per">/month</span></div>
                </div>
              </div>
              <div className="addon-name">Online Ordering</div>
              <p className="addon-desc">Branded ordering page on your own website. Pickup, delivery, scheduled orders. No per-transaction commission — flat monthly fee only.</p>
              <span className="addon-tag">Direct revenue</span>
            </div>

            <div className="addon-card">
              <div className="addon-head">
                <div className="addon-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z" /></svg></div>
                <div className="addon-meta-col">
                  <div className="addon-price">$79<span className="per">/month</span></div>
                </div>
              </div>
              <div className="addon-name">Loyalty Program</div>
              <p className="addon-desc">Points, rewards, birthday offers, and SMS marketing. Customers enroll at the register or online. Lifetime-value reporting built in.</p>
              <span className="addon-tag">Retention</span>
            </div>

            <div className="addon-card">
              <div className="addon-head">
                <div className="addon-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 17H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v2" /><path d="M14 17h7l-2-4h-5z" /><circle cx="7.5" cy="17.5" r="2" /><circle cx="17.5" cy="17.5" r="2" /></svg></div>
                <div className="addon-meta-col">
                  <div className="addon-price">$79<span className="per">/month</span></div>
                </div>
              </div>
              <div className="addon-name">Delivery App Integration</div>
              <p className="addon-desc">Uber Eats, Grubhub, and DoorDash orders flow into the same POS and Kitchen Display. One menu to update. One ticket queue to manage.</p>
              <span className="addon-tag">Third-party</span>
            </div>

            <div className="addon-card">
              <div className="addon-head">
                <div className="addon-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-6 9 6v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z" /><path d="M9 22V12h6v10" /></svg></div>
                <div className="addon-meta-col">
                  <div className="addon-price">$399<span className="per">/month</span></div>
                </div>
              </div>
              <div className="addon-name">Franchise Package</div>
              <p className="addon-desc">Centralized menu, pricing, and reporting across every location. Royalty calculations, brand-wide compliance controls, multi-unit dashboards.</p>
              <span className="addon-tag">Multi-location</span>
            </div>

            <div className="addon-card cta-card">
              <div className="addon-head">
                <div className="addon-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg></div>
              </div>
              <div className="addon-name">Something else?</div>
              <p className="addon-desc">Custom integrations, accounting sync, gift cards, scheduling tools — many integrations are included or partner-priced. Tell us your stack.</p>
              <a href="/contact" className="cta-link">
                Talk to sales
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* MINI COMPARE */}
      <section className="psec alt">
        <div className="wrap">
          <div className="section-head reveal in">
            <div className="section-eyebrow">DEXA vs the rest</div>
            <h2 className="section-title">How our pricing stacks up.</h2>
            <p className="section-sub">The competitor numbers below are what their published rates look like on paper. The real-world story — required hardware, processor lock-in, contract length — is where most of the cost actually lives.</p>
          </div>

          <div className="compare-card reveal in">
            <table className="compare-table">
              <thead>
                <tr>
                  <th></th>
                  <th className="dexa-col">DEXA</th>
                  <th>Toast</th>
                  <th>Square for Restaurants</th>
                  <th>Clover</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="row-label">Starting monthly</td>
                  <td className="dexa-col">$99/mo</td>
                  <td>$0–$69/mo*</td>
                  <td>$0–$60/mo*</td>
                  <td>$50–$100/mo*</td>
                </tr>
                <tr>
                  <td className="row-label">Contract length</td>
                  <td className="dexa-col"><span className="check-yes">{CHECK}Month-to-month</span></td>
                  <td><span className="check-no">2-year typical</span></td>
                  <td><span className="check-yes" style={{ color: "var(--slate-600)" }}>Month-to-month</span></td>
                  <td><span className="check-no">36-month typical</span></td>
                </tr>
                <tr>
                  <td className="row-label">Choose your processor</td>
                  <td className="dexa-col"><span className="check-yes">{CHECK}Yes</span></td>
                  <td><span className="check-no"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M6 6l12 12M18 6l-12 12" /></svg>Toast only</span></td>
                  <td><span className="check-no"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M6 6l12 12M18 6l-12 12" /></svg>Square only</span></td>
                  <td><span className="check-no"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M6 6l12 12M18 6l-12 12" /></svg>Fiserv only</span></td>
                </tr>
                <tr>
                  <td className="row-label">Hardware lock-in</td>
                  <td className="dexa-col"><span className="check-yes">{CHECK}None — bring your own</span></td>
                  <td><span className="check-no"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M6 6l12 12M18 6l-12 12" /></svg>Required leases</span></td>
                  <td><span className="check-no">Square hardware only</span></td>
                  <td><span className="check-no"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M6 6l12 12M18 6l-12 12" /></svg>Clover devices only</span></td>
                </tr>
                <tr>
                  <td className="row-label">Online ordering commission</td>
                  <td className="dexa-col"><span className="check-yes">0% — flat $100/mo</span></td>
                  <td>Up to 3.5% + flat</td>
                  <td>Variable</td>
                  <td>Per-order fees</td>
                </tr>
                <tr>
                  <td className="row-label">Offline mode</td>
                  <td className="dexa-col"><span className="check-yes">{CHECK}Full POS works offline</span></td>
                  <td><span className="check-yes" style={{ color: "var(--slate-600)" }}>Limited</span></td>
                  <td><span className="check-no">Payments require connection</span></td>
                  <td><span className="check-yes" style={{ color: "var(--slate-600)" }}>Limited</span></td>
                </tr>
              </tbody>
            </table>
            <div className="compare-foot">
              <span>* Competitor pricing typically excludes mandatory processor markup, hardware financing, and add-on commissions.</span>
              <a href="/why">See the full comparison <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg></a>
            </div>
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="psec dark">
        <div className="wrap">
          <div className="section-head reveal in">
            <div className="section-eyebrow">Trusted by operators</div>
            <h2 className="section-title">What restaurants pay — and what they say.</h2>
            <p className="section-sub">Three operators. Three concepts. Three honest takes on what they actually spend each month.</p>
          </div>

          <div className="testimonials-grid reveal-stagger in">
            <div className="testimonial">
              <div className="quote-mark">&ldquo;</div>
              <blockquote>We saved $400/month switching from Toast. No more processor markup, no more leases. The dashboard tells me what I actually need to know — covers per server, food cost by item, the bar&apos;s busy hour. That&apos;s it. No fluff.</blockquote>
              <div className="stars">{STAR}{STAR}{STAR}{STAR}{STAR}</div>
              <div className="testimonial-author">
                <div className="author-avatar">CW</div>
                <div className="author-info">
                  <span className="name">Casey Walker</span>
                  <span className="role">Owner, Maple &amp; Vine · Pays $245/mo</span>
                </div>
              </div>
            </div>

            <div className="testimonial">
              <div className="quote-mark">&ldquo;</div>
              <blockquote>Three locations, one POS, one bill. Pricing scales with us, not against us. When we opened location three, I added two stations, a tablet, and a KDS in twenty minutes — no contract renegotiation, no rep calls.</blockquote>
              <div className="stars">{STAR}{STAR}{STAR}{STAR}{STAR}</div>
              <div className="testimonial-author">
                <div className="author-avatar">MC</div>
                <div className="author-info">
                  <span className="name">Marcus Chen</span>
                  <span className="role">Founder, Coastal Bowls · 3 locations · Pays $1,184/mo</span>
                </div>
              </div>
            </div>

            <div className="testimonial">
              <div className="quote-mark">&ldquo;</div>
              <blockquote>I was scared of switching POS systems mid-service. DEXA&apos;s onboarding team had us running in three days with zero downtime. The price is the price. No surprises on the second invoice. That alone was worth it.</blockquote>
              <div className="stars">{STAR}{STAR}{STAR}{STAR}{STAR}</div>
              <div className="testimonial-author">
                <div className="author-avatar">ER</div>
                <div className="author-info">
                  <span className="name">Elena Rodriguez</span>
                  <span className="role">Owner, Cocina Verde · Pays $128/mo</span>
                </div>
              </div>
            </div>
          </div>

          <div className="trust-stats reveal in">
            <div className="trust-stat">
              <div className="num"><CountUp value={1284} /></div>
              <div className="lbl">Active restaurants</div>
            </div>
            <div className="trust-stat">
              <div className="num"><span className="prefix">$</span><CountUp value={48.2} decimals={1} /><span className="suffix">M</span></div>
              <div className="lbl">Processed daily</div>
            </div>
            <div className="trust-stat">
              <div className="num"><CountUp value={99.99} decimals={2} /><span className="suffix">%</span></div>
              <div className="lbl">Uptime, 90 days</div>
            </div>
            <div className="trust-stat">
              <div className="num"><CountUp value={3.2} decimals={1} /><span className="suffix">min</span></div>
              <div className="lbl">Avg support response</div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="psec">
        <div className="wrap">
          <div className="section-head reveal in">
            <div className="section-eyebrow">FAQ</div>
            <h2 className="section-title">The questions everyone asks.</h2>
            <p className="section-sub">Pricing should be the easy part. Here&apos;s everything we get asked before someone signs up.</p>
          </div>

          <div className="faq-list reveal in">
            <details className="faq-item">
              <summary>What happens if I add or remove a station mid-month?</summary>
              <div className="faq-answer">
                <p>Pro-rated, both ways. Add a station on day 15 and you&apos;re billed for half a month at $49. Remove one and you get a credit on your next invoice. No conversations with sales required.</p>
              </div>
            </details>
            <details className="faq-item">
              <summary>Do I have to use DEXA&apos;s payment processor?</summary>
              <div className="faq-answer">
                <p>No. DEXA is processor-agnostic — keep the one you have, or use ours for competitive flat-rate pricing. The monthly subscription is software only. Unlike Toast or Clover, we don&apos;t lock you into a specific payment processor.</p>
              </div>
            </details>
            <details className="faq-item">
              <summary>What exactly counts as a &ldquo;station&rdquo;?</summary>
              <div className="faq-answer">
                <p>One full POS terminal — typically a countertop register. Tablets used for tableside service are priced separately at $39/mo and don&apos;t count as stations. Kitchen Displays are also separate at $29/mo. A &ldquo;station&rdquo; is specifically a primary checkout point.</p>
              </div>
            </details>
            <details className="faq-item">
              <summary>Are there any setup fees or hidden costs?</summary>
              <div className="faq-answer">
                <p>None. Onboarding, menu setup, hardware configuration, and staff training are all included in your monthly subscription. The only thing we charge for outside the monthly subscription is hardware itself, and only if you buy it from us (you can also bring your own).</p>
              </div>
            </details>
            <details className="faq-item">
              <summary>What if I want to cancel?</summary>
              <div className="faq-answer">
                <p>30 days&apos; notice. No cancellation fees, no contract penalties, no exit charges. We export all your menu, sales history, and customer data so you can take it with you. We&apos;d rather earn your business every month than trap you.</p>
              </div>
            </details>
            <details className="faq-item">
              <summary>Do you offer volume discounts?</summary>
              <div className="faq-answer">
                <p>Yes — for operators running 5+ locations or 10+ stations, enterprise pricing kicks in. The Franchise Package at $399/mo already includes most multi-location tooling. For larger groups, <a href="/contact">talk to us</a> and we&apos;ll build a custom quote.</p>
              </div>
            </details>
            <details className="faq-item">
              <summary>What&apos;s included in 24/7 support?</summary>
              <div className="faq-answer">
                <p>Phone, chat, and email — answered by a real human in under 4 minutes on average. We don&apos;t tier support by plan size. The single-location food truck gets the same priority as the 50-location chain.</p>
              </div>
            </details>
            <details className="faq-item">
              <summary>Can I bring my own hardware?</summary>
              <div className="faq-answer">
                <p>Absolutely. DEXA runs on iPad, Android tablets, and most existing POS hardware (Castles, Dejavoo, Star Micronics, Landi, and more — see our <a href="/hardware">compatibility list</a>). Software pricing is the same whether you bring your own or buy through us.</p>
              </div>
            </details>
          </div>
        </div>
      </section>

      {/* CTA STRIP */}
      <section className="cta-strip">
        <div className="wrap">
          <div className="section-eyebrow" style={{ color: "var(--brand-300)", justifyContent: "center" }}>Ready when you are</div>
          <h2>Get a real quote for your restaurant.</h2>
          <p>Tell us your concept, your floor count, and what you&apos;d want turned on. We&apos;ll send back an exact monthly price and walk you through the platform in 30 minutes.</p>
          <div className="actions">
            <a href="/contact" className="btn btn-primary" style={{ background: "var(--paper)", color: "var(--ink)" }}>
              Request a Demo
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
            </a>
            <a href="/demo" className="btn btn-ghost-light">Try the live demo</a>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}
