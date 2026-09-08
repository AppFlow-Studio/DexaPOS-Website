import { createElement } from "react";

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
 * and the whole canvas render throws.
 *
 * Plain SVG host elements have no client reference to resolve, so they cross the
 * server-action boundary safely. The geometry below is lucide's own icon data
 * (ISC-licensed), copied so this render owns no runtime dependency on lucide's
 * module graph and cannot regress on a bundler change again.
 *
 * The editor may keep using lucide components for the same twenty — it is a
 * client component, and this rule is about what crosses into the flight payload.
 * `features-icons.test.tsx` asserts this file imports no lucide-react.
 */
type IconNode = ReadonlyArray<
  readonly [string, Readonly<Record<string, string | number>>]
>;

/**
 * Keyed by `FeatureIconName`, so the picker and the renderer cannot drift: a
 * name the merchant can choose but this map has not got is a type error.
 */
const FEATURE_ICONS: Record<FeatureIconName, IconNode> = {
  Cake: [
    ["path", { d: "M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8", key: "1w3rig" }],
    [
      "path",
      {
        d: "M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1",
        key: "n2jgmb",
      },
    ],
    ["path", { d: "M2 21h20", key: "1nyx9w" }],
    ["path", { d: "M7 8v3", key: "1qtyvj" }],
    ["path", { d: "M12 8v3", key: "hwp4zt" }],
    ["path", { d: "M17 8v3", key: "1i6e5u" }],
    ["path", { d: "M7 4h.01", key: "1bh4kh" }],
    ["path", { d: "M12 4h.01", key: "1ujb9j" }],
    ["path", { d: "M17 4h.01", key: "1upcoc" }],
  ],
  Car: [
    [
      "path",
      {
        d: "M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2",
        key: "5owen",
      },
    ],
    ["circle", { cx: "7", cy: "17", r: "2", key: "u2ysq9" }],
    ["path", { d: "M9 17h6", key: "r8uit2" }],
    ["circle", { cx: "17", cy: "17", r: "2", key: "axvx0g" }],
  ],
  CreditCard: [
    [
      "rect",
      { width: "20", height: "14", x: "2", y: "5", rx: "2", key: "ynyp8z" },
    ],
    ["line", { x1: "2", x2: "22", y1: "10", y2: "10", key: "1b3vmo" }],
  ],
  ShoppingBag: [
    ["path", { d: "M16 10a4 4 0 0 1-8 0", key: "1ltviw" }],
    ["path", { d: "M3.103 6.034h17.794", key: "awc11p" }],
    [
      "path",
      {
        d: "M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z",
        key: "o988cm",
      },
    ],
  ],
  Mic: [
    ["path", { d: "M12 19v3", key: "npa21l" }],
    ["path", { d: "M19 10v2a7 7 0 0 1-14 0v-2", key: "1vc78b" }],
    [
      "rect",
      { x: "9", y: "2", width: "6", height: "13", rx: "3", key: "s6n7sd" },
    ],
  ],
  Truck: [
    [
      "path",
      {
        d: "M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2",
        key: "wrbu53",
      },
    ],
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
      {
        d: "m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8",
        key: "n7qcjb",
      },
    ],
    [
      "path",
      {
        d: "M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3c.7.7 2 .7 2.8 0L15 15Zm0 0 7 7",
        key: "d0u48b",
      },
    ],
    ["path", { d: "m2.1 21.8 6.4-6.3", key: "yn04lh" }],
    ["path", { d: "m19 5-7 7", key: "194lzd" }],
  ],
  Globe: [
    ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
    [
      "path",
      { d: "M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20", key: "13o1zl" },
    ],
    ["path", { d: "M2 12h20", key: "9i4pu4" }],
  ],
  WheatOff: [
    ["path", { d: "m2 22 10-10", key: "28ilpk" }],
    ["path", { d: "m16 8-1.17 1.17", key: "1qqm82" }],
    [
      "path",
      {
        d: "M3.47 12.53 5 11l1.53 1.53a3.5 3.5 0 0 1 0 4.94L5 19l-1.53-1.53a3.5 3.5 0 0 1 0-4.94Z",
        key: "1rdhi6",
      },
    ],
    [
      "path",
      {
        d: "m8 8-.53.53a3.5 3.5 0 0 0 0 4.94L9 15l1.53-1.53c.55-.55.88-1.25.98-1.97",
        key: "4wz8re",
      },
    ],
    [
      "path",
      {
        d: "M10.91 5.26c.15-.26.34-.51.56-.73L13 3l1.53 1.53a3.5 3.5 0 0 1 .28 4.62",
        key: "rves66",
      },
    ],
    [
      "path",
      { d: "M20 2h2v2a4 4 0 0 1-4 4h-2V6a4 4 0 0 1 4-4Z", key: "19rau1" },
    ],
    [
      "path",
      {
        d: "M11.47 17.47 13 19l-1.53 1.53a3.5 3.5 0 0 1-4.94 0L5 19l1.53-1.53a3.5 3.5 0 0 1 4.94 0Z",
        key: "tc8ph9",
      },
    ],
    [
      "path",
      {
        d: "m16 16-.53.53a3.5 3.5 0 0 1-4.94 0L9 15l1.53-1.53a3.49 3.49 0 0 1 1.97-.98",
        key: "ak46r",
      },
    ],
    [
      "path",
      {
        d: "M18.74 13.09c.26-.15.51-.34.73-.56L21 11l-1.53-1.53a3.5 3.5 0 0 0-4.62-.28",
        key: "1tw520",
      },
    ],
    ["line", { x1: "2", x2: "22", y1: "2", y2: "22", key: "a6p6uj" }],
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
      {
        d: "M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z",
        key: "nnexq3",
      },
    ],
    [
      "path",
      { d: "M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12", key: "mt58a7" },
    ],
  ],
  House: [
    [
      "path",
      { d: "M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8", key: "5wwlr5" },
    ],
    [
      "path",
      {
        d: "M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
        key: "r6nss1",
      },
    ],
  ],
  Phone: [
    [
      "path",
      {
        d: "M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384",
        key: "9njp5v",
      },
    ],
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
  Star: [
    [
      "path",
      {
        d: "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z",
        key: "r04s7s",
      },
    ],
  ],
  BookOpen: [
    ["path", { d: "M12 5v16", key: "1f6ucr" }],
    [
      "path",
      {
        d: "M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z",
        key: "1fyvmf",
      },
    ],
  ],
  Users: [
    ["path", { d: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", key: "1yyitq" }],
    ["path", { d: "M16 3.128a4 4 0 0 1 0 7.744", key: "16gr8j" }],
    ["path", { d: "M22 21v-2a4 4 0 0 0-3-3.87", key: "kshegd" }],
    ["circle", { cx: "9", cy: "7", r: "4", key: "nufk8" }],
  ],
  Clock: [
    ["circle", { cx: "12", cy: "12", r: "10", key: "1mglay" }],
    ["path", { d: "M12 6v6l4 2", key: "mmk7yg" }],
  ],
  Gift: [
    ["path", { d: "M12 7v14", key: "1akyts" }],
    ["path", { d: "M20 11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8", key: "1sqzm4" }],
    [
      "path",
      {
        d: "M7.5 7a1 1 0 0 1 0-5A4.8 8 0 0 1 12 7a4.8 8 0 0 1 4.5-5 1 1 0 0 1 0 5",
        key: "kc0143",
      },
    ],
    [
      "rect",
      { x: "3", y: "7", width: "18", height: "4", rx: "1", key: "1hberx" },
    ],
  ],
  Briefcase: [
    ["path", { d: "M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16", key: "jecpp" }],
    [
      "rect",
      { width: "20", height: "14", x: "2", y: "6", rx: "2", key: "i6l2r4" },
    ],
  ],
};

function FeatureIcon({ node, color }: { node: IconNode; color: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mb-3 size-6"
      style={{ color }}
      aria-hidden="true"
    >
      {node.map(([tag, attrs]) => {
        const { key, ...rest } = attrs;
        return createElement(tag, { key: String(key), ...rest });
      })}
    </svg>
  );
}

/** Short selling points. Literal content — nothing here binds to platform data. */
export default function FeaturesSection({
  section,
  ctx,
}: SectionRenderProps<"features">) {
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
        <SectionHeading
          heading={heading}
          align={align}
          headingAttrs={f("props.heading")}
        />

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
              /*
                The schema types `icon` as a name this map has, but stored JSONB
                is not bound by the type — a document written by an older build,
                or repaired past a failed parse, can still carry a name that was
                dropped. Degrade to no icon rather than throwing on `node.map`
                and taking the whole page down, which is the rule the resolver
                follows for missing records.
              */
              const node = FEATURE_ICONS[item.icon];
              return (
                <li
                  key={`${item.title}-${index}`}
                  className="flex w-40 flex-col items-center text-center"
                >
                  {node && <FeatureIcon node={node} color={iconFill} />}
                  <h3
                    className="text-sm font-semibold"
                    {...f(`props.items.${index}.title`)}
                  >
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
