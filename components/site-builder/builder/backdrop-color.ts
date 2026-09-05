import type { ThemeTokens } from "@/lib/site-builder/render-context";
import type { SectionStyle } from "@/lib/site-builder/sections/primitives";

/**
 * The backdrop a section is painted on, as a colour.
 *
 * A local copy of the renderer's mapping rather than an import: the renderer is
 * a server-rendered module tree and the panels that need this are client
 * components. `__tests__/text-tone-guard.test.ts` asserts the two agree — the
 * failure they would otherwise share is a panel promising one colour and a
 * canvas drawing another.
 *
 * One copy, imported by every panel that previews a custom colour, so the
 * agreement only has to be maintained in a single place.
 */
export function backdropColorFor(
  background: NonNullable<SectionStyle["background"]>,
  theme: ThemeTokens,
): string {
  switch (background) {
    case "muted":
      return theme.surfaceMuted;
    case "brand":
      return theme.brand;
    case "dark":
      return theme.surfaceDark;
    default:
      return theme.surface;
  }
}
