import type { Metadata } from "next";
import Link from "next/link";
import SectionRenderer from "@/components/cms/SectionRenderer";
import { getCmsPage } from "@/lib/cms/get-cms-page";
import "./hardware.css";

export async function generateMetadata(): Promise<Metadata> {
  const cms = await getCmsPage("/hardware");
  return {
    title: cms?.title || "Hardware",
    description: cms?.description || "Purpose-built restaurant hardware from DEXA — terminals, printers, tablets, payment devices, and kiosks designed for your front-of-house and back-of-house.",
    openGraph: { title: cms?.title || "DEXA Hardware", url: "/hardware" },
  };
}

export default async function HardwarePage() {
  const cms = await getCmsPage("/hardware");
  if (cms?.sections?.length) {
    return <SectionRenderer route="/hardware" sections={cms.sections} />;
  }

  return (
    <>
      <section className="page-head">
        <div className="wrap">
          <div className="eyebrow reveal in">Hardware</div>
          <h1 className="reveal in" style={{ transitionDelay: ".1s" }}>Run on the gear that fits your floor.</h1>
          <p className="lede reveal in" style={{ transitionDelay: ".2s" }}>DEXA is hardware-agnostic by design. iPad, Android, Castles, Dejavoo, Star Micronics, Landi — mix and match. No mandatory devices, no multi-year leases.</p>
        </div>
      </section>

      <section className="hw-cats">
        <div className="wrap">
          <div className="section-head reveal in">
            <div className="section-eyebrow">What you&apos;ll need</div>
            <h2 className="section-title">Four categories. Endless flexibility.</h2>
          </div>

          <div className="hw-grid reveal-stagger in">
            <div className="hw-card">
              <div className="hw-image" style={{ backgroundImage: "url('/dexa-pos-terminals.png')" }}></div>
              <div className="hw-body">
                <h3>POS Terminals</h3>
                <p>Run DEXA on landscape Android, iPad, or all-in-one terminals. Bring your own gear, or use ours — your data lives in the cloud, not the device.</p>
                <div className="hw-models">
                  <span>iPad (7th gen+)</span>
                  <span>Galaxy Tab A8</span>
                  <span>Lenovo M10</span>
                  <span>Landi C20Pro</span>
                </div>
              </div>
            </div>

            <div className="hw-card">
              <div className="hw-image" style={{ backgroundImage: "url('/dexa-terminal.png')" }}></div>
              <div className="hw-body">
                <h3>Payment Terminals</h3>
                <p>EMV chip, NFC tap-to-pay, Apple Pay and Google Pay supported. Wi-Fi primary with USB fallback. No processor lock-in.</p>
                <div className="hw-models">
                  <span>Castles Saturn1000</span>
                  <span>Dejavoo P18</span>
                  <span>Dejavoo P8</span>
                  <span>DVPayLite</span>
                </div>
              </div>
            </div>

            <div className="hw-card">
              <div className="hw-image" style={{ backgroundImage: "url('/dexa-printers.png')" }}></div>
              <div className="hw-body">
                <h3>Receipt &amp; Kitchen Printers</h3>
                <p>Wi-Fi auto-discovery, per-station routing, ESC/POS standard. Thermal for the front, impact for the kitchen — both work out of the box.</p>
                <div className="hw-models">
                  <span>Star TSP100III</span>
                  <span>Star SP742</span>
                  <span>Generic ESC/POS</span>
                </div>
              </div>
            </div>

            <div className="hw-card">
              <div className="hw-image" style={{ backgroundImage: "url('/dexa-cashdrawer.png')" }}></div>
              <div className="hw-body">
                <h3>Cash Drawers &amp; Displays</h3>
                <p>Standard 12V/24V cash drawers. Customer-Facing Display pairs over QR — any spare Android tablet works. Kitchen Display on any 15-22&quot; screen.</p>
                <div className="hw-models">
                  <span>APG Vasario</span>
                  <span>MMF Heritage</span>
                  <span>Any Android CFD</span>
                  <span>Any KDS display</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="principles">
        <div className="wrap">
          <div className="section-head reveal in">
            <div className="section-eyebrow">How it works</div>
            <h2 className="section-title">Three principles that keep your hardware reliable.</h2>
          </div>

          <div className="princ-grid reveal-stagger in">
            <div className="princ">
              <div className="princ-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2 8.5C5 5.5 9 4 12 4s7 1.5 10 4.5" /><path d="M5 12c2-2 4.5-3 7-3s5 1 7 3" /><path d="M8 15.5c1-1 2.5-1.5 4-1.5s3 0.5 4 1.5" /><circle cx="12" cy="19" r="1.5" fill="currentColor" /></svg>
              </div>
              <h3>Auto-discovery</h3>
              <p>Plug a printer or terminal into your network — DEXA finds it automatically. No driver downloads, no IP configuration, no setup wizards.</p>
            </div>
            <div className="princ">
              <div className="princ-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="9" width="18" height="6" rx="1" /><rect x="6" y="6" width="3" height="3" /><rect x="15" y="6" width="3" height="3" /></svg>
              </div>
              <h3>USB fallback</h3>
              <p>If Wi-Fi drops, USB takes over within milliseconds. Plug, unplug, replug — the system reroutes seamlessly. No configuration needed.</p>
            </div>
            <div className="princ">
              <div className="princ-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 010 18" /></svg>
              </div>
              <h3>Cloud sync</h3>
              <p>Terminals replicate to the cloud over secure connections, but the device is authoritative locally. You&apos;ll never lose a transaction to a network outage.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="compat">
        <div className="wrap">
          <div className="compat-card reveal in">
            <div>
              <h3>Already own gear? You probably keep most of it.</h3>
              <p>Send us a list of your current hardware. We&apos;ll come back with a compatibility report within one business day. Most operators reuse 60–80% of their existing gear when migrating to DEXA.</p>
              <Link href="/contact" className="btn btn-request-a-demo" style={{ background: "var(--paper)", color: "var(--ink)" }}>
                Check Compatibility
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
              </Link>
            </div>
            <div className="compat-stats">
              <div className="compat-stat">
                <div className="compat-stat-num">60-80<span>%</span></div>
                <div className="compat-stat-label">Hardware reusable</div>
              </div>
              <div className="compat-stat">
                <div className="compat-stat-num">0</div>
                <div className="compat-stat-label">Multi-year leases</div>
              </div>
              <div className="compat-stat">
                <div className="compat-stat-num">4<span>+</span></div>
                <div className="compat-stat-label">Terminal vendors</div>
              </div>
              <div className="compat-stat">
                <div className="compat-stat-num">1<span>day</span></div>
                <div className="compat-stat-label">Compat report</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="cta-strip">
        <div className="wrap">
          <div className="section-eyebrow" style={{ color: "var(--brand-300)", justifyContent: "center" }}>See it on real hardware</div>
          <h2>The right gear for your concept.</h2>
          <p>We&apos;ll bring the right hardware to your demo — Castles for high-volume, Dejavoo handhelds for tableside, Landi C20Pro for compact setups.</p>
          <div className="actions">
            <Link href="/contact" className="btn btn-request-a-demo" style={{ background: "var(--paper)", color: "var(--ink)" }}>
              Request a Demo
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
            </Link>
            <Link href="/industries" className="btn btn-ghost-light">See by industry</Link>
          </div>
        </div>
      </section>

    </>
  );
}
