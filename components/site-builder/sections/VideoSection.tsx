import type { SectionRenderProps } from "@/lib/site-builder/render-context";
import { videoEmbedUrl } from "@/lib/site-builder/sections/schemas/video";
import { fieldAttrsFor } from "../edit-attrs";
import { Container, SectionHeading, sectionClassName, sectionStyleProps } from "../section-shell";

/**
 * One embedded video.
 *
 * The `src` is **built here from a provider and an id**, never stored and never
 * taken from merchant text — which is what keeps this from being an
 * arbitrary-iframe hole in an otherwise closed system. There is no "paste your
 * embed code" field in this product and there should not be one.
 *
 * YouTube goes through `youtube-nocookie.com`, which does not set tracking
 * cookies until the visitor actually presses play. A restaurant should not owe
 * anyone a consent banner because they embedded a kitchen tour.
 */
export default function VideoSection({ section, ctx }: SectionRenderProps<"video">) {
  const { title, subtitle, provider, videoId } = section.props;
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

        {videoId ? (
          <div
            className="aspect-video w-full overflow-hidden rounded-[var(--site-radius)]"
            style={{ background: "var(--site-surface-muted)" }}
          >
            <iframe
              src={videoEmbedUrl(provider, videoId)}
              title={title || "Video"}
              loading="lazy"
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
              className="h-full w-full border-0"
            />
          </div>
        ) : (
          ctx.mode === "builder" && (
            <p className="rounded-[var(--site-radius)] border border-dashed p-8 text-center text-sm opacity-60">
              Paste a YouTube or Vimeo link to show a video here.
            </p>
          )
        )}
      </Container>
    </section>
  );
}
