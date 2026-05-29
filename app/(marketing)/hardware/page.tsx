import type { Metadata } from "next";
import MarketingNav from "../_components/MarketingNav";
import MarketingFooter from "../_components/MarketingFooter";

export const metadata: Metadata = {
  title: "Hardware — DEXA POS",
  description:
    "Run DEXA on the gear that fits your floor. iPad, Android, Castles, Dejavoo, Star Micronics, Landi.",
};

export default function HardwarePage() {
  return (
    <>
      <MarketingNav current="hardware" />

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
            <HwCard
              img="https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&w=900&q=80"
              title="POS Terminals"
              desc="Run DEXA on landscape Android, iPad, or all-in-one terminals. Bring your own gear, or use ours — your data lives in the cloud, not the device."
              models={["iPad (7th gen+)", "Galaxy Tab A8", "Lenovo M10", "Landi C20Pro"]}
            />
            <HwCard
              img="https://images.unsplash.com/photo-1556742044-3c52d6e88c62?auto=format&fit=crop&w=900&q=80"
              title="Payment Terminals"
              desc="EMV chip, NFC tap-to-pay, Apple Pay and Google Pay supported. Wi-Fi primary with USB fallback. No processor lock-in."
              models={["Castles Saturn1000", "Dejavoo P18", "Dejavoo P8", "DVPayLite"]}
            />
            <HwCard
              img="https://images.unsplash.com/photo-1556742111-a301076d9d18?auto=format&fit=crop&w=900&q=80"
              title="Receipt & Kitchen Printers"
              desc="Wi-Fi auto-discovery, per-station routing, ESC/POS standard. Thermal for the front, impact for the kitchen — both work out of the box."
              models={["Star TSP100III", "Star SP742", "Generic ESC/POS"]}
            />
            <HwCard
              img="https://images.unsplash.com/photo-1556742393-d75f468bfcb0?auto=format&fit=crop&w=900&q=80"
              title="Cash Drawers & Displays"
              desc='Standard 12V/24V cash drawers. Customer-Facing Display pairs over QR — any spare Android tablet works. Kitchen Display on any 15-22" screen.'
              models={["APG Vasario", "MMF Heritage", "Any Android CFD", "Any KDS display"]}
            />
          </div>
        </div>
      </section>

      {/* PRINCIPLES */}
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

      {/* COMPATIBILITY */}
      <section className="compat">
        <div className="wrap">
          <div className="compat-card reveal in">
            <div>
              <h3>Already own gear? You probably keep most of it.</h3>
              <p>Send us a list of your current hardware. We&apos;ll come back with a compatibility report within one business day. Most operators reuse 60–80% of their existing gear when migrating to DEXA.</p>
              <a href="/contact" className="btn btn-primary" style={{ background: "var(--paper)", color: "var(--ink)" }}>
                Check Compatibility
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
              </a>
            </div>
            <div className="compat-stats">
              <CompatStat num="60-80" suffix="%" label="Hardware reusable" />
              <CompatStat num="0" label="Multi-year leases" />
              <CompatStat num="4" suffix="+" label="Terminal vendors" />
              <CompatStat num="1" suffix="day" label="Compat report" />
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
            <a href="/contact" className="btn btn-primary" style={{ background: "var(--paper)", color: "var(--ink)" }}>
              Request a Demo
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
            </a>
            <a href="/industries" className="btn btn-ghost-light">See by industry</a>
          </div>
        </div>
      </section>

      <MarketingFooter />
    </>
  );
}

function HwCard({
  img,
  title,
  desc,
  models,
}: {
  img: string;
  title: string;
  desc: string;
  models: string[];
}) {
  return (
    <div className="hw-card">
      <div className="hw-image" style={{ backgroundImage: `url('${img}')` }}></div>
      <div className="hw-body">
        <h3>{title}</h3>
        <p>{desc}</p>
        <div className="hw-models">
          {models.map((m) => (
            <span key={m}>{m}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function CompatStat({
  num,
  suffix,
  label,
}: {
  num: string;
  suffix?: string;
  label: string;
}) {
  return (
    <div className="compat-stat">
      <div className="compat-stat-num">
        {num}
        {suffix && <span>{suffix}</span>}
      </div>
      <div className="compat-stat-label">{label}</div>
    </div>
  );
}
