import type { Metadata } from "next";
import Link from "next/link";
import { Reveal } from "@/components/marketing/Reveal";
import AnimatedCounter from "@/components/marketing/AnimatedCounter";
import SectionRenderer from "@/components/cms/SectionRenderer";
import { getCmsPage } from "@/lib/cms/get-cms-page";
import "./industries.css";

export async function generateMetadata(): Promise<Metadata> {
  const cms = await getCmsPage("/industries");
  return {
    title: cms?.title || "Industries",
    description: cms?.description || "DEXA serves quick-service, full-service, fast-casual, bars, pizzerias, bakeries, food trucks, stadiums, and more. Find the right fit for your concept.",
    openGraph: { title: cms?.title || "DEXA Industries", url: "/industries" },
  };
}

export default async function IndustriesPage() {
  const cms = await getCmsPage("/industries");
  if (cms?.sections?.length) {
    return <SectionRenderer route="/industries" sections={cms.sections} />;
  }

  return (
    <>
      <section className="page-head">
        <div className="wrap">
          <Reveal as="div" className="eyebrow reveal">Industries</Reveal>
          <Reveal as="h1" className="reveal" style={{ transitionDelay: ".1s" }}>Built for the way your concept runs.</Reveal>
          <Reveal as="p" className="lede reveal" style={{ transitionDelay: ".2s" }}>DEXA configures itself for eight different restaurant concepts, with the right defaults already set for your operation.</Reveal>
        </div>
      </section>

      <section className="ind-grid">
        <div className="wrap">
          <Reveal as="div" className="ind-row reveal-stagger">
            {industries.map((item) => (
              <div key={item.title} className="ind-card">
                <div className="ind-image" style={{ backgroundImage: `url(${item.image})` }} />
                <div className="ind-body">
                  <h3>{item.title}</h3>
                  <p>{item.desc}</p>
                  <div className="ind-pills">
                    {item.tags.map((t: string) => (
                      <span key={t}>{t}</span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      <section className="multi-loc">
        <div className="wrap">
          <Reveal className="reveal">
            <div className="multi-card">
              <div className="multi-content">
                <div className="multi-eyebrow">Multi-Location</div>
                <h2>One platform. Every location.</h2>
                <p>Central menu management, per-location overrides, group reporting, and secure tenant isolation. Scale from one restaurant to fifty without changing tools — or training your managers twice.</p>
                <div className="multi-stats">
                  <div className="multi-stat">
                    <div className="multi-stat-num"><AnimatedCounter value={47} /></div>
                    <div className="multi-stat-label">Largest deployment</div>
                  </div>
                  <div className="multi-stat">
                    <div className="multi-stat-num"><AnimatedCounter value={1} /></div>
                    <div className="multi-stat-label">Dashboard for all</div>
                  </div>
                </div>
                <Link href="/contact" className="btn btn-request-a-demo" style={{ background: "var(--paper)", color: "var(--ink)" }}>
                  Talk to our multi-location team
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
                </Link>
              </div>
              <div className="multi-image" style={{ backgroundImage: "url('/dexa-platform.png')" }} />
            </div>
          </Reveal>
        </div>
      </section>

      <section className="cta-strip">
        <div className="wrap">
          <div className="section-eyebrow" style={{ color: "var(--brand-300)", justifyContent: "center" }}>Built for your concept</div>
          <h2>Let&apos;s configure it for your operation.</h2>
          <p>Tell us your concept on the demo call and we&apos;ll bring DEXA up pre-configured — with the right defaults, the right hardware, and the right integrations for how you actually run service.</p>
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

const industries = [
  {
    title: "Quick-Service",
    desc: "Built for speed. Counter-first ordering, two-tap modifiers, fast-pay integration. Average ticket time under 90 seconds.",
    tags: ["Counter-first UI", "Speed-of-service tracking", "Drive-thru ready"],
    image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=80",
  },
  {
    title: "Fine Dining",
    desc: "Coursing, seat-level tracking, allergen flagging, and tableside payment. The hospitality details that matter at $80 entrée tickets.",
    tags: ["Coursing", "Seat-level orders", "Wine list integration"],
    image: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80",
  },
  {
    title: "Cafés & Coffee Shops",
    desc: "Morning rush handled. Recipe-linked inventory tracks beans, milks, and syrups in real time. Loyalty enrollment by phone number.",
    tags: ["Recipe inventory", "Phone loyalty", "Modifier-heavy menus"],
    image: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=900&q=80",
  },
  {
    title: "Pizzerias",
    desc: "Half-and-half toppings, by-the-slice pricing, delivery dispatch. Native integrations with Slice, Uber Eats, DoorDash, and Grubhub.",
    tags: ["Half-and-half", "Slice integration", "Delivery dispatch"],
    image: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=900&q=80",
  },
  {
    title: "Food Trucks",
    desc: "LTE-friendly. Fully offline-capable. Mobile printer support, single-tablet operation. Park anywhere, sell anywhere.",
    tags: ["Offline-first", "LTE optimized", "Single-tablet mode"],
    image: "https://images.unsplash.com/photo-1595257841889-eca2678454e2?auto=format&fit=crop&w=900&q=80",
  },
  {
    title: "Bars & Lounges",
    desc: "Open tabs with pre-auth, complex split checks, bottle-service tracking. Manager-PIN voids, cash-drawer audit trail.",
    tags: ["Open tabs", "Pre-auth holds", "Complex splits"],
    image: "https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=900&q=80",
  },
  {
    title: "Delis & Markets",
    desc: "Weight-based pricing, bulk-item barcodes, mixed retail and prepared food. Tax handling that knows the difference.",
    tags: ["Scale integration", "Barcode scanner", "Mixed tax rules"],
    image: "https://images.unsplash.com/photo-1606787366850-de6330128bfc?auto=format&fit=crop&w=900&q=80",
  },
  {
    title: "Catering & Events",
    desc: "Pre-order workflow, deposit handling, headcount-based pricing. Custom invoicing with line-item breakdowns for corporate accounts.",
    tags: ["Pre-orders", "Deposits", "Custom invoicing"],
    image: "https://images.unsplash.com/photo-1551218808-94e220e084d2?auto=format&fit=crop&w=900&q=80",
  },
];
