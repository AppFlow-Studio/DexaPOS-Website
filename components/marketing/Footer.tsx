import Link from "next/link";
import { DEFAULT_SITE_SETTINGS, SiteSettings } from "@/lib/cms/site-settings-data";
import { SOCIAL_SVGS } from "./SocialIcons";
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

function FooterLink({ href, label, path }: { href: string; label: string; path: string }) {
  const attrs = siteEditAttrs(`${path}.label`, "Footer link", "link", { "data-cms-href-path": `${path}.href` });
  if (href.startsWith("/")) return <Link href={href} {...attrs}>{label}</Link>;
  return <a href={href} target="_blank" rel="noopener noreferrer" {...attrs}>{label}</a>;
}

export default function Footer({ settings = DEFAULT_SITE_SETTINGS }: { settings?: SiteSettings }) {
  const logoSrc = settings.logo_src || DEFAULT_SITE_SETTINGS.logo_src;
  const logoAlt = settings.logo_alt || DEFAULT_SITE_SETTINGS.logo_alt;

  return (
    <footer className="footer" aria-label="Site footer">
      <div className="wrap">
        <div className="footer-top">
          <div className="footer-brand">
            <Link href="/" className="logo" aria-label={settings.brand_home_aria} {...siteEditAttrs("logo_aria", "Logo aria label")}>
              <OptimizedImage
                className="logo-img"
                src={logoSrc}
                alt={logoAlt}
                width={150}
                height={69}
                sizes="150px"
                cmsAttrs={siteEditAttrs("logo_src", "Logo image", "image", { "data-cms-alt-path": "logo_alt" })}
              />
            </Link>
            <p className="footer-tag" {...siteEditAttrs("footer_tagline", "Footer tagline")}>{settings.footer_tagline}</p>
          </div>
          {settings.footer_columns.map((column, columnIndex) => (
            <div className="footer-col" key={column.heading}>
              <h5 {...siteEditAttrs(`footer_columns.${columnIndex}.heading`, "Footer column heading")}>{column.heading}</h5>
              <ul>
                {column.links.map((link, linkIndex) => (
                  <li key={`${column.heading}-${link.href}-${link.label}`}>
                    <FooterLink href={link.href} label={link.label} path={`footer_columns.${columnIndex}.links.${linkIndex}`} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        {(settings.social_links ?? []).length > 0 && (
          <div className="footer-social" {...siteEditAttrs("social_links", "Social links")}>
            {settings.social_links.map((link, i) => (
              <a
                key={link.platform}
                href={link.url}
                className="footer-social-link"
                target="_blank"
                rel="noopener noreferrer"
                aria-label={link.label}
                title={link.label}
                {...siteEditAttrs(`social_links.${i}`, `Social: ${link.label}`, "link", { "data-cms-href-path": `social_links.${i}.url` })}
              >
                {SOCIAL_SVGS[link.platform] || (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="12" r="10" />
                  </svg>
                )}
              </a>
            ))}
          </div>
        )}
        <div className="footer-base">
          <span {...siteEditAttrs("footer_copyright", "Footer copyright")}>{settings.footer_copyright}</span>
          <span>
            <Link href="/sign-in">Sign In</Link>
            {settings.footer_legal.map((link, index) => (
              <FooterLink key={`${link.href}-${link.label}`} href={link.href} label={link.label} path={`footer_legal.${index}`} />
            ))}
          </span>
        </div>
      </div>
    </footer>
  );
}
