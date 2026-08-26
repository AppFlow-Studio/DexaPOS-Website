import {
  lookupMenuItem,
  type ResolvedMenuItem,
} from "@/lib/site-builder/bindings/resolved";
import { canShowPrices, type SectionRenderProps } from "@/lib/site-builder/render-context";
import { fieldAttrsFor } from "../edit-attrs";
import SiteImage from "../SiteImage";
import { trackAttrs } from "@/lib/site-builder/tracking";
import {
  Container,
  CtaButton,
  SectionHeading,
  formatMoney,
  orderItemHref,
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
  const {
    heading,
    subheading,
    items,
    layout,
    showPrices,
    showDescriptions,
    showAddButton,
    cta,
  } = section.props;
  const f = fieldAttrsFor(ctx.mode, section.id);

  // The merchant asked for prices; whether they may appear is a separate
  // question. On a brand page, before the visitor has picked a restaurant, five
  // branches may charge five different amounts — so no number is the honest one.
  const showMoney = showPrices && canShowPrices(ctx);

  // The `+` navigates. In the builder that would throw the merchant off the page
  // they are editing, so the affordance is drawn but inert there — they still see
  // what a visitor sees without being able to leave by accident.
  const addIsLive = showAddButton && ctx.mode !== "builder";

  const visible: { binding: (typeof items)[number]; item: ResolvedMenuItem }[] = [];
  for (const binding of items) {
    const result = lookupMenuItem(resolved, binding.id);
    if (result.status === "ok") visible.push({ binding, item: result.data });
  }

  // In the builder the merchant must still see the section they are editing,
  // even when every item is currently 86'd — otherwise it appears to vanish.
  if (visible.length < 2 && ctx.mode !== "builder") return null;

  return (
    <section
      className={sectionClassName(section.style)}
      style={sectionStyleProps(section.style, ctx.theme)}
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
          <ul className={`grid gap-x-4 gap-y-8 ${GRID_CLASSES[layout]}`}>
            {visible.map(({ binding, item }) => {
              const label = binding.overrides?.label ?? item.name;
              // Null when the merchant has no storefront to link into: the card
              // still renders, it just loses a button that could go nowhere.
              const addHref = showAddButton ? orderItemHref(item.id, ctx) : null;
              const add = addHref ? (
                <AddButton href={addHref} label={label} live={addIsLive} />
              ) : null;

              return (
                <li
                  key={binding.id}
                  className="group flex min-w-0 flex-col overflow-hidden rounded-[var(--site-radius)]"
                  style={{ background: "var(--site-card)" }}
                >
                  <div
                    className="relative aspect-square overflow-hidden"
                    style={{ background: "var(--site-surface-muted)" }}
                  >
                    {item.image ? (
                      <SiteImage
                        asset={null}
                        ctx={ctx}
                        fallbackUrl={item.image}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-xs font-medium opacity-45">
                        No image
                      </span>
                    )}
                    {/* Over the image or its placeholder, as Owner places it. */}
                    {add && <div className="absolute bottom-3 right-3">{add}</div>}
                  </div>

                  <div className="flex flex-1 flex-col gap-1 p-4">
                    <h3 className="text-xl font-semibold leading-snug">
                      {/* An override is the one legal way to shadow live data. */}
                      {label}
                    </h3>
                    {showMoney && (
                      <span className="text-base font-medium leading-snug tabular-nums">
                        {formatMoney(item.price, ctx.locale)}
                      </span>
                    )}
                    {showDescriptions && (binding.overrides?.caption ?? item.description) && (
                      <p className="pt-1 text-base leading-relaxed">
                        {binding.overrides?.caption ?? item.description}
                      </p>
                    )}
                    {item.dietaryTags.length > 0 && (
                      <ul className="mt-auto flex flex-wrap gap-1.5 pt-3">
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

        {cta && (
          <div className="mt-6 text-center">
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

/**
 * The `+` on a card — the same affordance the ordering menu already puts on its
 * own item cards (`app/sites/components/MenuBrowser.tsx`), so a visitor meets
 * one button that means one thing across both surfaces.
 *
 * An anchor rather than a handler, because this section is a server component
 * and must stay one. It also means middle-click and "open in new tab" behave,
 * which a div with an onClick would not.
 *
 * `live` is false inside the builder: the merchant sees the button on their card
 * but cannot navigate off the page they are editing by clicking it.
 */
function AddButton({
  href,
  label,
  live,
}: {
  href: string;
  label: string;
  live: boolean;
}) {
  const className =
    "flex h-10 w-10 items-center justify-center rounded-[var(--site-radius)] text-xl leading-none shadow-sm transition-transform hover:scale-110";
  const style = {
    background: "var(--site-brand)",
    color: "var(--site-brand-contrast)",
  } as const;

  if (!live) {
    return (
      <span className={className} style={style} aria-hidden="true">
        +
      </span>
    );
  }

  return (
    <a
      href={href}
      className={className}
      style={style}
      // Matches the storefront's own wording for the same control.
      aria-label={`Add ${label} to cart`}
      /*
        This is an order click in every sense that matters — the visitor is
        leaving for the ordering storefront — so it reports as one rather than
        inventing a second name for the same conversion. See `CtaButton`.
      */
      {...trackAttrs("order_click")}
    >
      <span aria-hidden="true">+</span>
    </a>
  );
}
