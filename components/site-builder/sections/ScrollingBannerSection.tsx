import type { SectionRenderProps } from "@/lib/site-builder/render-context";

const SPEEDS = { slow: "45s", normal: "30s", fast: "18s" } as const;

const TONES = {
  brand: { background: "var(--site-brand)", color: "var(--site-brand-contrast)" },
  dark: { background: "var(--site-surface-dark)", color: "var(--site-text-on-dark)" },
  muted: { background: "var(--site-surface-muted)", color: "var(--site-text)" },
} as const;

/**
 * A marquee of short messages.
 *
 * **Motion is opt-out at the operating-system level, not ours.** The animation
 * is defined inside a `prefers-reduced-motion: no-preference` block, so a
 * visitor who has asked their device for less movement gets a static, wrapped
 * row instead — and gets it by default rather than after we remember to check.
 * Vestibular disorders are common enough that a restaurant's homepage is a bad
 * place to find out.
 *
 * The list is rendered twice, the second copy `aria-hidden`, which is what makes
 * the loop continuous without giving a screen reader everything twice.
 *
 * ---
 *
 * **What makes the loop seamless is one invariant: a single copy must be at
 * least as wide as the strip.**
 *
 * Both copies translate by -100% of their own width, so at the end of a cycle
 * copy B sits exactly where copy A began and the reset is invisible. But at that
 * moment B is the *only* thing covering the strip — A has left the screen. If a
 * copy is narrower than the viewport, the tail of the strip has nothing in it,
 * and the merchant sees bare background sweep past before the messages come
 * round again. Three short messages on a wide monitor is the common case, so
 * this was the common case.
 *
 * `min-width: 100%` guarantees the invariant for any content at any width, which
 * duplicating the list a fixed number of times cannot: no amount of copies is
 * enough for one short message on a wide screen, and knowing how many to render
 * would mean measuring text in the browser. This section renders on the server
 * and must keep doing so — the builder canvas re-renders through
 * `renderToStaticMarkup`, and one client component anywhere in the tree breaks
 * it (see `FaqAccordion`).
 *
 * **Spacing lives on the items, not on the track.** With `gap` on the flex row,
 * the distance between the last message of one copy and the first of the next is
 * whatever the join happens to leave — nothing puts a gap *between* two sibling
 * copies. Padding on each `<li>` travels with the message, so every interval is
 * the same one, including across the seam. `space-around` then spreads whatever
 * width is left over evenly, half at each end of a copy, which is exactly what
 * makes the two half-measures at the join add up to one full measure.
 */
export default function ScrollingBannerSection({
  section,
}: SectionRenderProps<"scrolling-banner">) {
  const { items, speed, tone } = section.props;
  if (items.length === 0) return null;

  const track = (clone: boolean) => (
    <ul
      key={clone ? "clone" : "track"}
      className={`sb-marquee-track${clone ? " sb-marquee-clone" : ""}`}
      {...(clone ? { "aria-hidden": true } : {})}
    >
      {items.map((item, index) => (
        <li key={index} className="whitespace-nowrap px-5 text-sm font-medium tracking-wide">
          {item.text}
        </li>
      ))}
    </ul>
  );

  const css = [
    // Layout is declared here rather than in utility classes because the two
    // display values below have to win against them deterministically.
    ".sb-marquee { display: flex; }",
    ".sb-marquee-track {",
    "  display: flex;",
    "  align-items: center;",
    "  flex-shrink: 0;",
    // Never narrower than the strip. The whole loop rests on this.
    "  min-width: 100%;",
    // Still: wrapped and centred, which is what a reduced-motion visitor gets.
    "  flex-wrap: wrap;",
    "  justify-content: center;",
    "}",
    ".sb-marquee-clone { display: none; }",
    "@media (prefers-reduced-motion: no-preference) {",
    "  .sb-marquee-track {",
    "    flex-wrap: nowrap;",
    // Half a measure at each end of a copy, so the two halves meeting at the
    // join add up to the same interval as any other.
    "    justify-content: space-around;",
    "    animation: sb-marquee-scroll " + SPEEDS[speed] + " linear infinite;",
    "  }",
    "  .sb-marquee-clone { display: flex; }",
    "}",
    "@keyframes sb-marquee-scroll {",
    "  from { transform: translateX(0); }",
    "  to { transform: translateX(-100%); }",
    "}",
  ].join("\n");

  return (
    <section className="w-full overflow-hidden py-3" style={TONES[tone]}>
      <style>{css}</style>

      <div className="sb-marquee">
        {track(false)}
        {track(true)}
      </div>
    </section>
  );
}
