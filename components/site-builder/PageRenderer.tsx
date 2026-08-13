import type { ResolvedMap } from "@/lib/site-builder/bindings/resolved";
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
  return (
    <div
      style={{
        ...themeToCssVars(ctx.theme),
        background: "var(--site-surface)",
        color: "var(--site-text)",
        fontFamily: "var(--site-font)",
      }}
      className={`min-h-screen w-full ${className}`}
      data-sb-site={ctx.site.siteId}
      data-sb-mode={ctx.mode}
    >
      <style>{PROSE_STYLES}</style>
      {children}
    </div>
  );
}

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
