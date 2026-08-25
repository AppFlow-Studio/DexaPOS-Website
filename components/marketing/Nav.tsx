"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { DEFAULT_SITE_SETTINGS, SiteSettings } from "@/lib/cms/site-settings-data";
import OptimizedImage from "@/components/marketing/OptimizedImage";

function siteEditAttrs(path: string, label: string, kind = "text", extra?: Record<string, string>) {
  return {
    "data-cms-editable": "true",
    "data-cms-scope": "site",
    "data-cms-path": path,
    "data-cms-label": label,
    "data-cms-kind": kind,
    ...extra,
  };
}

export default function Nav({ settings = DEFAULT_SITE_SETTINGS }: { settings?: SiteSettings }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const links = settings.nav_links || DEFAULT_SITE_SETTINGS.nav_links;
  const cta = settings.nav_cta || DEFAULT_SITE_SETTINGS.nav_cta;
  const logoSrc = settings.logo_src || DEFAULT_SITE_SETTINGS.logo_src;
  const logoAlt = settings.logo_alt || DEFAULT_SITE_SETTINGS.logo_alt;

  return (
    <nav className="nav">
      <div className="wrap nav-inner">
        <Link href="/" className="logo" aria-label={settings.brand_home_aria} {...siteEditAttrs("brand_home_aria", "Logo home label")}>
          <OptimizedImage
            className="logo-img"
            src={logoSrc}
            alt={logoAlt}
            width={150}
            height={60}
            sizes="150px"
            eager
            cmsAttrs={siteEditAttrs("logo_src", "Logo image", "image", { "data-cms-alt-path": "logo_alt" })}
          />
        </Link>
        <ul className={`nav-links${open ? " open" : ""}`} id="navLinks">
          {links.map((link, index) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className={pathname === link.href ? "current" : ""}
                onClick={() => setOpen(false)}
                {...siteEditAttrs(`nav_links.${index}.label`, "Nav link", "link", { "data-cms-href-path": `nav_links.${index}.href` })}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="nav-actions">
          <Link href="/sign-in" className="nav-signin">Sign In</Link>
          <Link href={cta.href} className="nav-cta" {...siteEditAttrs("nav_cta.label", "Nav CTA", "link", { "data-cms-href-path": "nav_cta.href" })}>{cta.label}</Link>
          <button
            className="menu-toggle"
            id="menuToggle"
            aria-label={settings.menu_label}
            aria-expanded={open}
            aria-controls="navLinks"
            onClick={() => setOpen((o) => !o)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>
        </div>
      </div>
    </nav>
  );
}
