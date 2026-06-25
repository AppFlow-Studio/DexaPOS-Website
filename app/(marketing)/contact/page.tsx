import type { Metadata } from "next";
import MarketingNav from "../_components/MarketingNav";
import MarketingFooter from "../_components/MarketingFooter";
import ContactForm from "../_components/ContactForm";
import "../contact.css";

export const metadata: Metadata = {
  title: "Request a Demo",
  description:
    "Schedule a 30-minute walkthrough of DEXA, configured for your restaurant.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <main className="mk-contact">
      <MarketingNav current="contact" />

      <section className="page-head">
        <div className="wrap">
          <div className="eyebrow reveal in">Get in touch</div>
          <h1 className="reveal in" style={{ transitionDelay: ".1s" }}>
            Let&apos;s see if DEXA is right for you.
          </h1>
          <p className="lede reveal in" style={{ transitionDelay: ".2s" }}>
            Tell us about your restaurant. We&apos;ll come back within one
            business day with a 30-minute demo configured for how you actually
            run service.
          </p>
        </div>
      </section>

      {/* CONTACT */}
      <section className="contact-section">
        <div className="wrap">
          <div className="contact-grid">
            {/* FORM */}
            <div className="form-card reveal in">
              <ContactForm />
            </div>

            {/* SIDE */}
            <div
              className="side-content reveal in"
              style={{ transitionDelay: ".1s" }}
            >
              <h2>What happens next.</h2>
              <p>No pressure, no hard sell. Here&apos;s our actual process:</p>

              <div className="step-list">
                <div className="step">
                  <div className="step-num">1</div>
                  <div className="step-content">
                    <h4>Day 1 — Discovery call</h4>
                    <p>
                      15 minutes. We learn about your concept, your current pain
                      points, and what you&apos;re trying to fix.{" "}
                      <strong>
                        If DEXA isn&apos;t a fit, we&apos;ll tell you on this
                        call.
                      </strong>
                    </p>
                  </div>
                </div>
                <div className="step">
                  <div className="step-num">2</div>
                  <div className="step-content">
                    <h4>Day 2–7 — Tailored demo</h4>
                    <p>
                      30-minute walkthrough on real hardware, with your menu
                      pre-loaded. We answer the operator-level questions and show
                      you the workflows your team will actually use.
                    </p>
                  </div>
                </div>
                <div className="step">
                  <div className="step-num">3</div>
                  <div className="step-content">
                    <h4>Day 8–30 — Migration &amp; cutover</h4>
                    <p>
                      If you decide to move forward, our team handles menu
                      rebuild, hardware setup, and one week of on-site coverage
                      during cutover.{" "}
                      <strong>You&apos;re never doing this alone.</strong>
                    </p>
                  </div>
                </div>
              </div>

              <div className="side-footer">
                <div className="side-footer-item">
                  <span className="side-footer-icon">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
                    </svg>
                  </span>
                  <span>
                    <strong>Or call us directly:</strong> (555) 555-DEXA
                  </span>
                </div>
                <div className="side-footer-item">
                  <span className="side-footer-icon">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                      <path d="M22 6l-10 7L2 6" />
                    </svg>
                  </span>
                  <span>
                    <strong>Email:</strong> support@dexaposai.com
                  </span>
                </div>
                <div className="side-footer-item">
                  <span className="side-footer-icon">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 7v5l3 2" />
                    </svg>
                  </span>
                  <span>
                    <strong>Hours:</strong> Mon–Fri, 8am–8pm ET · Support 24/7
                  </span>
                </div>
              </div>

              <figure
                style={{
                  margin: "32px 0 0",
                  borderRadius: "var(--radius-xl)",
                  overflow: "hidden",
                  border: "1px solid var(--slate-200)",
                  boxShadow: "var(--shadow-md)",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/dexa-og2.png"
                  alt="A DEXA POS station configured and ready for service"
                  style={{
                    width: "100%",
                    aspectRatio: "16 / 10",
                    objectFit: "cover",
                    display: "block",
                  }}
                />
              </figure>
            </div>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </main>
  );
}
