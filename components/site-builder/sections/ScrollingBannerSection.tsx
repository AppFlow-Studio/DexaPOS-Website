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
 * the loop seamless without giving a screen reader everything twice.
 *
 * This is also the section that replaces Announcements. Owner shipped a
 * site-wide announcement system, ran it, and is retiring it — creation removed,
 * not merely disabled. This is the part that earned its keep, without a separate
 * screen or a banner that fights the per-page publish model.
 */
export default function ScrollingBannerSection({
  section,
}: SectionRenderProps<"scrolling-banner">) {
  const { items, speed, tone } = section.props;
  if (items.length === 0) return null;

  const track = (
    <ul className="sb-marquee-track flex shrink-0 items-center gap-10 px-5">
      {items.map((item, index) => (
        <li key={index} className="whitespace-nowrap text-sm font-medium tracking-wide">
          {item.text}
        </li>
      ))}
    </ul>
  );

  const css = [
    ".sb-marquee { display: flex; flex-wrap: wrap; justify-content: center; }",
    ".sb-marquee-clone { display: none; }",
    "@media (prefers-reduced-motion: no-preference) {",
    "  .sb-marquee { flex-wrap: nowrap; }",
    "  .sb-marquee-clone { display: flex; }",
    "  .sb-marquee-track { animation: sb-marquee-scroll " + SPEEDS[speed] + " linear infinite; }",
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
        {track}
        <div className="sb-marquee-clone" aria-hidden>
          {track}
        </div>
      </div>
    </section>
  );
}
