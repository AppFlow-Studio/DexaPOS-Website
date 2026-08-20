import type { SectionRenderProps } from "@/lib/site-builder/render-context";
import { resolveIntegrationEmbed } from "@/lib/site-builder/sections/schemas/integrations";

import { fieldAttrsFor } from "../edit-attrs";
import { Container, SectionHeading, sectionClassName, sectionStyleProps } from "../section-shell";

/**
 * One allowlisted third-party embed.
 *
 * The iframe source is reconstructed by `resolveIntegrationEmbed`, never read
 * straight from merchant text. There is deliberately no `srcDoc`, pasted HTML,
 * script tag or generic hostname escape hatch in this section.
 */
export default function IntegrationsSection({ section, ctx }: SectionRenderProps<"integrations">) {
  const { title, subtitle, provider, embedUrl } = section.props;
  const embed = resolveIntegrationEmbed(provider, embedUrl);
  const f = fieldAttrsFor(ctx.mode, section.id);

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

        {embed ? (
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
        ) : (
          ctx.mode === "builder" && (
            <p className="rounded-[var(--site-radius)] border border-dashed p-8 text-center text-sm opacity-60">
              Paste a {provider === "google-maps" ? "Google Maps embed" : "Spotify share"} link
              to show it here.
            </p>
          )
        )}
      </Container>
    </section>
  );
}
