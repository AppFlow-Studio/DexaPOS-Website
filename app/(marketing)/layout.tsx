import type { Metadata } from "next";
import "./marketing.css";
import Nav from "@/components/marketing/Nav";
import Footer from "@/components/marketing/Footer";
import Analytics from "@/components/marketing/Analytics";
import RevealBoot from "@/components/marketing/RevealBoot";
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
      {/* Arms scroll-reveal by adding .reveal-ready to <html>. Hiding is opt-in:
          marketing.css only hides un-revealed .reveal elements under that class,
          so if this never runs content stays visible instead of stranded
          invisible. Must be a component, not an inline <script> — React does not
          execute script tags it renders, so a script here was skipped entirely
          on client-side navigation into a marketing route. */}
      <RevealBoot />
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
