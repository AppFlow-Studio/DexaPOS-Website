import { Star } from "lucide-react";

import type { SectionRenderProps } from "@/lib/site-builder/render-context";
import { fieldAttrsFor } from "../edit-attrs";
import { Container, SectionHeading, sectionClassName, sectionStyleProps } from "../section-shell";

/**
 * Guest quotes, as the merchant typed them.
 *
 * Renders nothing at all when there are none. An empty reviews block on a live
 * page reads as "nobody has ever said anything nice about this restaurant",
 * which is worse than the section not being there — and a merchant who adds one
 * and then forgets to fill it in should not be punished publicly for it.
 */
export default function ReviewsSection({ section, ctx }: SectionRenderProps<"reviews">) {
  const { title, subtitle, items } = section.props;
  const f = fieldAttrsFor(ctx.mode, section.id);

  if (items.length === 0 && ctx.mode !== "builder") return null;

  return (
    <section
      className={sectionClassName(section.style)}
      style={sectionStyleProps(section.style)}
    >
      <Container>
        <SectionHeading
          heading={title}
          subheading={subtitle}
          align={section.style?.align}
          headingAttrs={f("props.title")}
          subheadingAttrs={f("props.subtitle")}
        />

        {items.length === 0 ? (
          <p className="rounded-[var(--site-radius)] border border-dashed p-8 text-center text-sm opacity-60">
            Add a guest review and it will appear here.
          </p>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item, index) => (
              <li
                key={index}
                className="flex flex-col rounded-[var(--site-radius)] border p-5"
                style={{ borderColor: "var(--site-border)", background: "var(--site-card)" }}
              >
                {item.rating && (
                  <div
                    className="mb-4 flex items-center gap-1"
                    style={{ color: "var(--site-brand)" }}
                    role="img"
                    aria-label={`${item.rating} out of 5`}
                  >
                    {Array.from({ length: 5 }, (_, index) => {
                      const filled = index < item.rating!;
                      return (
                        <Star
                          key={index}
                          aria-hidden
                          className={filled ? "size-6 fill-current" : "size-6 opacity-25"}
                          strokeWidth={1.8}
                        />
                      );
                    })}
                  </div>
                )}
                <blockquote
                  className="flex-1 text-sm leading-relaxed"
                  {...f(`props.items.${index}.quote`)}
                >
                  {item.quote}
                </blockquote>
                <cite
                  className="mt-4 text-xs font-medium not-italic opacity-70"
                  {...f(`props.items.${index}.author`)}
                >
                  {item.author}
                </cite>
              </li>
            ))}
          </ul>
        )}
      </Container>
    </section>
  );
}
