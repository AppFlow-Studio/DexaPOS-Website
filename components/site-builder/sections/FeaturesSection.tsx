import {
  Award,
  Clock,
  CreditCard,
  Gift,
  Heart,
  Leaf,
  MapPin,
  Sparkles,
  Star,
  Truck,
  UtensilsCrossed,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { SectionRenderProps } from "@/lib/site-builder/render-context";
import { fieldAttrsFor } from "../edit-attrs";
import {
  Container,
  SectionHeading,
  sectionClassName,
  sectionStyleProps,
} from "../section-shell";

/**
 * Icons are stored as names and resolved against this allowlist.
 *
 * A name is data a merchant can edit; a component is not. Anything unrecognised
 * renders without an icon rather than crashing the section — the same
 * degrade-don't-throw rule the resolver follows for missing records.
 */
const FEATURE_ICONS: Record<string, LucideIcon> = {
  Award,
  Clock,
  CreditCard,
  Gift,
  Heart,
  Leaf,
  MapPin,
  Sparkles,
  Star,
  Truck,
  UtensilsCrossed,
  Users,
};

export const FEATURE_ICON_NAMES = Object.keys(FEATURE_ICONS);

const COLUMN_CLASSES = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
} as const;

/** Short selling points. Literal content — nothing here binds to platform data. */
export default function FeaturesSection({ section, ctx }: SectionRenderProps<"features">) {
  const { heading, subheading, items, columns } = section.props;
  const f = fieldAttrsFor(ctx.mode, section.id);

  if (items.length === 0 && ctx.mode !== "builder") return null;

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

        {items.length === 0 ? (
          <p className="rounded-[var(--site-radius)] border border-dashed p-8 text-center text-sm opacity-70">
            Add a few highlights — delivery, hours, what makes you different.
          </p>
        ) : (
          <ul className={`grid gap-8 ${COLUMN_CLASSES[columns]}`}>
            {items.map((item, index) => {
              const Icon = item.icon ? FEATURE_ICONS[item.icon] : undefined;
              return (
                <li key={`${item.title}-${index}`}>
                  {Icon && (
                    <Icon
                      className="mb-3 h-6 w-6"
                      style={{ color: "var(--site-brand)" }}
                      aria-hidden="true"
                    />
                  )}
                  <h3 className="text-base font-semibold" {...f(`props.items.${index}.title`)}>
                    {item.title}
                  </h3>
                  {item.description && (
                    <p
                      className="mt-2 text-sm leading-relaxed opacity-70"
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
