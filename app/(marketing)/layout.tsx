import type { Metadata } from "next";
import { Barlow, Barlow_Condensed } from "next/font/google";
import "./marketing.css";
import Nav from "@/components/marketing/Nav";
import Footer from "@/components/marketing/Footer";
import Analytics from "@/components/marketing/Analytics";
import { getSiteSettings } from "@/lib/cms/site-settings";

const barlow = Barlow({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-barlow",
  display: "swap",
});

const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-barlow-condensed",
  display: "swap",
});

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
      className={`mk-site ${barlow.variable} ${barlowCondensed.variable}`}
      style={{ fontFamily: "var(--font)" }}
    >
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
