import type { SectionRenderProps } from "@/lib/site-builder/render-context";
import { fieldAttrsFor } from "../edit-attrs";
import SiteImage from "../SiteImage";
import {
  Container,
  CtaButton,
  SectionHeading,
  sectionClassName,
  sectionStyleProps,
} from "../section-shell";

/** A row of offers, each carrying its own photo, paragraph and button. */
export default function CardsSection({ section, ctx }: SectionRenderProps<"cards">) {
  const { title, subtitle, items, columns } = section.props;
  const f = fieldAttrsFor(ctx.mode, section.id);

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

        <ul
          className={`grid gap-6 ${columns === 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3"}`}
        >
          {items.map((item, index) => (
            <li
              key={index}
              className="flex flex-col overflow-hidden rounded-[var(--site-radius)]"
              style={{ background: "var(--site-card)" }}
            >
              {item.image && (
                <SiteImage
                  asset={item.image}
                  ctx={ctx}
                  className="aspect-[3/2] w-full object-cover"
                />
              )}
              <div className="flex flex-1 flex-col p-5">
                <h3 className="text-lg font-semibold" {...f(`props.items.${index}.title`)}>
                  {item.title}
                </h3>
                {item.body && (
                  <p
                    className="mt-2 flex-1 text-sm leading-relaxed opacity-75"
                    {...f(`props.items.${index}.body`)}
                  >
                    {item.body}
                  </p>
                )}
                {item.cta && (
                  <div className="mt-5">
                    <CtaButton label={item.cta.label} target={item.cta.target} ctx={ctx} />
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
