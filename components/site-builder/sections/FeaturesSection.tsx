import {
  BookOpen,
  Briefcase,
  Cake,
  Car,
  Clock,
  CreditCard,
  Gift,
  Globe,
  Heart,
  House,
  Leaf,
  MapPin,
  Mic,
  Phone,
  ShoppingBag,
  Star,
  Truck,
  UtensilsCrossed,
  Users,
  WheatOff,
  type LucideIcon,
} from "lucide-react";

import type { SectionRenderProps } from "@/lib/site-builder/render-context";
import type { FeatureIconName } from "@/lib/site-builder/sections/feature-icon";
import { fieldAttrsFor } from "../edit-attrs";
import {
  Container,
  SectionHeading,
  sectionClassName,
  sectionStyleProps,
  textToneColor,
} from "../section-shell";

/**
 * Icon names to components.
 *
 * The name comes from a closed picker, so this map is exhaustive over
 * `FeatureIconName` and cannot fall short of it — a name the merchant could
 * choose but this file had not imported would be a type error, not a blank.
 */
const FEATURE_ICONS: Record<FeatureIconName, LucideIcon> = {
  Cake,
  Car,
  CreditCard,
  ShoppingBag,
  Mic,
  Truck,
  UtensilsCrossed,
  Globe,
  WheatOff,
  Heart,
  Leaf,
  House,
  Phone,
  MapPin,
  Star,
  BookOpen,
  Users,
  Clock,
  Gift,
  Briefcase,
};

/** Short selling points. Literal content — nothing here binds to platform data. */
export default function FeaturesSection({ section, ctx }: SectionRenderProps<"features">) {
  const { heading, items, iconTone, iconColor } = section.props;
  const f = fieldAttrsFor(ctx.mode, section.id);

  if (items.length === 0 && ctx.mode !== "builder") return null;

  /*
    Centred unless the merchant says otherwise: an amenity strip reads as a
    centred band, which is how the reference renders it. The items follow the
    heading rather than having a switch of their own — a centred title over a
    left-packed row is not a layout anyone is asking for.
  */
  const align = section.style?.align ?? "center";

  /*
    Resolved through the same function that colours section copy, against the
    same backdrop, so an icon colour cannot promise what text of that tone would
    not deliver — including the brand band, which takes no custom colour at all.
  */
  const iconFill = textToneColor(
    section.style?.background ?? "default",
    { ...section.style, textTone: iconTone ?? "brand", textColor: iconColor },
    ctx.theme,
  );

  return (
    <section
      className={sectionClassName(section.style)}
      style={sectionStyleProps(section.style, ctx.theme)}
    >
      <Container>
        <SectionHeading heading={heading} align={align} headingAttrs={f("props.heading")} />

        {items.length === 0 ? (
          <p className="rounded-[var(--site-radius)] border border-dashed p-8 text-center text-sm opacity-70">
            Add a few highlights — delivery, hours, what makes you different.
          </p>
        ) : (
          /*
            Wrapping rather than a fixed column count: five centred items fall
            three-then-two with the short row centred under the long one, which
            is the shape an amenity strip wants at every width.
          */
          <ul
            className={`mt-10 flex flex-wrap gap-x-10 gap-y-9 ${
              align === "center" ? "justify-center" : "justify-start"
            }`}
          >
            {items.map((item, index) => {
              const Icon = FEATURE_ICONS[item.icon];
              return (
                <li
                  key={`${item.title}-${index}`}
                  className="flex w-40 flex-col items-center text-center"
                >
                  <Icon
                    className="mb-3 size-6"
                    strokeWidth={1.5}
                    style={{ color: iconFill }}
                    aria-hidden="true"
                  />
                  <h3 className="text-sm font-semibold" {...f(`props.items.${index}.title`)}>
                    {item.title}
                  </h3>
                  {item.description && (
                    <p
                      className="mt-1.5 text-xs leading-relaxed opacity-70"
                      {...f(`props.items.${index}.description`)}
                    >
                      {item.description}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Container>
    </section>
  );
}
