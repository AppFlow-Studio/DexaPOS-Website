import { sanitizeHtml } from "@/lib/cms/sanitize";
import type { SectionRenderProps } from "@/lib/site-builder/render-context";
import { fieldAttrs } from "../edit-attrs";
import FaqAccordion from "../islands/FaqAccordion";
import {
  Container,
  SectionHeading,
  sectionClassName,
  sectionStyleProps,
} from "../section-shell";

/**
 * FAQ — a server component wrapping a client island.
 *
 * The sanitizing, the layout and the heading all happen on the server; only the
 * accordion's open/close behaviour is shipped to the browser. This is the split
 * every interactive section should follow.
 */
export default function FaqSection({ section, ctx }: SectionRenderProps<"faq">) {
  const { heading, subheading, items, defaultOpenFirst } = section.props;
  const f = (path: string) => fieldAttrs(ctx.mode, section.id, path);

  if (items.length === 0 && ctx.mode !== "builder") return null;

  // Sanitize on the server so no unsanitized markup ever crosses into the island.
  const prepared = items.map((item) => ({
    question: item.question,
    answerHtml: sanitizeHtml(item.answer),
  }));

  return (
    <section
      className={sectionClassName(section.style)}
      style={sectionStyleProps(section.style)}
      id="faq"
    >
      <Container className="max-w-3xl">
        <SectionHeading
          heading={heading}
          subheading={subheading}
          align={section.style?.align}
          headingAttrs={f("props.heading")}
          subheadingAttrs={f("props.subheading")}
        />

        {prepared.length === 0 ? (
          <p className="rounded-[var(--site-radius)] border border-dashed p-8 text-center text-sm opacity-70">
            Add the questions guests ask most.
          </p>
        ) : (
          <FaqAccordion
            items={prepared}
            defaultOpenFirst={defaultOpenFirst}
            fieldAttrs={
              ctx.mode === "builder"
                ? (index, field) =>
                    fieldAttrs(
                      ctx.mode,
                      section.id,
                      `props.items.${index}.${field}`,
                      field === "answer" ? "richtext" : "text",
                    )
                : undefined
            }
          />
        )}
      </Container>
    </section>
  );
}
