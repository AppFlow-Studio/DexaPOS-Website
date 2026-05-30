import MobileNavToggle from "./MobileNavToggle";
import Image from "next/image";
export type MarketingNavKey =
  | "home"
  | "demo"
  | "features"
  | "why"
  | "hardware"
  | "industries"
  | "contact";

const NAV_ITEMS: { href: string; label: string; key: MarketingNavKey }[] = [
  { href: "/demo", label: "Live Demo", key: "demo" },
  { href: "/features", label: "Features", key: "features" },
  { href: "/why", label: "Why DEXA", key: "why" },
  { href: "/hardware", label: "Hardware", key: "hardware" },
  { href: "/industries", label: "Industries", key: "industries" },
];

export default function MarketingNav({
  current,
}: {
  current?: MarketingNavKey;
}) {
  const items = NAV_ITEMS.map((it) => ({
    href: it.href,
    label: it.label,
    current: it.key === current,
  }));

  return (
    <nav className="nav">
      <div className="wrap nav-inner">
        <a href="/" className="logo">
           <Image
              src="/dexalogolight.png"
              alt="DexaPOS"
              width={56}
              height={56}
              priority
              className="h-14 w-14 rounded-xl object-cover"
            />
          DEXA POS
        </a>
        <MobileNavToggle items={items} />
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <a
            href="/sign-in"
            style={{
              fontSize: 14.5,
              fontWeight: 500,
              color: "var(--slate-600)",
              transition: "color 0.2s",
            }}
          >
            Sign In
          </a>
          <a
            href="/contact"
            className="nav-cta"
            style={
              current === "contact"
                ? { background: "var(--brand-500)" }
                : undefined
            }
          >
            Request a Demo
          </a>
        </div>
      </div>
    </nav>
  );
}
