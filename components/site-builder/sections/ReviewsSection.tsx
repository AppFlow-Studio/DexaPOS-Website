import type { SectionRenderProps } from "@/lib/site-builder/render-context";
import type { ReviewLayout } from "@/lib/site-builder/sections/schemas/reviews";
import { cn } from "@/lib/utils";
import { fieldAttrsFor } from "../edit-attrs";
import ReviewStarIcon from "../ReviewStarIcon";
import { Container, SectionHeading, sectionClassName, sectionStyleProps } from "../section-shell";

const LAYOUT_CLASSES: Record<ReviewLayout, string> = {
  grid: "grid gap-5 sm:grid-cols-2 lg:grid-cols-3",
  list: "grid max-w-3xl gap-5",
  carousel:
    "grid snap-x snap-mandatory grid-flow-col auto-cols-[minmax(280px,85%)] gap-5 overflow-x-auto pb-3 sm:auto-cols-[minmax(300px,48%)] lg:auto-cols-[minmax(320px,32%)]",
};

/**
 * Guest quotes, as the merchant typed them.
 *
 * Renders nothing at all when there are none. An empty reviews block on a live
 * page reads as "nobody has ever said anything nice about this restaurant",
 * which is worse than the section not being there — and a merchant who adds one
 * and then forgets to fill it in should not be punished publicly for it.
 */
export default function ReviewsSection({ section, ctx }: SectionRenderProps<"reviews">) {
  const { title, subtitle, layout, items } = section.props;
  const f = fieldAttrsFor(ctx.mode, section.id);

  if (items.length === 0 && ctx.mode !== "builder") return null;

  return (
    <section
      className={sectionClassName(section.style)}
      style={sectionStyleProps(section.style, ctx.theme)}
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
          <ul className={LAYOUT_CLASSES[layout]}>
            {items.map((item, index) => (
              <li
                key={index}
                className={cn(
                  "flex flex-col rounded-[var(--site-radius)] p-5",
                  layout === "carousel" && "snap-start",
                )}
                style={{ background: "var(--site-card)", color: "var(--site-text)" }}
              >
                {item.rating && (
                  <div
                    className="mb-4 flex items-center gap-1"
                    role="img"
                    aria-label={`${item.rating} out of 5`}
                  >
                    {Array.from({ length: 5 }, (_, index) => {
                      const filled = index < item.rating!;
                      return (
                        <ReviewStarIcon
                          key={index}
                          active={filled}
                          className="size-5"
                        />
                      );
                    })}
                  </div>
                )}
                <blockquote
                  className="flex-1 text-base leading-relaxed"
                  {...f(`props.items.${index}.quote`)}
                >
                  {item.quote}
                </blockquote>
                <cite
                  className="mt-4 text-sm font-medium not-italic"
                  style={{ color: "var(--site-text-muted)" }}
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
