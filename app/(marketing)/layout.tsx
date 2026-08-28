import type { Metadata } from "next";
import "./marketing.css";
import Nav from "@/components/marketing/Nav";
import Footer from "@/components/marketing/Footer";
import Analytics from "@/components/marketing/Analytics";
import { getSiteSettings } from "@/lib/cms/site-settings";

export const metadata: Metadata = {
  title: {
    default: "DEXA POS — Restaurant operations, simplified.",
    template: "%s — DEXA POS",
  },
  description:
    "The all-in-one point-of-sale platform built for modern restaurants. From quick-service to fine dining.",
  openGraph: {
    type: "website",
    siteName: "DEXA POS",
    title: "DEXA POS — Restaurant operations, simplified.",
    description:
      "The all-in-one point-of-sale platform built for modern restaurants. From quick-service to fine dining.",
    images: [
      {
        url: "/dexalogolight.png",
        width: 1200,
        height: 630,
        alt: "DEXA POS",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "DEXA POS — Restaurant operations, simplified.",
    description:
      "The all-in-one point-of-sale platform built for modern restaurants. From quick-service to fine dining.",
    images: ["/dexalogolight.png"],
  },
};

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const siteSettings = await getSiteSettings();

  return (
    <div
      className="mk-site"
      style={{ fontFamily: "var(--font)" }}
    >
      {/* Reveal bootstrap. Runs before paint so scroll-reveal content is hidden
          without a flash, and — critically — hiding is opt-in: marketing.css only
          hides un-revealed .reveal elements under .reveal-ready. If this script
          never runs, content stays visible instead of being stranded invisible. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `try{document.documentElement.classList.add("reveal-ready")}catch(e){}`,
        }}
      />
      <Analytics />
      <Nav settings={siteSettings} />
      <main>{children}</main>
      <Footer settings={siteSettings} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Organization",
            name: siteSettings.organization.name,
            url: siteSettings.organization.url,
            description: siteSettings.organization.description,
            sameAs: siteSettings.organization.sameAs,
          }),
        }}
      />
    </div>
  );
}
