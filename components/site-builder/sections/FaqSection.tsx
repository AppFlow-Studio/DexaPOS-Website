import { sanitizeHtml } from "@/lib/cms/sanitize";
import type { SectionRenderProps } from "@/lib/site-builder/render-context";
import { fieldAttrs } from "../edit-attrs";
import FaqAccordion from "./shared/FaqAccordion";
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

  /*
    Centred unless the merchant has said otherwise.

    An FAQ is a narrow reading column rather than a full-bleed band, and a
    heading pinned to the far left of a 3xl column that is itself centred on a
    wide page just looks lost. `align` is a three-state field — `left`,
    `center`, or unset — so an explicit `left` still wins and the Style control
    keeps doing something. Only the *default* changes.

    The questions and answers stay left-aligned inside their cards regardless:
    centred body copy is harder to read, and that is what `.site-faq`'s
    `text-left` is for.
  */
  const align = section.style?.align ?? "center";
  const style = { ...section.style, align };

  if (items.length === 0 && ctx.mode !== "builder") return null;

  // Sanitize on the server so no unsanitized markup ever crosses into the island.
  const prepared = items.map((item) => ({
    question: item.question,
    answerHtml: sanitizeHtml(item.answer),
  }));

  return (
    <section
      className={sectionClassName(style)}
      style={sectionStyleProps(style, ctx.theme)}
      id="faq"
    >
      <Container className="max-w-3xl">
        <SectionHeading
          heading={heading}
          subheading={subheading}
          align={align}
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
