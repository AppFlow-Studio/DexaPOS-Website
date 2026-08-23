import type { SectionRenderProps } from "@/lib/site-builder/render-context";
import {
  PROVIDER_SPECS,
  resolveIntegrationEmbed,
} from "@/lib/site-builder/sections/schemas/integrations";

import { fieldAttrsFor } from "../edit-attrs";
import { Container, SectionHeading, sectionClassName, sectionStyleProps } from "../section-shell";

/**
 * One allowlisted third-party embed.
 *
 * The iframe source is reconstructed by `resolveIntegrationEmbed`, never read
 * straight from merchant text. There is deliberately no `srcDoc`, pasted HTML,
 * script tag or generic hostname escape hatch in this section — the settings
 * panel accepts a pasted snippet, but what it stores is a URL this codebase
 * rebuilt, so nothing merchant-authored is ever what lands here.
 */
export default function IntegrationsSection({ section, ctx }: SectionRenderProps<"integrations">) {
  const { title, subtitle, provider, embedUrl } = section.props;
  const embed = resolveIntegrationEmbed(provider, embedUrl);
  const spec = PROVIDER_SPECS[provider];
  const f = fieldAttrsFor(ctx.mode, section.id);

  /*
    An unconfigured integration is a real, titled section rather than a dashed
    developer box — the provider's own name if the merchant has not given it
    one, and a plain sentence saying what is missing.

    The reason is that it is drawn in the page's own fonts, at the section's own
    spacing, in the place the beer menu will occupy. It shows the merchant the
    shape of what they are about to get, which a grey outline labelled with a
    field name does not. Owner's editor does the same and it is why an empty
    integration reads as unfinished rather than as broken.

    Builder-only, always: `preview` and `public` are the same DOM as the live
    site, and "add your embed information" must never reach a visitor. A section
    nobody has filled in simply is not there.
  */
  if (!embed) {
    if (ctx.mode !== "builder") return null;

    return (
      <section className={sectionClassName(section.style)} style={sectionStyleProps(section.style)}>
        <Container>
          <SectionHeading
            heading={title || spec.placeholderTitle}
            subheading={subtitle}
            align={section.style?.align}
            headingAttrs={f("props.title")}
            subheadingAttrs={f("props.subtitle")}
          />
          <p className="text-base leading-relaxed opacity-70">
            Add your {spec.label} embed information to configure this integration.
          </p>
        </Container>
      </section>
    );
  }

  return (
    <section className={sectionClassName(section.style)} style={sectionStyleProps(section.style)}>
      <Container>
        <SectionHeading
          heading={title}
          subheading={subtitle}
          align={section.style?.align}
          headingAttrs={f("props.title")}
          subheadingAttrs={f("props.subtitle")}
        />

        <div
          className="w-full overflow-hidden rounded-[var(--site-radius)]"
          style={{ background: "var(--site-surface-muted)", height: embed.height }}
        >
          <iframe
            src={embed.src}
            title={title || embed.title}
            height={embed.height}
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            allow={embed.allow}
            allowFullScreen
            sandbox="allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation allow-same-origin allow-scripts"
            className="h-full w-full border-0"
          />
        </div>
      </Container>
    </section>
  );
}
