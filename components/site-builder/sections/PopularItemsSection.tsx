import {
  lookupMenuItem,
  type ResolvedMenuItem,
} from "@/lib/site-builder/bindings/resolved";
import type { SectionRenderProps } from "@/lib/site-builder/render-context";
import { fieldAttrsFor } from "../edit-attrs";
import SiteImage from "../SiteImage";
import {
  Container,
  CtaButton,
  SectionHeading,
  formatMoney,
  sectionClassName,
  sectionStyleProps,
} from "../section-shell";

const GRID_CLASSES = {
  "grid-2": "grid-cols-1 sm:grid-cols-2",
  "grid-3": "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  "grid-4": "grid-cols-2 lg:grid-cols-4",
  carousel: "grid-flow-col auto-cols-[minmax(260px,1fr)] overflow-x-auto",
} as const;

/**
 * The section that proves decision D6.
 *
 * Nothing here is stored. The merchant picked *which* items and *what order*;
 * every value on screen — name, description, price, photo, availability —
 * arrives from the resolver, fresh, on every render. Changing a price in the POS
 * changes this section on the next request, with no republish.
 *
 * Two failure paths, both normal rather than exceptional:
 *
 *  * `not_found` — deleted, or no longer on a menu serving this location. The
 *    card is dropped and the grid reflows. The publish gate warns separately, so
 *    the merchant hears about it there rather than from a hole in their page.
 *  * `unavailable` — 86'd or snoozed right now. Also dropped: a section headed
 *    "Guest Favorites" advertising something the kitchen cannot make is worse
 *    than a shorter section.
 *
 * If fewer than two items survive, the whole section hides. One lonely card
 * under a "Guest Favorites" heading reads as broken.
 */
export default function PopularItemsSection({
  section,
  resolved,
  ctx,
}: SectionRenderProps<"popular-items">) {
  const { heading, subheading, items, layout, showPrices, showDescriptions, cta } = section.props;
  const f = fieldAttrsFor(ctx.mode, section.id);

  const visible: { binding: (typeof items)[number]; item: ResolvedMenuItem }[] = [];
  for (const binding of items) {
    const result = lookupMenuItem(resolved, binding.id);
    if (result.status === "ok") visible.push({ binding, item: result.data });
  }

  // In the builder the merchant must still see the section they are editing,
  // even when every item is currently 86'd — otherwise it appears to vanish.
  if (visible.length < 2 && ctx.mode !== "builder") return null;

  const showDisclosure = showPrices && ctx.site.pricingDisclosureText;

  return (
    <section
      className={sectionClassName(section.style)}
      style={sectionStyleProps(section.style)}
    >
      <Container>
        <SectionHeading
          heading={heading}
          subheading={subheading}
          align={section.style?.align}
          headingAttrs={f("props.heading")}
          subheadingAttrs={f("props.subheading")}
        />

        {visible.length === 0 ? (
          ctx.mode === "builder" ? (
            <p className="rounded-[var(--site-radius)] border border-dashed p-8 text-center text-sm opacity-70">
              No items to show yet. Pick some from your menu.
            </p>
          ) : null
        ) : (
          <ul className={`grid gap-6 ${GRID_CLASSES[layout]}`}>
            {visible.map(({ binding, item }) => {
              return (
                <li
                  key={binding.id}
                  className="flex flex-col overflow-hidden rounded-[var(--site-radius)] border"
                  style={{ borderColor: "var(--site-border)", background: "var(--site-card)" }}
                >
                  {item.image && (
                    <SiteImage
                      asset={null}
                      ctx={ctx}
                      fallbackUrl={item.image}
                      className="aspect-[4/3] w-full object-cover"
                    />
                  )}
                  <div className="flex flex-1 flex-col gap-2 p-5">
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="text-base font-semibold">
                        {/* An override is the one legal way to shadow live data. */}
                        {binding.overrides?.label ?? item.name}
                      </h3>
                      {showPrices && (
                        <span className="shrink-0 text-base font-semibold tabular-nums">
                          {formatMoney(item.price, ctx.locale)}
                        </span>
                      )}
                    </div>
                    {showDescriptions && (binding.overrides?.caption ?? item.description) && (
                      <p className="text-sm leading-relaxed opacity-70">
                        {binding.overrides?.caption ?? item.description}
                      </p>
                    )}
                    {item.dietaryTags.length > 0 && (
                      <ul className="mt-auto flex flex-wrap gap-1.5 pt-2">
                        {item.dietaryTags.map((tag) => (
                          <li
                            key={tag}
                            className="rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide opacity-70"
                            style={{ background: "var(--site-surface-muted)" }}
                          >
                            {tag}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {showDisclosure && (
          <p className="mt-6 text-xs opacity-60">{ctx.site.pricingDisclosureText}</p>
        )}

        {cta && (
          <div className={`mt-10 ${section.style?.align === "center" ? "text-center" : ""}`}>
            <CtaButton
              label={cta.label}
              target={cta.target}
              ctx={ctx}
              variant="secondary"
              attrs={f("props.cta.label")}
            />
          </div>
        )}
      </Container>
    </section>
  );
}
