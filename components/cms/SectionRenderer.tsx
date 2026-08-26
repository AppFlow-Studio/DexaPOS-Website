import { Section } from "@/lib/cms/cms-sections";
import { CARD_ICONS } from "@/lib/cms/card-icons";
import ContactForm from "@/components/marketing/ContactForm";
import PricingCalculator from "@/components/marketing/PricingCalculator";
import type { PricingCalculatorSettings } from "@/components/marketing/PricingCalculator";
import FaqAccordion from "@/components/marketing/FaqAccordion";
import { Reveal } from "@/components/marketing/Reveal";
import FaqDetails from "@/components/marketing/FaqDetails";
import CountUp from "@/components/marketing/CountUp";
import DemoFrame from "@/components/marketing/DemoFrame";
import InlineCmsPreview from "./InlineCmsPreview";
import Link from "next/link";
import { Fragment, Suspense } from "react";
import OptimizedImage from "@/components/marketing/OptimizedImage";
import CompareSwitch from "@/components/marketing/CompareSwitch";

export default function SectionRenderer({ sections, route }: { sections: Section[]; route?: string }) {
  if (!sections || sections.length === 0) return null;

  return (
    <>
      {route && (
        <Suspense fallback={null}>
          <InlineCmsPreview route={route} sections={sections} />
        </Suspense>
      )}
      {sections.map((section, index) => {
        if (route === "/pricing" && section.id === "pricing-trust" && sections[index - 1]?.id === "pricing-testimonials") {
          return null;
        }

        if (route === "/pricing" && section.id === "pricing-testimonials") {
          const trustSection = sections[index + 1]?.id === "pricing-trust" ? sections[index + 1] : undefined;
          return <PricingTestimonialsSection key={section.id} section={section} trustSection={trustSection} />;
        }

        return <SectionBlock key={section.id} section={section} route={route} />;
      })}
    </>
  );
}

function editAttrs(section: Section, path: string, label: string, kind = "text", extra?: Record<string, string>) {
  return {
    "data-cms-editable": "true",
    "data-cms-path": `${section.id}.${path}`,
    "data-cms-label": label,
    "data-cms-kind": kind,
    ...extra,
  };
}

function SectionBlock({ section, route }: { section: Section; route?: string }) {
  if (
    (route === "/features" && section.id === "features-hero") ||
    (route === "/demo" && section.id === "demo-hero")
  ) {
    return <PageHeadSection section={section} />;
  }

  if (route === "/why") {
    const whySection = renderWhySection(section);
    if (whySection) return whySection;
  }

  if (route === "/hardware") {
    const hardwareSection = renderHardwareSection(section);
    if (hardwareSection) return hardwareSection;
  }

  if (route === "/industries") {
    const industriesSection = renderIndustriesSection(section);
    if (industriesSection) return industriesSection;
  }

  if (route === "/pricing") {
    const pricingSection = renderPricingSection(section);
    if (pricingSection) return pricingSection;
  }

  switch (section.type) {
    case "hero":
      return <HeroSection section={section} />;
    case "rich_text":
      return <RichTextSection section={section} />;
    case "image":
      return <ImageSection section={section} />;
    case "video":
      return <VideoSection section={section} />;
    case "cards":
      return <CardsSection section={section} />;
    case "cta":
      return <CtaSection section={section} />;
    case "stats":
      return <StatsSection section={section} />;
    case "compare":
      return <CompareSection section={section} />;
    case "industries":
      return <IndustriesSection section={section} />;
    case "pricing_calculator":
      return <PricingCalculatorSection section={section} />;
    case "demo_frame":
      return <DemoFrameSection section={section} />;
    case "contact_form":
      return <ContactFormSection section={section} />;
    case "faq":
      return <FaqSection section={section} />;
    case "annotations":
      return <AnnotationsSection section={section} />;
    case "core_features":
      return <CoreFeaturesSection section={section} />;
    case "capabilities":
      return <CapabilitiesSection section={section} />;
    case "compare_strip":
      return <CompareStripSection section={section} />;
    default:
      return null;
  }
}

function PageHeadSection({ section }: { section: Section }) {
  return (
    <section className="page-head">
      <div className="wrap">
        {section.subheading && <Reveal as="div" className="eyebrow reveal" {...editAttrs(section, "subheading", "Eyebrow")}>{section.subheading}</Reveal>}
        {section.heading && <Reveal as="h1" className="reveal" style={{ transitionDelay: ".1s" }} {...editAttrs(section, "heading", "Heading")}>{section.heading}</Reveal>}
        {section.lede && <Reveal as="p" className="lede reveal" style={{ transitionDelay: ".2s" }} {...editAttrs(section, "lede", "Lead paragraph")}>{section.lede}</Reveal>}
      </div>
    </section>
  );
}

function renderHardwareSection(section: Section) {
  switch (section.id) {
    case "hw-hero":
      return <HardwareHeroSection section={section} />;
    case "hw-categories":
      return <HardwareCategoriesSection section={section} />;
    case "hw-principles":
      return <HardwarePrinciplesSection section={section} />;
    case "hw-compat":
      return <HardwareCompatibilitySection section={section} />;
    case "hw-cta":
      return <CtaSection section={section} />;
    default:
      return null;
  }
}

function HardwareHeroSection({ section }: { section: Section }) {
  return (
    <section className="page-head">
      <div className="wrap">
        <Reveal as="div" className="eyebrow reveal" {...editAttrs(section, "subheading", "Eyebrow")}>{section.subheading || "Hardware"}</Reveal>
        {section.heading && <Reveal as="h1" className="reveal" style={{ transitionDelay: ".1s" }} {...editAttrs(section, "heading", "Heading")}>{section.heading}</Reveal>}
        {section.lede && <Reveal as="p" className="lede reveal" style={{ transitionDelay: ".2s" }} {...editAttrs(section, "lede", "Lead paragraph")}>{section.lede}</Reveal>}
      </div>
    </section>
  );
}

function HardwareCategoriesSection({ section }: { section: Section }) {
  const items = section.items || [];

  return (
    <section className="hw-cats">
      <div className="wrap">
        <Reveal as="div" className="section-head center reveal">
          {section.subheading && <div className="section-eyebrow" {...editAttrs(section, "subheading", "Eyebrow")}>{section.subheading}</div>}
          {section.heading && <h2 className="section-title" {...editAttrs(section, "heading", "Heading")}>{section.heading}</h2>}
        </Reveal>

        <Reveal as="div" className="hw-grid reveal-stagger">
          {items.map((item, i) => (
            <div className="hw-card" key={item.title || i}>
              {item.image && (
                <div className="hw-image">
                  <OptimizedImage src={item.image} alt={item.image_alt || ""} fill sizes="(max-width: 760px) 100vw, 50vw" className="cms-cover-image" cmsAttrs={editAttrs(section, `items.${i}.image`, "Hardware image", "image", { "data-cms-alt-path": `${section.id}.items.${i}.image_alt` })} />
                </div>
              )}
              <div className="hw-body">
                {item.title && <h3 {...editAttrs(section, `items.${i}.title`, "Hardware title")}>{item.title}</h3>}
                {item.description && <p {...editAttrs(section, `items.${i}.description`, "Hardware description")}>{item.description}</p>}
                {item.tags && item.tags.length > 0 && (
                  <div className="hw-models">
                    {item.tags.map((tag, tagIndex) => (
                      <span key={tag} {...editAttrs(section, `items.${i}.tags.${tagIndex}`, "Model tag")}>{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

function HardwarePrinciplesSection({ section }: { section: Section }) {
  const items = section.items || [];
  const fallbackIcons = ["wifi", "usb", "globe"];

  return (
    <section className="principles">
      <div className="wrap">
        <Reveal as="div" className="section-head center reveal">
          {section.subheading && <div className="section-eyebrow" {...editAttrs(section, "subheading", "Eyebrow")}>{section.subheading}</div>}
          {section.heading && <h2 className="section-title" {...editAttrs(section, "heading", "Heading")}>{section.heading}</h2>}
        </Reveal>

        <Reveal as="div" className="princ-grid reveal-stagger">
          {items.map((item, i) => (
            <div className="princ" key={item.title || i}>
              <div className="princ-icon">
                <HardwarePrincipleIcon icon={item.icon || fallbackIcons[i % fallbackIcons.length]} />
              </div>
              {item.title && <h3 {...editAttrs(section, `items.${i}.title`, "Principle title")}>{item.title}</h3>}
              {item.description && <p {...editAttrs(section, `items.${i}.description`, "Principle description")}>{item.description}</p>}
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

function HardwarePrincipleIcon({ icon }: { icon: string }) {
  if (icon === "usb") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="9" width="18" height="6" rx="1" />
        <rect x="6" y="6" width="3" height="3" />
        <rect x="15" y="6" width="3" height="3" />
      </svg>
    );
  }

  if (icon === "globe") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a14 14 0 010 18" />
      </svg>
    );
  }

  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M2 8.5C5 5.5 9 4 12 4s7 1.5 10 4.5" />
      <path d="M5 12c2-2 4.5-3 7-3s5 1 7 3" />
      <path d="M8 15.5c1-1 2.5-1.5 4-1.5s3 0.5 4 1.5" />
      <circle cx="12" cy="19" r="1.5" fill="currentColor" />
    </svg>
  );
}

function HardwareCompatibilitySection({ section }: { section: Section }) {
  const stats = section.items || [];
  const button = section.buttons?.[0] || (section.button_text && section.button_link
    ? { text: section.button_text, link: section.button_link, style: "primary" }
    : null);

  return (
    <section className="compat">
      <div className="wrap">
        <Reveal as="div" className="compat-card reveal">
          <div>
            {section.heading && <h3 {...editAttrs(section, "heading", "Heading")}>{section.heading}</h3>}
            {section.body && <p {...editAttrs(section, "body", "Body")}>{section.body}</p>}
            {button && (
              <Link href={button.link} className="btn btn-request-a-demo" style={{ background: "var(--paper)", color: "var(--ink)" }} {...editAttrs(section, "button_text", "Button", "link", { "data-cms-href-path": `${section.id}.button_link` })}>
                {button.text}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
              </Link>
            )}
          </div>
          <div className="compat-stats">
            {stats.map((stat, i) => (
              <div className="compat-stat" key={stat.description || i}>
                {stat.title && (
                  <div className="compat-stat-num" {...editAttrs(section, `items.${i}.title`, "Stat value")}>
                    {formatHardwareStat(stat.title)}
                  </div>
                )}
                {stat.description && <div className="compat-stat-label" {...editAttrs(section, `items.${i}.description`, "Stat label")}>{stat.description}</div>}
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function formatHardwareStat(value: string) {
  const match = value.match(/^(.+?)(%|\+|day)$/);
  if (!match) return value;

  return (
    <>
      {match[1]}
      <span>{match[2]}</span>
    </>
  );
}

function renderPricingSection(section: Section) {
  switch (section.id) {
    case "pricing-hero":
      return <PricingHeroSection section={section} />;
    case "pricing-core":
      return <PricingCoreSection section={section} />;
    case "pricing-included":
      return <PricingIncludedSection section={section} />;
    case "pricing-addons":
      return <PricingAddonsSection section={section} />;
    case "pricing-testimonials":
      return <PricingTestimonialsSection section={section} />;
    case "pricing-trust":
      return <PricingTrustSection section={section} />;
    case "pricing-faq":
      return <PricingFaqSection section={section} />;
    default:
      return null;
  }
}

function CheckIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M5 12l5 5L20 7" /></svg>
  );
}

function pricingHeadingLines(text: string, trailingBreak: boolean) {
  const parts = text.split(/(?<=\.)\s+/).filter(Boolean);
  return parts.flatMap((part, i) =>
    i < parts.length - 1 || trailingBreak ? [part, <br key={i} />] : [part]
  );
}

function splitPriceValue(value: string) {
  const i = value.indexOf("/");
  if (i === -1) return { price: value, suffix: "" };
  return { price: value.slice(0, i), suffix: value.slice(i) };
}

function authorInitials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

function PricingSectionHead({ section }: { section: Section }) {
  if (!section.subheading && !section.heading && !section.lede) return null;
  return (
    <Reveal as="div" className="section-head center reveal">
      {section.subheading && <div className="section-eyebrow" {...editAttrs(section, "subheading", "Eyebrow")}>{section.subheading}</div>}
      {section.heading && <h2 className="section-title" {...editAttrs(section, "heading", "Heading")}>{section.heading}</h2>}
      {section.lede && <p className="section-sub" {...editAttrs(section, "lede", "Lead paragraph")}>{section.lede}</p>}
    </Reveal>
  );
}

function PricingHeroSection({ section }: { section: Section }) {
  const previewLines = section.items || [];

  return (
    <section className="pricing-hero">
      <div className="wrap">
        <Reveal as="div" className="reveal">
          {section.subheading && <div className="eyebrow" {...editAttrs(section, "subheading", "Eyebrow")}>{section.subheading}</div>}
          {(section.heading || section.heading_accent) && (
            <h1>
              {section.heading && <span {...editAttrs(section, "heading", "Main heading")}>{pricingHeadingLines(section.heading, Boolean(section.heading_accent))}</span>}
              {section.heading_accent && <span className="accent" {...editAttrs(section, "heading_accent", "Accent heading")}>{section.heading_accent}</span>}
            </h1>
          )}
          {section.lede && <p className="lede" {...editAttrs(section, "lede", "Lead paragraph")}>{section.lede}</p>}
          {section.buttons && section.buttons.length > 0 && (
            <div className="hero-cta">
              {section.buttons.map((btn, i) => (
                <a key={i} href={btn.link} className={`btn btn-${btn.style || "primary"}`} {...editAttrs(section, `buttons.${i}.text`, "Button", "link", { "data-cms-href-path": `${section.id}.buttons.${i}.link` })}>
                  {btn.text}
                  {btn.style === "primary" && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                  )}
                </a>
              ))}
            </div>
          )}
          {section.body && (
            <div className="hero-trust">
              <span className="dots"><span></span><span></span><span></span></span>
              <span {...editAttrs(section, "body", "Trust line", "richtext")} dangerouslySetInnerHTML={{ __html: section.body }} />
            </div>
          )}
        </Reveal>

        <Reveal as="div" className="reveal" style={{ transitionDelay: ".15s" }}>
          <div className="hero-preview">
            {section.floating_title && (
              <div className="preview-head">
                <h4 {...editAttrs(section, "floating_title", "Preview title")}>{section.floating_title}</h4>
                <span className="live-pill"><span className="pulse"></span>Live</span>
              </div>
            )}
            {previewLines.map((item, i) => (
              <div className="preview-line" key={item.title || i}>
                <div className="item">
                  {item.link_text && <span className="qty" {...editAttrs(section, `items.${i}.link_text`, "Quantity")}>{item.link_text}</span>}
                  <span {...editAttrs(section, `items.${i}.title`, "Line label")}>{item.title}</span>
                </div>
                {item.description && <div className="price" {...editAttrs(section, `items.${i}.description`, "Line price")}>{item.description}</div>}
              </div>
            ))}
            {section.floating_text && (
              <div className="preview-total">
                <div>
                  <div className="label">Total</div>
                  {section.caption && <div style={{ fontSize: "11px", color: "var(--slate-500)", marginTop: "4px" }} {...editAttrs(section, "caption", "Total note")}>{section.caption}</div>}
                </div>
                <div className="amount"><span {...editAttrs(section, "floating_text", "Total amount")}>{section.floating_text}</span><span className="per">/mo</span></div>
              </div>
            )}
            {section.footnote && <p className="preview-foot" {...editAttrs(section, "footnote", "Preview footnote")}>{section.footnote}</p>}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function PricingCoreSection({ section }: { section: Section }) {
  const items = section.items || [];

  return (
    <section className="psec alt" style={{ paddingBottom: 0 }}>
      <div className="wrap">
        <PricingSectionHead section={section} />
        <Reveal as="div" className="price-grid reveal-stagger">
          {items.map((item, i) => {
            const { price, suffix } = splitPriceValue(item.link_text || "");
            return (
              <div className={`price-card${item.link ? " featured" : ""}`} key={item.title || i}>
                {item.link && <span className="pill-feat" {...editAttrs(section, `items.${i}.link`, "Featured pill")}>{item.link}</span>}
                {item.icon && CARD_ICONS[item.icon] && <div className="icon">{CARD_ICONS[item.icon]}</div>}
                {item.title && <h3 {...editAttrs(section, `items.${i}.title`, "Plan title")}>{item.title}</h3>}
                {item.link_text && (
                  <div className="price-row" {...editAttrs(section, `items.${i}.link_text`, "Price")}>
                    <span className="price">{price}</span><span className="price-suffix">{suffix}</span>
                  </div>
                )}
                {item.description && <p className="desc" {...editAttrs(section, `items.${i}.description`, "Plan description")}>{item.description}</p>}
                {item.tags && item.tags.length > 0 && (
                  <ul className="feat-list">
                    {item.tags.map((tag, tagIndex) => (
                      <li key={tag}><CheckIcon /><span {...editAttrs(section, `items.${i}.tags.${tagIndex}`, "Feature")}>{tag}</span></li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </Reveal>
      </div>
    </section>
  );
}

function PricingIncludedSection({ section }: { section: Section }) {
  const items = section.items || [];

  return (
    <section className="psec alt" style={{ paddingTop: 0 }}>
      <div className="wrap">
        <Reveal as="div" className="included-strip reveal">
          <div className="included-head">
            <div className="text">
              {section.heading && <h3 {...editAttrs(section, "heading", "Heading")}>{section.heading}</h3>}
              {section.lede && <p {...editAttrs(section, "lede", "Subtext")}>{section.lede}</p>}
            </div>
            {section.button_text && (
              <span className="badge">
                <CheckIcon />
                <span {...editAttrs(section, "button_text", "Badge")}>{section.button_text}</span>
              </span>
            )}
          </div>
          <div className="included-grid">
            {items.map((item, i) => (
              <div className="included-item" key={item.title || i}>
                <CheckIcon size={16} />
                <span {...editAttrs(section, `items.${i}.title`, "Included item")}>{item.title}</span>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function PricingAddonsSection({ section }: { section: Section }) {
  const items = section.items || [];

  return (
    <section className="psec">
      <div className="wrap">
        <PricingSectionHead section={section} />
        <Reveal as="div" className="addons-grid reveal-stagger">
          {items.map((item, i) => {
            if (item.link) {
              return (
                <div className="addon-card cta-card" key={item.title || i}>
                  <div className="addon-head">
                    {item.icon && CARD_ICONS[item.icon] && <div className="addon-icon">{CARD_ICONS[item.icon]}</div>}
                  </div>
                  {item.title && <div className="addon-name" {...editAttrs(section, `items.${i}.title`, "Add-on name")}>{item.title}</div>}
                  {item.description && <p className="addon-desc" {...editAttrs(section, `items.${i}.description`, "Add-on description")}>{item.description}</p>}
                  {item.link_text && (
                    <a href={item.link} className="cta-link" {...editAttrs(section, `items.${i}.link_text`, "Link", "link", { "data-cms-href-path": `${section.id}.items.${i}.link` })}>
                      {item.link_text}
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
                    </a>
                  )}
                </div>
              );
            }

            const { price, suffix } = splitPriceValue(item.link_text || "");
            return (
              <div className="addon-card" key={item.title || i}>
                <div className="addon-head">
                  {item.icon && CARD_ICONS[item.icon] && <div className="addon-icon">{CARD_ICONS[item.icon]}</div>}
                  {item.link_text && (
                    <div className="addon-meta-col">
                      <div className="addon-price" {...editAttrs(section, `items.${i}.link_text`, "Price")}>{price}<span className="per">{suffix}</span></div>
                    </div>
                  )}
                </div>
                {item.title && <div className="addon-name" {...editAttrs(section, `items.${i}.title`, "Add-on name")}>{item.title}</div>}
                {item.description && <p className="addon-desc" {...editAttrs(section, `items.${i}.description`, "Add-on description")}>{item.description}</p>}
                {item.tags && item.tags.length > 0 && (
                  <span className="addon-tag" {...editAttrs(section, `items.${i}.tags.0`, "Tag")}>{item.tags[0]}</span>
                )}
              </div>
            );
          })}
        </Reveal>
      </div>
    </section>
  );
}

function PricingTestimonialsSection({ section, trustSection }: { section: Section; trustSection?: Section }) {
  const items = section.items || [];
  const trustItems = trustSection?.items || [];

  return (
    <section className="psec dark">
      <div className="wrap">
        <PricingSectionHead section={section} />
        <Reveal as="div" className="testimonials-grid reveal-stagger">
          {items.map((item, i) => (
            <div className="testimonial" key={item.title || i}>
              <div className="quote-mark">&ldquo;</div>
              {item.description && <blockquote {...editAttrs(section, `items.${i}.description`, "Quote")}>{item.description}</blockquote>}
              <div className="stars">
                {Array.from({ length: 5 }).map((_, starIndex) => (
                  <svg key={starIndex} width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z" /></svg>
                ))}
              </div>
              <div className="testimonial-author">
                <div className="author-avatar">{authorInitials(item.title || "")}</div>
                <div className="author-info">
                  {item.title && <span className="name" {...editAttrs(section, `items.${i}.title`, "Author name")}>{item.title}</span>}
                  {item.link_text && <span className="role" {...editAttrs(section, `items.${i}.link_text`, "Author role")}>{item.link_text}</span>}
                </div>
              </div>
            </div>
          ))}
        </Reveal>
        {trustItems.length > 0 && (
          <Reveal as="div" className="trust-stats reveal">
            {trustItems.map((item, i) => {
              const { prefix, num, suffix } = splitStatValue(item.title || "");
              return (
                <div className="trust-stat" key={item.description || i}>
                  <div className="num" {...editAttrs(trustSection as Section, `items.${i}.title`, "Stat value")}>
                    {prefix && <span className="prefix">{prefix}</span>}<CountUp value={num} suffix={suffix} />{suffix && <span className="suffix">{suffix}</span>}
                  </div>
                  {item.description && <div className="lbl" {...editAttrs(trustSection as Section, `items.${i}.description`, "Stat label")}>{item.description}</div>}
                </div>
              );
            })}
          </Reveal>
        )}
      </div>
    </section>
  );
}

function PricingTrustSection({ section }: { section: Section }) {
  const items = section.items || [];

  return (
    <section className="psec dark" style={{ paddingTop: 0 }}>
      <div className="wrap">
        <Reveal as="div" className="trust-stats reveal">
          {items.map((item, i) => {
            const { prefix, num, suffix } = splitStatValue(item.title || "");
            return (
              <div className="trust-stat" key={item.description || i}>
                <div className="num" {...editAttrs(section, `items.${i}.title`, "Stat value")}>
                  {prefix && <span className="prefix">{prefix}</span>}<CountUp value={num} suffix={suffix} />{suffix && <span className="suffix">{suffix}</span>}
                </div>
                {item.description && <div className="lbl" {...editAttrs(section, `items.${i}.description`, "Stat label")}>{item.description}</div>}
              </div>
            );
          })}
        </Reveal>
      </div>
    </section>
  );
}

function PricingFaqSection({ section }: { section: Section }) {
  const items = section.items || [];

  return (
    <section className="psec">
      <div className="wrap">
        <PricingSectionHead section={section} />
        <Reveal as="div" className="faq-list reveal">
          {items.map((item, index) => (
            <FaqDetails
              key={item.title || index}
              question={item.title || ""}
              answerHtml={item.description}
              questionAttrs={editAttrs(section, `items.${index}.title`, "Question")}
              answerAttrs={editAttrs(section, `items.${index}.description`, "Answer", "richtext")}
            />
          ))}
        </Reveal>
      </div>
    </section>
  );
}

function renderIndustriesSection(section: Section) {
  switch (section.id) {
    case "ind-hero":
      return <IndustriesHeroSection section={section} />;
    case "ind-grid":
      return <IndustriesGridSection section={section} />;
    case "ind-multi":
      return <IndustriesMultiLocSection section={section} />;
    case "ind-cta":
      return <CtaSection section={section} />;
    default:
      return null;
  }
}

function IndustriesHeroSection({ section }: { section: Section }) {
  return (
    <section className="page-head">
      <div className="wrap">
        <Reveal as="div" className="eyebrow reveal" {...editAttrs(section, "subheading", "Eyebrow")}>{section.subheading || "Industries"}</Reveal>
        {section.heading && <Reveal as="h1" className="reveal" style={{ transitionDelay: ".1s" }} {...editAttrs(section, "heading", "Heading")}>{section.heading}</Reveal>}
        {section.lede && <Reveal as="p" className="lede reveal" style={{ transitionDelay: ".2s" }} {...editAttrs(section, "lede", "Lead paragraph")}>{section.lede}</Reveal>}
      </div>
    </section>
  );
}

function IndustriesGridSection({ section }: { section: Section }) {
  const items = section.items || [];

  return (
    <section className="ind-grid">
      <div className="wrap">
        {(section.subheading || section.heading) && (
          <Reveal as="div" className="section-head center reveal">
            {section.subheading && <div className="section-eyebrow" {...editAttrs(section, "subheading", "Eyebrow")}>{section.subheading}</div>}
            {section.heading && <h2 className="section-title" {...editAttrs(section, "heading", "Heading")}>{section.heading}</h2>}
          </Reveal>
        )}
        <Reveal as="div" className="ind-row reveal-stagger">
          {items.map((item, i) => (
            <div className="ind-card" key={item.title || i}>
              {item.image && (
                <div className="ind-image">
                  <OptimizedImage src={item.image} alt={item.image_alt || ""} fill sizes="(max-width: 760px) 100vw, 50vw" className="cms-cover-image" cmsAttrs={editAttrs(section, `items.${i}.image`, "Industry image", "image", { "data-cms-alt-path": `${section.id}.items.${i}.image_alt` })} />
                </div>
              )}
              <div className="ind-body">
                {item.title && <h3 {...editAttrs(section, `items.${i}.title`, "Industry title")}>{item.title}</h3>}
                {item.description && <p {...editAttrs(section, `items.${i}.description`, "Industry description")}>{item.description}</p>}
                {item.tags && item.tags.length > 0 && (
                  <div className="ind-pills">
                    {item.tags.map((tag, tagIndex) => (
                      <span key={tag} {...editAttrs(section, `items.${i}.tags.${tagIndex}`, "Pill")}>{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

function IndustriesMultiLocSection({ section }: { section: Section }) {
  const stats = section.items || [];
  const button = section.buttons?.[0] || (section.button_text && section.button_link
    ? { text: section.button_text, link: section.button_link, style: "primary" }
    : null);

  return (
    <section className="multi-loc">
      <div className="wrap">
        <Reveal as="div" className="multi-card reveal">
          <div className="multi-content">
            {section.subheading && <div className="multi-eyebrow" {...editAttrs(section, "subheading", "Eyebrow")}>{section.subheading}</div>}
            {section.heading && <h2 {...editAttrs(section, "heading", "Heading")}>{section.heading}</h2>}
            {section.body && <p {...editAttrs(section, "body", "Body")}>{section.body}</p>}
            {stats.length > 0 && (
              <div className="multi-stats">
                {stats.map((stat, i) => (
                  <div className="multi-stat" key={stat.description || i}>
                    {stat.title && <div className="multi-stat-num" {...editAttrs(section, `items.${i}.title`, "Stat value")}>{stat.title}</div>}
                    {stat.description && <div className="multi-stat-label" {...editAttrs(section, `items.${i}.description`, "Stat label")}>{stat.description}</div>}
                  </div>
                ))}
              </div>
            )}
            {button && (
              <Link href={button.link} className="btn btn-request-a-demo" style={{ background: "var(--paper)", color: "var(--ink)" }} {...editAttrs(section, "button_text", "Button", "link", { "data-cms-href-path": `${section.id}.button_link` })}>
                {button.text}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
              </Link>
            )}
          </div>
          {section.main_image && (
            <div className="multi-image">
              <OptimizedImage src={section.main_image} alt={section.main_image_alt || ""} fill sizes="(max-width: 900px) 100vw, 50vw" className="cms-cover-image" cmsAttrs={editAttrs(section, "main_image", "Feature image", "image", { "data-cms-alt-path": `${section.id}.main_image_alt` })} />
            </div>
          )}
        </Reveal>
      </div>
    </section>
  );
}

function accentWithBreak(text: string) {
  const i = text.lastIndexOf(" ");
  if (i === -1) return text;
  return (
    <>
      {text.slice(0, i)}
      <br />
      {text.slice(i + 1)}
    </>
  );
}

function renderWhySection(section: Section) {
  switch (section.id) {
    case "why-hero":
      return <WhyHeroSection section={section} />;
    case "why-trust":
      return <WhyStatsSection section={section} />;
    case "why-photo":
      return <WhyImageSection section={section} />;
    case "why-compare":
      return <WhyCompareSection section={section} />;
    case "why-diff":
      return <WhyDifferentiatorsSection section={section} />;
    case "why-pricing":
      return <WhyPricingSection section={section} />;
    case "why-faq":
      return <WhyFaqSection section={section} />;
    case "why-cta":
      return <CtaSection section={section} />;
    default:
      return null;
  }
}

function WhyHeroSection({ section }: { section: Section }) {
  return (
    <section className="page-head">
      <div className="wrap">
        <Reveal as="div" className="eyebrow reveal" {...editAttrs(section, "subheading", "Eyebrow")}>{section.subheading || "Why DEXA"}</Reveal>
        {section.heading && <Reveal as="h1" className="reveal" style={{ transitionDelay: ".1s" }} {...editAttrs(section, "heading", "Heading")}>{section.heading}</Reveal>}
        {section.lede && <Reveal as="p" className="lede reveal" style={{ transitionDelay: ".2s" }} {...editAttrs(section, "lede", "Lead paragraph")}>{section.lede}</Reveal>}
      </div>
    </section>
  );
}

function WhyStatsSection({ section }: { section: Section }) {
  const items = section.items || [];

  return (
    <section className="trust">
      <div className="wrap">
        <Reveal as="div" className="trust-grid reveal-stagger">
          {items.map((item, i) => {
            const { prefix, num, suffix } = splitStatValue(item.title || "");
            return (
              <div className="trust-stat" key={item.title || i}>
                <div className="trust-stat-value" {...editAttrs(section, `items.${i}.title`, "Stat value")}>
                  {prefix}<CountUp value={num} suffix={suffix} />{suffix}
                </div>
                {item.description && <div className="trust-stat-label" {...editAttrs(section, `items.${i}.description`, "Stat label")}>{item.description}</div>}
              </div>
            );
          })}
        </Reveal>
      </div>
    </section>
  );
}

function WhyImageSection({ section }: { section: Section }) {
  if (!section.src) return null;

  return (
    <section className="why-photo">
      <div className="wrap">
        <Reveal as="figure" className="why-photo-frame reveal">
          <OptimizedImage src={section.src} alt={section.alt || ""} width={2100} height={900} sizes="(max-width: 1200px) 100vw, 1200px" cmsAttrs={editAttrs(section, "src", "Image", "image", { "data-cms-alt-path": `${section.id}.alt` })} />
          {(section.caption || section.heading) && (
            <figcaption className="why-photo-cap">
              <p {...editAttrs(section, section.caption ? "caption" : "heading", section.caption ? "Caption" : "Heading")}>{section.caption || section.heading}</p>
            </figcaption>
          )}
        </Reveal>
      </div>
    </section>
  );
}

function WhyCompareSection({ section }: { section: Section }) {
  const rows = section.compare_rows || [];
  const columns = section.compare_columns || ["Capability", "DEXA", "Toast", "Square", "Clover"];

  return (
    <section className="comparison">
      <div className="wrap">
        <Reveal as="div" className="section-head center reveal">
          {section.subheading && <div className="section-eyebrow" {...editAttrs(section, "subheading", "Eyebrow")}>{section.subheading}</div>}
          {section.heading && <h2 className="section-title" {...editAttrs(section, "heading", "Heading")}>{section.heading}</h2>}
          {section.lede && <p className="section-sub" {...editAttrs(section, "lede", "Lead paragraph")}>{section.lede}</p>}
        </Reveal>

        <Reveal as="div" className="comp-card reveal">
          <div className="comp-head-row">
            <h3>Capability comparison</h3>
            <p>The differences operators care about</p>
          </div>

          <CompareSwitch competitors={columns.slice(2)}>
          <div className="comp-table">
            {columns.map((column, i) => (
              <div key={i} data-col={i} className={`comp-th ${i === 0 ? "feature-col" : ""} ${i === 1 ? "dexa-col" : ""}`} {...editAttrs(section, `compare_columns.${i}`, "Table column")}>
                {column}
              </div>
            ))}

            {rows.map((row, rowIndex) => (
              row.map((cell, cellIndex) => {
                const isLastRow = rowIndex === rows.length - 1;
                if (cellIndex === 0) {
                  return (
                    <div key={`${rowIndex}-${cellIndex}`} data-col={cellIndex} className="comp-row-feature" style={isLastRow ? { borderBottom: "none" } : undefined} {...editAttrs(section, `compare_rows.${rowIndex}.${cellIndex}`, "Table cell")}>
                      {cell}
                    </div>
                  );
                }

                return (
                  <div key={`${rowIndex}-${cellIndex}`} data-col={cellIndex} className={`comp-cell ${cellIndex === 1 ? "dexa" : "competitor"}`} style={isLastRow ? { borderBottom: "none" } : undefined}>
                    <span className={cellIndex === 1 ? "comp-pill" : ""} {...editAttrs(section, `compare_rows.${rowIndex}.${cellIndex}`, "Table cell")}>{cell}</span>
                  </div>
                );
              })
            ))}
          </div>
          </CompareSwitch>
        </Reveal>
      </div>
    </section>
  );
}

function WhyDifferentiatorsSection({ section }: { section: Section }) {
  const items = section.items || [];
  const fallbackIcons = ["dollar", "monitor", "settings", "wifi", "shield", "clock"];

  return (
    <section className="why-diff">
      <div className="wrap">
        <Reveal as="div" className="section-head center reveal">
          {section.subheading && <div className="section-eyebrow" {...editAttrs(section, "subheading", "Eyebrow")}>{section.subheading}</div>}
          {section.heading && <h2 className="section-title" {...editAttrs(section, "heading", "Heading")}>{section.heading}</h2>}
          {section.lede && <p className="section-sub" {...editAttrs(section, "lede", "Lead paragraph")}>{section.lede}</p>}
        </Reveal>

        <Reveal as="div" className="diff-grid reveal-stagger">
          {items.map((item, i) => {
            const iconName = item.icon || fallbackIcons[i % fallbackIcons.length];
            return (
              <div className="diff-card" key={item.title || i}>
                {CARD_ICONS[iconName] && <div className="diff-ic">{CARD_ICONS[iconName]}</div>}
                {item.title && <h3 {...editAttrs(section, `items.${i}.title`, "Card title")}>{item.title}</h3>}
                {item.description && <p {...editAttrs(section, `items.${i}.description`, "Card description")}>{item.description}</p>}
              </div>
            );
          })}
        </Reveal>
      </div>
    </section>
  );
}

function splitPricingHeading(heading: string) {
  const marker = ". Never";
  const i = heading.indexOf(marker);
  if (i === -1) return heading;
  return (
    <>
      {heading.slice(0, i + 1)}
      <br />
      {heading.slice(i + 2)}
    </>
  );
}

function WhyPricingSection({ section }: { section: Section }) {
  const plans = section.items && section.items.length > 0
    ? section.items
    : [
        { title: "$99", description: "/mo", link_text: "First station" },
        { title: "$49", description: "/mo", link_text: "Additional station" },
        { title: "$39", description: "/mo", link_text: "Handheld tablet" },
      ];
  const buttons = section.buttons && section.buttons.length > 0
    ? section.buttons
    : (section.button_text && section.button_link ? [{ text: section.button_text, link: section.button_link, style: "ghost-light" }] : []);

  return (
    <section className="why-pricing">
      <div className="wrap">
        <Reveal as="div" className="wp-inner reveal">
          <div className="wp-copy">
            {section.subheading && <div className="section-eyebrow" {...editAttrs(section, "subheading", "Eyebrow")}>{section.subheading}</div>}
            {section.heading && <h2 {...editAttrs(section, "heading", "Heading")}>{splitPricingHeading(section.heading)}</h2>}
            {section.body && <p {...editAttrs(section, "body", "Body")}>{section.body}</p>}
            {buttons.map((btn, i) => (
              <a key={i} href={btn.link} className={`btn btn-${btn.style || "ghost-light"}`} {...editAttrs(section, `buttons.${i}.text`, "Button", "link", { "data-cms-href-path": `${section.id}.buttons.${i}.link` })}>
                {btn.text}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
              </a>
            ))}
          </div>
          <div className="wp-plans">
            {plans.map((plan, i) => (
              <div className="wp-plan" key={plan.title || i}>
                <span className="wp-price" {...editAttrs(section, `items.${i}.title`, "Plan price")}>{plan.title}</span>
                {plan.description && <span className="lbl" {...editAttrs(section, `items.${i}.description`, "Plan unit")}>{plan.description}</span>}
                {plan.link_text && <span className="add" {...editAttrs(section, `items.${i}.link_text`, "Plan label")}>{plan.link_text}</span>}
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function WhyFaqSection({ section }: { section: Section }) {
  const items = (section.items || []).map((item) => ({
    question: item.title || "",
    answer: item.description || "",
  }));

  return (
    <section className="faq-section">
      <div className="wrap">
        <Reveal as="div" className="section-head center reveal">
          {section.subheading && <div className="section-eyebrow" {...editAttrs(section, "subheading", "Eyebrow")}>{section.subheading}</div>}
          {section.heading && <h2 className="section-title" {...editAttrs(section, "heading", "Heading")}>{section.heading}</h2>}
          {section.lede && <p className="section-sub" {...editAttrs(section, "lede", "Lead paragraph")}>{section.lede}</p>}
        </Reveal>

        <FaqAccordion items={items} />
      </div>
    </section>
  );
}

function HeroSection({ section }: { section: Section }) {
  const align = section.alignment === "center" ? "center" : "left";
  const hasVisual = section.main_image;
  const trustItems = section.items || [];

  const content = (
    <div style={{ textAlign: align }}>
      {section.subheading && <div className="section-eyebrow" {...editAttrs(section, "subheading", "Eyebrow")}>{section.subheading}</div>}
      {(section.heading || section.heading_accent) && (
        <h1>
          {section.heading && <span {...editAttrs(section, "heading", "Main heading")}>{section.heading}</span>}
          {section.heading && section.heading_accent ? " " : ""}
          {section.heading_accent && <span className="accent" {...editAttrs(section, "heading_accent", "Accent heading")}>{accentWithBreak(section.heading_accent)}</span>}
        </h1>
      )}
      {section.lede && <p className="hero-lede" {...editAttrs(section, "lede", "Lead paragraph")}>{section.lede}</p>}
      {section.buttons && section.buttons.length > 0 && (
        <div className="hero-actions">
          {section.buttons.map((btn, i) => (
            <a key={i} href={btn.link} className={`btn btn-${btn.style || "primary"}`} {...editAttrs(section, `buttons.${i}.text`, "Button", "link", { "data-cms-href-path": `${section.id}.buttons.${i}.link` })}>
              {btn.text}
              {btn.style === "primary" && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
              )}
            </a>
          ))}
        </div>
      )}
      {trustItems.length > 0 && (
        <div className="hero-trust">
          {trustItems.map((item, i) => {
            const { prefix, num, suffix } = splitStatValue(item.title || "");
            return (
              <div key={i} className="hero-trust-item">
                {item.title && (
                  <span className="hero-trust-num" {...editAttrs(section, `items.${i}.title`, "Trust value")}>
                    {prefix}<CountUp value={num} suffix={suffix} />{suffix}
                  </span>
                )}
                {item.description && <span className="hero-trust-label" {...editAttrs(section, `items.${i}.description`, "Trust label")}>{item.description}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <section className="cms-hero" style={{
      backgroundColor: section.background_color || undefined,
    }}>
      {section.background_image && (
        <OptimizedImage
          src={section.background_image}
          alt=""
          fill
          sizes="100vw"
          preload
          className="cms-hero-background"
          cmsAttrs={editAttrs(section, "background_image", "Hero background", "image")}
        />
      )}
      <div className="wrap">
        {hasVisual ? (
          <div className="hero-grid">
            <Reveal as="div" className="reveal">{content}</Reveal>
            <Reveal as="div" className="hero-visual reveal" style={{ transitionDelay: ".15s" }}>
              {section.main_image && (
                <figure className="hero-photo">
                  <OptimizedImage src={section.main_image} alt={section.main_image_alt || ""} width={1040} height={676} sizes="(max-width: 900px) 100vw, 50vw" preload cmsAttrs={editAttrs(section, "main_image", "Hero image", "image", { "data-cms-alt-path": `${section.id}.main_image_alt` })} />
                </figure>
              )}
              {(section.floating_title || section.floating_text) && (
                <div className="hero-floating">
                  <div className="hero-floating-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12l5 5L20 7" /></svg>
                  </div>
                  <div className="hero-floating-text">
                    {section.floating_title && <strong {...editAttrs(section, "floating_title", "Floating title")}>{section.floating_title}</strong>}
                    {section.floating_text && <span {...editAttrs(section, "floating_text", "Floating text")}>{section.floating_text}</span>}
                  </div>
                </div>
              )}
            </Reveal>
          </div>
        ) : (
          content
        )}
      </div>
    </section>
  );
}

function RichTextSection({ section }: { section: Section }) {
  return (
    <section className="cms-rich-text">
      <div className="wrap">
        {section.heading && <h2 {...editAttrs(section, "heading", "Heading")}>{section.heading}</h2>}
        {section.body && <div className="cms-body" {...editAttrs(section, "body", "Rich text", "richtext")} dangerouslySetInnerHTML={{ __html: section.body }} />}
      </div>
    </section>
  );
}

function ImageSection({ section }: { section: Section }) {
  if (!section.src) return null;
  return (
    <section className="cms-image">
      <div className="wrap">
        {section.heading && <h2 {...editAttrs(section, "heading", "Heading")}>{section.heading}</h2>}
        <figure>
          <OptimizedImage src={section.src} alt={section.alt || ""} width={1600} height={900} sizes="(max-width: 1200px) 100vw, 1200px" cmsAttrs={editAttrs(section, "src", "Image", "image", { "data-cms-alt-path": `${section.id}.alt` })} />
          {section.caption && <figcaption {...editAttrs(section, "caption", "Caption")}>{section.caption}</figcaption>}
        </figure>
      </div>
    </section>
  );
}

function VideoSection({ section }: { section: Section }) {
  if (!section.url) return null;
  let embedUrl = section.url;
  const ytMatch = section.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
  if (ytMatch) embedUrl = `https://www.youtube.com/embed/${ytMatch[1]}`;
  const vmMatch = section.url.match(/vimeo\.com\/(\d+)/);
  if (vmMatch) embedUrl = `https://player.vimeo.com/video/${vmMatch[1]}`;

  return (
    <section className="cms-video">
      <div className="wrap">
        {section.heading && <h2 {...editAttrs(section, "heading", "Heading")}>{section.heading}</h2>}
        <div className="video-embed">
          <iframe src={embedUrl} allowFullScreen title={section.heading || "Video"} {...editAttrs(section, "url", "Video URL", "url")} />
        </div>
        {section.caption && <p className="video-caption" {...editAttrs(section, "caption", "Caption")}>{section.caption}</p>}
      </div>
    </section>
  );
}

function CardsSection({ section }: { section: Section }) {
  const items = section.items || [];
  const hasImages = items.some((item) => item.image);
  return (
    <section className="cms-cards">
      <div className="wrap">
        {section.heading && (
          <Reveal className="section-head center reveal">
            {section.subheading && <div className="section-eyebrow" {...editAttrs(section, "subheading", "Eyebrow")}>{section.subheading}</div>}
            <h2 className="section-title" {...editAttrs(section, "heading", "Heading")}>{section.heading}</h2>
            {section.lede && <p className="section-sub" {...editAttrs(section, "lede", "Lead paragraph")}>{section.lede}</p>}
          </Reveal>
        )}
        <Reveal className={`cms-cards-grid reveal-stagger${hasImages ? ` cms-cards-grid-images${items.length > 2 ? " cms-cards-grid-two-columns" : ""}` : ""}`}>
          {items.map((item, i) => {
            if (item.image && !item.icon) {
              const card = (
                <>
                  <div className="explore-image">
                    <OptimizedImage src={item.image} alt={item.image_alt || ""} fill sizes="(max-width: 760px) 100vw, 50vw" className="cms-cover-image" cmsAttrs={editAttrs(section, `items.${i}.image`, "Card image", "image", { "data-cms-alt-path": `${section.id}.items.${i}.image_alt` })} />
                  </div>
                  <div className="explore-body">
                    <h3 {...editAttrs(section, `items.${i}.title`, "Card title")}>{item.title}</h3>
                    {item.description && <p {...editAttrs(section, `items.${i}.description`, "Card description")}>{item.description}</p>}
                    {item.link && item.link_text && (
                      <span className="explore-link" {...editAttrs(section, `items.${i}.link_text`, "Card link", "link", { "data-cms-href-path": `${section.id}.items.${i}.link` })}>
                        {item.link_text}
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
                      </span>
                    )}
                  </div>
                </>
              );
              if (item.link) {
                return <a key={i} href={item.link} className="explore-card">{card}</a>;
              }
              return <div key={i} className="explore-card">{card}</div>;
            }
            return (
              <div key={i} className="value-card">
                {item.icon && CARD_ICONS[item.icon] && (
                  <div className="value-icon">{CARD_ICONS[item.icon]}</div>
                )}
                <h3 {...editAttrs(section, `items.${i}.title`, "Card title")}>{item.title}</h3>
                {item.description && <p {...editAttrs(section, `items.${i}.description`, "Card description")}>{item.description}</p>}
                {item.tags && item.tags.length > 0 && (
                  <div className="cms-card-tags">
                    {item.tags.map((tag) => <span key={tag}>{tag}</span>)}
                  </div>
                )}
                {item.link && item.link_text && (
                  <a className="cms-card-link" href={item.link} {...editAttrs(section, `items.${i}.link_text`, "Card link", "link", { "data-cms-href-path": `${section.id}.items.${i}.link` })}>
                    {item.link_text}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
                  </a>
                )}
              </div>
            );
          })}
        </Reveal>
      </div>
    </section>
  );
}

function PricingCalculatorSection({ section }: { section: Section }) {
  return (
    <section className="psec" id={section.settings?.anchor as string || "calculator"}>
      <div className="wrap">
        {(section.subheading || section.heading || section.lede) && (
          <div className="section-head center">
            {section.subheading && <div className="section-eyebrow" {...editAttrs(section, "subheading", "Eyebrow")}>{section.subheading}</div>}
            {section.heading && <h2 className="section-title" {...editAttrs(section, "heading", "Heading")}>{section.heading}</h2>}
            {section.lede && <p className="section-sub" {...editAttrs(section, "lede", "Lead paragraph")}>{section.lede}</p>}
          </div>
        )}
        <PricingCalculator items={section.items} settings={section.settings?.calculator as PricingCalculatorSettings | undefined} />
      </div>
    </section>
  );
}

function DemoFrameSection({ section }: { section: Section }) {
  return (
    <section className="demo-section">
      <div className="wrap">
        {section.heading && <h2 className="section-title" {...editAttrs(section, "heading", "Heading")}>{section.heading}</h2>}
        <DemoFrame />
        {section.lede && (
          <div className="demo-hint" {...editAttrs(section, "lede", "Hint text")}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></svg>
            {section.lede}
          </div>
        )}
      </div>
    </section>
  );
}

function ContactFormSection({ section }: { section: Section }) {
  const steps = section.items || [];

  return (
    <section className="contact-section">
      <div className="wrap">
        <div className="contact-grid">
          <ContactForm
            content={{
              heading: section.heading,
              intro: section.lede,
              submitText: section.button_text,
              footnote: section.footnote,
              successHeading: section.success_heading,
              successBody: section.success_body,
              errorText: section.error_text,
              fields: section.form_fields,
            }}
          />

          <Reveal as="div" className="side-content reveal" style={{ transitionDelay: ".1s" }}>
            {section.subheading && <h2 {...editAttrs(section, "subheading", "Side heading")}>{section.subheading}</h2>}
            {section.body && <p {...editAttrs(section, "body", "Side intro")}>{section.body}</p>}

            {steps.length > 0 && (
              <div className="step-list">
                {steps.map((step, index) => (
                  <div className="step" key={step.title || index}>
                    <div className="step-num">{index + 1}</div>
                    <div className="step-content">
                      {step.title && <h4 {...editAttrs(section, `items.${index}.title`, "Step title")}>{step.title}</h4>}
                      {step.description && <p {...editAttrs(section, `items.${index}.description`, "Step description")}>{step.description}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {(section.contact_phone || section.contact_email || section.contact_hours) && (
              <div className="side-footer">
                {section.contact_phone && <ContactInfo icon="phone" text={section.contact_phone} />}
                {section.contact_email && <ContactInfo icon="mail" text={section.contact_email} />}
                {section.contact_hours && <ContactInfo icon="clock" text={section.contact_hours} />}
              </div>
            )}

            {section.main_image && (
              <figure className="contact-product-shot">
                <OptimizedImage src={section.main_image} alt={section.main_image_alt || ""} width={1200} height={800} sizes="(max-width: 900px) 100vw, 45vw" cmsAttrs={editAttrs(section, "main_image", "Contact image", "image", { "data-cms-alt-path": `${section.id}.main_image_alt` })} />
              </figure>
            )}
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function ContactInfo({ icon, text }: { icon: "phone" | "mail" | "clock"; text: string }) {
  const icons = {
    phone: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />,
    mail: <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><path d="M22 6l-10 7L2 6" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  };

  return (
    <div className="side-footer-item">
      <span className="side-footer-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{icons[icon]}</svg>
      </span>
      <span>{text}</span>
    </div>
  );
}

function FaqSection({ section }: { section: Section }) {
  const items = section.items || [];
  return (
    <section className="faq-section">
      <div className="wrap">
        {(section.subheading || section.heading || section.lede) && (
          <Reveal as="div" className="section-head center reveal">
            {section.subheading && <div className="section-eyebrow" {...editAttrs(section, "subheading", "Eyebrow")}>{section.subheading}</div>}
            {section.heading && <h2 className="section-title" {...editAttrs(section, "heading", "Heading")}>{section.heading}</h2>}
            {section.lede && <p className="section-sub" {...editAttrs(section, "lede", "Lead paragraph")}>{section.lede}</p>}
          </Reveal>
        )}
        <div className="faq-list">
          {items.map((item, index) => (
            <FaqDetails
              key={item.title || index}
              question={item.title || ""}
              answerHtml={item.description}
              questionAttrs={editAttrs(section, `items.${index}.title`, "Question")}
              answerAttrs={editAttrs(section, `items.${index}.description`, "Answer", "richtext")}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function CtaSection({ section }: { section: Section }) {
  const ctaButtons = section.buttons && section.buttons.length > 0
    ? section.buttons
    : (section.button_text && section.button_link
        ? [{ text: section.button_text, link: section.button_link, style: "primary" as const }]
        : []);
  return (
    <section className="cta-strip" style={section.background_color ? { background: section.background_color } : {}}>
      <Reveal className="wrap reveal">
        {section.subheading && <div className="section-eyebrow" style={{ color: "var(--brand-300)", justifyContent: "center" }} {...editAttrs(section, "subheading", "Eyebrow")}>{section.subheading}</div>}
        {section.heading && <h2 {...editAttrs(section, "heading", "Heading")}>{section.heading}</h2>}
        {section.body && <p {...editAttrs(section, "body", "Body")}>{section.body}</p>}
        {ctaButtons.length > 0 && (
          <div className="actions">
            {ctaButtons.map((btn, i) => (
              <a key={i} href={btn.link} className={`btn btn-${btn.style || "primary"}`} style={btn.style === "primary" ? { background: "var(--paper)", color: "var(--ink)" } : {}} {...editAttrs(section, i === 0 ? "button_text" : `buttons.${i}.text`, "Button", "link", { "data-cms-href-path": i === 0 ? `${section.id}.button_link` : `${section.id}.buttons.${i}.link` })}>
                {btn.text}
                {btn.style === "primary" && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
                )}
              </a>
            ))}
          </div>
        )}
      </Reveal>
    </section>
  );
}

function splitStatValue(title: string) {
  const m = title.match(/^([^0-9]*)([0-9][0-9,.]*)(.*)$/);
  if (!m) return { prefix: "", num: title, suffix: "" };
  return { prefix: m[1], num: m[2], suffix: m[3] };
}

function StatsSection({ section }: { section: Section }) {
  const items = section.items || [];
  return (
    <section className="proof">
      <div className="wrap">
        {(section.subheading || section.heading) && (
          <Reveal className="section-head center reveal">
            {section.subheading && <div className="section-eyebrow" {...editAttrs(section, "subheading", "Eyebrow")}>{section.subheading}</div>}
            {section.heading && <h2 className="section-title" style={{ color: "var(--paper)" }} {...editAttrs(section, "heading", "Heading")}>{section.heading}</h2>}
            {section.lede && <p className="section-sub" style={{ color: "rgba(255,255,255,0.70)" }} {...editAttrs(section, "lede", "Lead paragraph")}>{section.lede}</p>}
          </Reveal>
        )}
        {items.length > 0 && (
          /* Fades in as one block (not a per-item stagger) so the row reads as a
             single unit, matching the pricing page's stats bar. */
          <Reveal className="proof-grid reveal">
            {items.map((item, i) => {
              const { prefix, num, suffix } = splitStatValue(item.title || "");
              return (
                <div key={i} className="proof-stat">
                  <div className="proof-stat-value" {...editAttrs(section, `items.${i}.title`, "Stat value")}>
                    {prefix}<CountUp value={num} suffix={suffix} />{suffix}
                  </div>
                  {item.description && <div className="proof-stat-label" {...editAttrs(section, `items.${i}.description`, "Stat label")}>{item.description}</div>}
                </div>
              );
            })}
          </Reveal>
        )}
      </div>
    </section>
  );
}

function IndustriesSection({ section }: { section: Section }) {
  const industries = [
    { name: "Quick-Service", icon: [<path key="a" d="M3 7h18l-2 12H5L3 7z" />, <path key="b" d="M8 7V5a4 4 0 018 0v2" />] },
    { name: "Fine Dining", icon: [<path key="a" d="M5 12V8a7 7 0 0114 0v4" />, <path key="b" d="M3 12h18l-1 9H4l-1-9z" />] },
    { name: "Cafés", icon: [<path key="a" d="M17 8h1a4 4 0 010 8h-1" />, <path key="b" d="M3 8h14v9a4 4 0 01-4 4H7a4 4 0 01-4-4V8z" />] },
    { name: "Pizzerias", icon: [<circle key="a" cx="12" cy="12" r="10" />, <circle key="b" cx="9" cy="10" r="1.2" fill="currentColor" />, <circle key="c" cx="14" cy="13" r="1.2" fill="currentColor" />] },
    { name: "Food Trucks", icon: [<rect key="a" x="3" y="6" width="14" height="12" rx="1.5" />, <path key="b" d="M17 11h3l1.5 3.5V17h-4.5" />, <circle key="c" cx="7" cy="20" r="2" />, <circle key="d" cx="18" cy="20" r="2" />] },
    { name: "Bars & Lounges", icon: [<path key="a" d="M5 8l4 12h6l4-12" />, <path key="b" d="M3 8h18M8 4h8" />] },
    { name: "Delis & Markets", icon: [<rect key="a" x="3" y="3" width="18" height="18" rx="2" />, <path key="b" d="M3 9h18M9 21V9" />] },
    { name: "Multi-Location", icon: [<circle key="a" cx="12" cy="12" r="9" />, <path key="b" d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" />] },
  ];
  return (
    <section className="industries-strip">
      <div className="wrap">
        <Reveal as="div" className="section-head center reveal">
          {section.subheading && <div className="section-eyebrow" {...editAttrs(section, "subheading", "Eyebrow")}>{section.subheading}</div>}
          {section.heading && <h2 className="section-title" {...editAttrs(section, "heading", "Heading")}>{section.heading}</h2>}
          {section.lede && <p className="section-sub" {...editAttrs(section, "lede", "Lead paragraph")}>{section.lede}</p>}
        </Reveal>
        <Reveal as="div" className="industry-row reveal-stagger">
          {industries.map(({ name: industryName, icon }) => (
            <div key={industryName} className="industry-tag">
              <div className="industry-tag-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">{icon}</svg>
              </div>
              <div className="industry-tag-name">{industryName}</div>
            </div>
          ))}
        </Reveal>
        {section.button_text && section.button_link && (
          <Reveal as="div" style={{ textAlign: "center", marginTop: 48 }} className="reveal">
            <a href={section.button_link} className="btn btn-secondary" {...editAttrs(section, "button_text", "Button", "link", { "data-cms-href-path": `${section.id}.button_link` })}>
              {section.button_text}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
            </a>
          </Reveal>
        )}
      </div>
    </section>
  );
}

function AnnotationsSection({ section }: { section: Section }) {
  const items = section.items || [];
  return (
    <section className="annotations">
      <div className="wrap">
        {(section.subheading || section.heading) && (
          <div className="section-head center">
            {section.subheading && <div className="section-eyebrow" {...editAttrs(section, "subheading", "Eyebrow")}>{section.subheading}</div>}
            {section.heading && <h2 className="section-title" {...editAttrs(section, "heading", "Heading")}>{section.heading}</h2>}
          </div>
        )}
        {items.length > 0 && (
          <div className="ann-grid">
            {items.map((item, i) => (
              <div key={i} className="ann">
                {item.icon && CARD_ICONS[item.icon] && (
                  <div className="ann-icon">{CARD_ICONS[item.icon]}</div>
                )}
                {item.title && <h3 {...editAttrs(section, `items.${i}.title`, "Card title")}>{item.title}</h3>}
                {item.description && <p {...editAttrs(section, `items.${i}.description`, "Card description")}>{item.description}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function CoreFeaturesSection({ section }: { section: Section }) {
  const items = section.items || [];
  return (
    <section className="core">
      <div className="wrap">
        {(section.subheading || section.heading) && (
          <Reveal className="section-head center reveal">
            {section.subheading && <div className="section-eyebrow" {...editAttrs(section, "subheading", "Eyebrow")}>{section.subheading}</div>}
            {section.heading && <h2 className="section-title" {...editAttrs(section, "heading", "Heading")}>{section.heading}</h2>}
          </Reveal>
        )}
        {items.length > 0 && (
          <Reveal className="core-grid reveal-stagger">
            {items.map((item, i) => (
              <div key={i} className="core-card">
                <div className="core-image">
                  {item.image && <OptimizedImage src={item.image} alt={item.image_alt || ""} fill sizes="(max-width: 760px) 100vw, 50vw" className="cms-cover-image" cmsAttrs={editAttrs(section, `items.${i}.image`, "Card image", "image", { "data-cms-alt-path": `${section.id}.items.${i}.image_alt` })} />}
                </div>
                <div className="core-body">
                  {item.icon && CARD_ICONS[item.icon] && (
                    <div className="core-icon">{CARD_ICONS[item.icon]}</div>
                  )}
                  {item.title && <h3 {...editAttrs(section, `items.${i}.title`, "Card title")}>{item.title}</h3>}
                  {item.description && <p {...editAttrs(section, `items.${i}.description`, "Card description")}>{item.description}</p>}
                </div>
              </div>
            ))}
          </Reveal>
        )}
      </div>
    </section>
  );
}

function CapabilitiesSection({ section }: { section: Section }) {
  const items = section.items || [];
  return (
    <section className="capabilities">
      <div className="wrap">
        {(section.subheading || section.heading || section.lede) && (
          <Reveal className="section-head center reveal">
            {section.subheading && <div className="section-eyebrow" {...editAttrs(section, "subheading", "Eyebrow")}>{section.subheading}</div>}
            {section.heading && <h2 className="section-title" {...editAttrs(section, "heading", "Heading")}>{section.heading}</h2>}
            {section.lede && <p className="section-sub" {...editAttrs(section, "lede", "Lead paragraph")}>{section.lede}</p>}
          </Reveal>
        )}
        {items.length > 0 && (
          <Reveal className="cap-grid reveal-stagger">
            {items.map((item, i) => (
              <div key={i} className="cap">
                <div className="cap-head">
                  {item.icon && CARD_ICONS[item.icon] && (
                    <div className="cap-icon">{CARD_ICONS[item.icon]}</div>
                  )}
                  {item.title && <h3 {...editAttrs(section, `items.${i}.title`, "Item title")}>{item.title}</h3>}
                </div>
                {item.description && <p {...editAttrs(section, `items.${i}.description`, "Item description")}>{item.description}</p>}
                {item.tags && item.tags.length > 0 && (
                  <div className="cap-pills">
                    {item.tags.map((tag, j) => <span key={j} {...editAttrs(section, `items.${i}.tags.${j}`, "Tag")}>{tag}</span>)}
                  </div>
                )}
              </div>
            ))}
          </Reveal>
        )}
      </div>
    </section>
  );
}

function CompareStripSection({ section }: { section: Section }) {
  const compareRows = section.items || [];
  return (
    <section className="compare-strip">
      <div className="wrap">
        <Reveal className="compare-card reveal">
          <div>
            {section.heading && <h2 {...editAttrs(section, "heading", "Heading")}>{section.heading}</h2>}
            {section.body && <p {...editAttrs(section, "body", "Body")}>{section.body}</p>}
            {section.button_text && section.button_link && (
              <a href={section.button_link} className="btn btn-primary" style={{ background: "var(--paper)", color: "var(--ink)" }} {...editAttrs(section, "button_text", "Button", "link", { "data-cms-href-path": `${section.id}.button_link` })}>
                {section.button_text}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
              </a>
            )}
          </div>
          {compareRows.length > 0 && (
            <div className="compare-side">
              {compareRows.map((row, i) => (
                <div key={i} className="compare-row">
                  <span className="compare-row-label" {...editAttrs(section, `items.${i}.title`, "Row label")}>{row.title}</span>
                  <span className="compare-row-good" {...editAttrs(section, `items.${i}.description`, "Row value")}>{row.description}</span>
                </div>
              ))}
            </div>
          )}
        </Reveal>
      </div>
    </section>
  );
}

function CompareSection({ section }: { section: Section }) {
  if (section.settings?.variant === "pricing") {
    return <PricingCompareSection section={section} />;
  }

  const rows = section.compare_rows || [];
  const columns = section.compare_columns || ["Capability", "DEXA", "Toast", "Square", "Clover"];
  return (
    <section className="compare-section dark">
      <div className="wrap">
        {(section.subheading || section.heading) && (
          <div className="section-head center">
            {section.subheading && <div className="section-eyebrow" {...editAttrs(section, "subheading", "Eyebrow")}>{section.subheading}</div>}
            {section.heading && (
              <h2 className="section-title">
                <span {...editAttrs(section, "heading", "Heading")}>{section.heading}</span>
                {section.heading_accent && <> <span className="gold" {...editAttrs(section, "heading_accent", "Accent heading")}>{section.heading_accent}</span></>}
              </h2>
            )}
            {section.lede && <p className="section-sub" {...editAttrs(section, "lede", "Lead paragraph")}>{section.lede}</p>}
          </div>
        )}
        {rows.length > 0 && (
          <CompareSwitch competitors={columns.slice(2)} tone="dark">
          <div className="compare-scroll">
            <div className="compare-table">
              <div className="compare-r compare-head">
                {columns.map((col, i) => (
                  <div key={i} data-col={i} className={`compare-c ${i === 1 ? "dexa" : ""}`} {...editAttrs(section, `compare_columns.${i}`, "Table column")}>{col}</div>
                ))}
              </div>
              {rows.map((row, i) => (
                <div className="compare-r" key={i}>
                  {row.map((cell, j) => (
                    <div key={j} data-col={j} className={`compare-c ${j === 1 ? "dexa" : ""} ${j === 0 ? "feat" : ""}`}>
                      {j === 1 && (
                        <span className="ck">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                        </span>
                      )}
                      <span {...editAttrs(section, `compare_rows.${i}.${j}`, "Table cell")}>{cell}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
          </CompareSwitch>
        )}
      </div>
    </section>
  );
}

function StatusIcon({ icon }: { icon?: "check" | "x" | "none" }) {
  if (icon === "check") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
        <path d="M5 12l5 5L20 7" />
      </svg>
    );
  }

  if (icon === "x") {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
        <path d="M6 6l12 12M18 6l-12 12" />
      </svg>
    );
  }

  return null;
}

/**
 * Renders "/mo" and "/mo*" so CSS can shorten them to "/m" on narrow screens.
 *
 * The switched-down pricing table gives each column roughly 100px, where
 * "$0-$69/mo*" wraps onto a second line. Only the tail is wrapped — the cell's
 * textContent stays exactly what the CMS stored, which the inline editor reads.
 */
function withCompactUnit(value: string) {
  if (!value.includes("/mo")) return value;

  // The cell wrappers are inline-flex, which would blockify a bare tail span and
  // drop the "o" onto a line of its own. Keep the value inside one inline element.
  return (
    <span className="cmp-unit">
      {value.split(/(\/mo\*?)/g).map((part, i) => {
        const match = /^\/mo(\*?)$/.exec(part);
        if (!match) return <Fragment key={i}>{part}</Fragment>;

        return (
          <Fragment key={i}>
            /m<span className="cmp-unit-tail">{`o${match[1]}`}</span>
          </Fragment>
        );
      })}
    </span>
  );
}

function PricingCell({ value, tone, icon }: { value: string; tone?: "default" | "positive" | "muted" | "strong"; icon?: "check" | "x" | "none" }) {
  // Untoned cells used to render as a bare fragment, inheriting the plain body
  // colour. In rows where only some cells carry a tone (e.g. "Online ordering
  // commission") that made comparable figures render in different colours —
  // the inconsistency called out in the Aug 2026 feedback. Give every cell a
  // wrapper so the column reads as one treatment.
  if (!tone || tone === "default") return <span className="check-default">{withCompactUnit(value)}</span>;

  const className = tone === "positive" ? "check-yes" : tone === "strong" ? "check-strong" : "check-no";

  return (
    <span className={className}>
      <StatusIcon icon={icon} />
      <span className="pricing-cell-value">{withCompactUnit(value)}</span>
    </span>
  );
}

function PricingCompareSection({ section }: { section: Section }) {
  const rows = section.compare_rows || [];
  const columns = section.compare_columns || ["", "DEXA", "Toast", "Square for Restaurants", "Clover"];
  const styles = section.compare_cell_styles || [];

  return (
    <section className={`psec ${section.settings?.background === "alt" ? "alt" : ""}`}>
      <div className="wrap">
        {(section.subheading || section.heading || section.lede) && (
          <div className="section-head center">
            {section.subheading && <div className="section-eyebrow" {...editAttrs(section, "subheading", "Eyebrow")}>{section.subheading}</div>}
            {section.heading && <h2 className="section-title" {...editAttrs(section, "heading", "Heading")}>{section.heading}</h2>}
            {section.lede && <p className="section-sub" {...editAttrs(section, "lede", "Lead paragraph")}>{section.lede}</p>}
          </div>
        )}

        {rows.length > 0 && (
          <CompareSwitch competitors={columns.slice(2)}>
          <div className="compare-card">
            <table className="compare-table">
              <colgroup>
                <col className="compare-col-label" />
                <col className="compare-col-dexa" />
                <col className="compare-col-toast" />
                <col className="compare-col-square" />
                <col className="compare-col-clover" />
              </colgroup>
              <thead>
                <tr>
                  {columns.map((column, index) => (
                    <th key={index} data-col={index} className={index === 1 ? "dexa-col" : ""} {...editAttrs(section, `compare_columns.${index}`, "Table column")}>
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => {
                      const cellStyle = styles[rowIndex]?.[cellIndex];

                      if (cellIndex === 0) {
                        return (
                          <td key={cellIndex} data-col={cellIndex} className="row-label" {...editAttrs(section, `compare_rows.${rowIndex}.${cellIndex}`, "Table cell")}>
                            {cell}
                          </td>
                        );
                      }

                      return (
                        <td key={cellIndex} data-col={cellIndex} className={cellIndex === 1 ? "dexa-col" : ""}>
                          <span {...editAttrs(section, `compare_rows.${rowIndex}.${cellIndex}`, "Table cell")}>
                            <PricingCell value={cell} tone={cellStyle?.tone} icon={cellStyle?.icon} />
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>

            {(section.footnote || (section.button_text && section.button_link)) && (
              <div className="compare-foot">
                {section.footnote && <span {...editAttrs(section, "footnote", "Footnote")}>{section.footnote}</span>}
                {section.button_text && section.button_link && (
                  <a href={section.button_link} {...editAttrs(section, "button_text", "Button", "link", { "data-cms-href-path": `${section.id}.button_link` })}>
                    {section.button_text}
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M5 12h14M13 5l7 7-7 7" />
                    </svg>
                  </a>
                )}
              </div>
            )}
          </div>
          </CompareSwitch>
        )}
      </div>
    </section>
  );
}
