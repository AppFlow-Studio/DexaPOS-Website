import { createElement } from "react";

import type { SectionRenderProps } from "@/lib/site-builder/render-context";
import { fieldAttrsFor } from "../edit-attrs";
import {
  Container,
  SectionHeading,
  sectionClassName,
  sectionStyleProps,
} from "../section-shell";

/**
 * Icons render as inline SVG, not through lucide's icon components.
 *
 * This section runs on the server, and its output is *also* serialized as an
 * RSC flight payload by `renderCanvas` — the builder canvas and the new-page
 * template preview both hold a server-rendered tree in client state. Every
 * lucide icon sits behind a shared `"use client"` base module (`Icon.mjs`), so
 * returning one inside that payload makes React ask the *invoking route's*
 * client manifest for a module that route never put in its client bundle. In a
 * production build that lookup fails — "Could not find the module
 * .../lucide-react/dist/esm/Icon.mjs#default in the React Client Manifest" —
 * and the whole canvas render throws. It surfaced on the Showcase template
 * because that is the only starter that carries a `features` section.
 *
 * Plain SVG host elements have no client reference to resolve, so they cross the
 * server-action boundary safely. The geometry below is lucide's own icon data
 * (ISC-licensed), copied so this render owns no runtime dependency on lucide's
 * module graph and cannot regress on a bundler change again.
 *
 * A name is data a merchant can edit; anything unrecognised renders without an
 * icon rather than crashing the section — the same degrade-don't-throw rule the
 * resolver follows for missing records.
 */
type IconNode = ReadonlyArray<readonly [string, Readonly<Record<string, string | number>>]>;

const FEATURE_ICONS: Record<string, IconNode> = {
  Award: [
    [
      "path",
      {
        d: "m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526",
        key: "1yiouv",
      },
    ],
    ["circle", { cx: "12", cy: "8", r: "6", key: "1vp47v" }],
  ],
  Clock: [
    ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
    ["path", { d: "M12 6v6l4 2", key: "mmk7yg" }],
  ],
  CreditCard: [
    ["rect", { width: "20", height: "14", x: "2", y: "5", rx: "2", key: "ynyp8z" }],
    ["line", { x1: "2", x2: "22", y1: "10", y2: "10", key: "1b3vmo" }],
  ],
  Gift: [
    ["path", { d: "M12 7v14", key: "1akyts" }],
    ["path", { d: "M20 11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8", key: "1sqzm4" }],
    [
      "path",
      { d: "M7.5 7a1 1 0 0 1 0-5A4.8 8 0 0 1 12 7a4.8 8 0 0 1 4.5-5 1 1 0 0 1 0 5", key: "kc0143" },
    ],
    ["rect", { x: "3", y: "7", width: "18", height: "4", rx: "1", key: "1hberx" }],
  ],
  Heart: [
    [
      "path",
      {
        d: "M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5",
        key: "mvr1a0",
      },
    ],
  ],
  Leaf: [
    [
      "path",
      { d: "M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z", key: "nnexq3" },
    ],
    ["path", { d: "M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12", key: "mt58a7" }],
  ],
  MapPin: [
    [
      "path",
      {
        d: "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0",
        key: "1r0f0z",
      },
    ],
    ["circle", { cx: "12", cy: "10", r: "3", key: "ilqhr7" }],
  ],
  Sparkles: [
    [
      "path",
      {
        d: "M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z",
        key: "1s2grr",
      },
    ],
    ["path", { d: "M20 2v4", key: "1rf3ol" }],
    ["path", { d: "M22 4h-4", key: "gwowj6" }],
    ["circle", { cx: "4", cy: "20", r: "2", key: "6kqj1y" }],
  ],
  Star: [
    [
      "path",
      {
        d: "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z",
        key: "r04s7s",
      },
    ],
  ],
  Truck: [
    ["path", { d: "M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2", key: "wrbu53" }],
    ["path", { d: "M15 18H9", key: "1lyqi6" }],
    [
      "path",
      {
        d: "M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14",
        key: "lysw3i",
      },
    ],
    ["circle", { cx: "17", cy: "18", r: "2", key: "332jqn" }],
    ["circle", { cx: "7", cy: "18", r: "2", key: "19iecd" }],
  ],
  UtensilsCrossed: [
    [
      "path",
      { d: "m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8", key: "n7qcjb" },
    ],
    [
      "path",
      { d: "M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3c.7.7 2 .7 2.8 0L15 15Zm0 0 7 7", key: "d0u48b" },
    ],
    ["path", { d: "m2.1 21.8 6.4-6.3", key: "yn04lh" }],
    ["path", { d: "m19 5-7 7", key: "194lzd" }],
  ],
  Users: [
    ["path", { d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", key: "1yyitq" }],
    ["path", { d: "M16 3.128a4 4 0 0 1 0 7.744", key: "16gr8j" }],
    ["path", { d: "M22 21v-2a4 4 0 0 0-3-3.87", key: "kshegd" }],
    ["circle", { cx: "9", cy: "7", r: "4", key: "nufk8" }],
  ],
};

export const FEATURE_ICON_NAMES = Object.keys(FEATURE_ICONS);

/**
 * lucide's own SVG frame, reproduced so these read identically to the icons
 * used everywhere else in the product. `color` inherits through `currentColor`.
 */
function FeatureIcon({ node }: { node: IconNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mb-3 h-6 w-6"
      style={{ color: "var(--site-brand)" }}
      aria-hidden="true"
    >
      {node.map(([tag, attrs]) => {
        const { key, ...rest } = attrs;
        return createElement(tag, { key: String(key), ...rest });
      })}
    </svg>
  );
}

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

        {items.length === 0 ? (
          <p className="rounded-[var(--site-radius)] border border-dashed p-8 text-center text-sm opacity-70">
            Add a few highlights — delivery, hours, what makes you different.
          </p>
        ) : (
          <ul className={`grid gap-8 ${COLUMN_CLASSES[columns]}`}>
            {items.map((item, index) => {
              const node = item.icon ? FEATURE_ICONS[item.icon] : undefined;
              return (
                <li key={`${item.title}-${index}`}>
                  {node && <FeatureIcon node={node} />}
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
