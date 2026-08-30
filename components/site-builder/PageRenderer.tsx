import type { ResolvedMap } from "@/lib/site-builder/bindings/resolved";
import { googleFontsHref } from "@/lib/site-builder/fonts";
import type { PageDocument } from "@/lib/site-builder/page-document";
import type { RenderContext, SectionRenderProps } from "@/lib/site-builder/render-context";
import { themeToCssVars } from "@/lib/site-builder/render-context";
import SectionBoundary from "./SectionBoundary";
import { getSectionRenderer } from "./registry";

/**
 * Renders a page document.
 *
 * A **server component**, and so is every section it dispatches to. Interactivity
 * is added by importing client islands *into* sections, never by making a
 * section a client component. That discipline is what makes the public site and
 * the builder canvas the same render rather than two implementations that drift
 * (ANALYSIS blocker B7, finding F6).
 *
 * Sections receive pre-resolved data and perform no I/O, so the number of
 * queries a page costs is decided before this component runs.
 */
export default function PageRenderer({
  doc,
  resolved,
  ctx,
}: {
  doc: PageDocument;
  resolved: ResolvedMap;
  ctx: RenderContext;
}) {
  return (
    <>
      {doc.sections.map((section) => {
        // Hidden sections are stored but not published. The builder still shows
        // them, dimmed, so the merchant can find and restore them.
        if (section.hidden && ctx.mode !== "builder") return null;

        const Renderer = getSectionRenderer(section.kind);
        // A kind this build does not know: skip silently rather than throw.
        // `normalizePage` drops these on read, so reaching here means a document
        // bypassed normalization — still not a reason to 500 a live page.
        if (!Renderer) return null;

        return (
          <SectionBoundary key={section.id} section={section} mode={ctx.mode}>
            <Renderer {...({ section, resolved, ctx } as SectionRenderProps)} />
          </SectionBoundary>
        );
      })}
    </>
  );
}

/**
 * The page shell: theme tokens as CSS custom properties, plus the prose styles
 * merchant rich text depends on.
 *
 * Tokens live here and nowhere else, so changing a brand colour restyles every
 * page without re-rendering or re-publishing any of them.
 */
export function SiteChrome({
  ctx,
  children,
  className = "",
}: {
  ctx: RenderContext;
  children: React.ReactNode;
  className?: string;
}) {
  // Only the one or two families this theme actually uses. Loading the whole
  // catalogue here would put ~16 font requests on every public restaurant page.
  const fontsHref = googleFontsHref([ctx.theme.fontFamily, ctx.theme.headingFont]);

  return (
    <div
      style={{
        ...themeToCssVars(ctx.theme),
        background: "var(--site-surface)",
        color: "var(--site-text)",
        fontFamily: "var(--site-font)",
      }}
      className={`site-shell min-h-screen w-full ${className}`}
      data-sb-site={ctx.site.siteId}
      data-sb-mode={ctx.mode}
    >
      {/* React hoists this into <head>; `precedence` is what makes it do so. */}
      {fontsHref && <link rel="stylesheet" href={fontsHref} precedence="site-fonts" />}
      <style>{SHELL_STYLES}</style>
      {children}
    </div>
  );
}

/**
 * Applies the headline typeface to every heading a section can emit.
 *
 * Done once here rather than per section: sections render plain `h1`–`h6` and
 * inherit the body font from the shell, so one scoped rule gives the whole site
 * a second typeface without touching a single renderer.
 */
const HEADING_STYLES = `
.site-shell { overflow-wrap: anywhere; }
.site-shell h1, .site-shell h2, .site-shell h3,
.site-shell h4, .site-shell h5, .site-shell h6,
.site-shell .site-prose h2, .site-shell .site-prose h3, .site-shell .site-prose h4 {
  font-family: var(--site-heading-font, var(--site-font));
}
`;

/**
 * Styling for sanitized merchant HTML.
 *
 * Scoped to `.site-prose` and deliberately narrow — it covers exactly the tags
 * `lib/cms/sanitize.ts` allows through, so there is nothing to style that a
 * merchant cannot actually produce.
 */
const PROSE_STYLES = `
.site-prose > * + * { margin-top: 0.85em; }
.site-prose h2 { font-size: 1.4em; font-weight: 600; letter-spacing: -0.01em; }
.site-prose h3 { font-size: 1.15em; font-weight: 600; }
.site-prose h4 { font-size: 1em; font-weight: 600; }
.site-prose ul, .site-prose ol { padding-left: 1.4em; }
.site-prose ul { list-style: disc; }
.site-prose ol { list-style: decimal; }
.site-prose li + li { margin-top: 0.35em; }
.site-prose a { color: var(--site-brand); text-decoration: underline; text-underline-offset: 2px; }
.site-prose blockquote { border-left: 3px solid var(--site-border); padding-left: 1em; opacity: 0.8; }
.site-prose code { font-family: ui-monospace, monospace; font-size: 0.9em; }
.site-prose img { max-width: 100%; height: auto; border-radius: var(--site-radius); }
.site-prose strong { font-weight: 600; }
`;

/**
 * The FAQ accordion's open/close animation.
 *
 * `<details>` is not animatable by default: its content is simply not rendered
 * until it is open, so there is nothing to transition from. `::details-content`
 * gives that hidden box a handle, and `interpolate-size: allow-keywords` is what
 * lets `block-size` animate to `auto` — the height nobody can know in advance
 * and the reason accordions are usually written in JavaScript with a
 * `scrollHeight` measurement.
 *
 * Doing it here keeps every section renderer a server component, which the whole
 * same-document canvas depends on. A browser without `::details-content` gets
 * the instant open it always had: the section works, it simply does not glide.
 *
 * Emitted once per page from the shell rather than per section, like the prose
 * and heading rules above it.
 */
const FAQ_STYLES = `
.site-faq { interpolate-size: allow-keywords; }
.site-faq summary::-webkit-details-marker { display: none; }
.site-faq-item::details-content {
  block-size: 0;
  overflow: clip;
  opacity: 0;
  transition:
    block-size 280ms ease,
    opacity 220ms ease,
    content-visibility 280ms allow-discrete;
}
.site-faq-item[open]::details-content { block-size: auto; opacity: 1; }
@media (prefers-reduced-motion: reduce) {
  .site-faq-item::details-content { transition: none; }
  .site-faq-item summary > span:last-child { transition: none; }
}
`;

const SHELL_STYLES = `${HEADING_STYLES}${PROSE_STYLES}${FAQ_STYLES}`;
