export type SocialLink = {
  platform: string;
  url: string;
  label: string;
};

export type SiteSettings = {
  brand_home_aria: string;
  logo_aria: string;
  logo_src: string;
  logo_alt: string;
  nav_links: { href: string; label: string }[];
  nav_cta: { href: string; label: string };
  menu_label: string;
  footer_tagline: string;
  footer_columns: { heading: string; links: { href: string; label: string }[] }[];
  footer_copyright: string;
  footer_legal: { href: string; label: string }[];
  social_links: SocialLink[];
  organization: {
    name: string;
    url: string;
    description: string;
    sameAs: string[];
  };
};

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  brand_home_aria: "DEXA - home",
  logo_aria: "DEXA - Smarter Operations, Better Results.",
  logo_src: "/dexapos-logo.png",
  logo_alt: "DEXA logo",
  nav_links: [
    { href: "/demo", label: "Live Demo" },
    { href: "/features", label: "Features" },
    { href: "/pricing", label: "Pricing" },
    { href: "/why", label: "Why DEXA" },
    { href: "/hardware", label: "Hardware" },
    { href: "/industries", label: "Industries" },
  ],
  nav_cta: { href: "/contact", label: "Request a Demo" },
  menu_label: "Menu",
  footer_tagline: "The operating system for modern restaurants. Built for the rush. Designed for the details.",
  footer_columns: [
    {
      heading: "Product",
      links: [
        { href: "/features", label: "Features" },
        { href: "/pricing", label: "Pricing" },
        { href: "/hardware", label: "Hardware" },
        { href: "/why", label: "Why DEXA" },
        { href: "/industries", label: "Industries" },
        { href: "/demo", label: "Live Demo" },
      ],
    },
    {
      heading: "Company",
      links: [
        { href: "#", label: "About" },
        { href: "#", label: "Partners" },
        { href: "#", label: "Careers" },
        { href: "#", label: "Press" },
      ],
    },
    {
      heading: "Support",
      links: [
        { href: "/contact", label: "Request Demo" },
        { href: "#", label: "Documentation" },
        { href: "#", label: "Status" },
        { href: "#", label: "Contact" },
      ],
    },
  ],
  footer_copyright: "Copyright 2026 DEXA. All rights reserved.",
  footer_legal: [
    { href: "#", label: "Privacy" },
    { href: "#", label: "Terms" },
    { href: "#", label: "Security" },
  ],
  social_links: [
    { platform: "twitter", url: "https://x.com/dexapos", label: "X (Twitter)" },
    { platform: "instagram", url: "https://instagram.com/dexapos", label: "Instagram" },
    { platform: "linkedin", url: "https://linkedin.com/company/dexapos", label: "LinkedIn" },
  ],
  organization: {
    name: "DEXA",
    url: "https://dexa.com",
    description: "The all-in-one point-of-sale platform built for modern restaurants.",
    sameAs: [],
  },
};
