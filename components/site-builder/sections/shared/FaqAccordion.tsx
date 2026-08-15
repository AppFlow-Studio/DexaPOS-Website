/**
 * The FAQ accordion.
 *
 * A **server component** with zero JavaScript: `<details>`/`<summary>` is
 * natively expandable and accessible, so there is no state to hold and no
 * handler to attach. It was written as a `"use client"` island out of habit and
 * demoted once it became clear it needed nothing from the client.
 *
 * ---
 *
 * **Why this matters beyond one section.** The builder canvas re-renders through
 * `renderToStaticMarkup` in a route handler, and Next refuses `react-dom/server`
 * in any module graph that reaches a client component. So the whole
 * same-document canvas depends on **every section renderer staying server-only**.
 *
 * The first section that genuinely needs client JavaScript — a gallery lightbox,
 * a carousel, a reservation form — breaks that render route. When that happens
 * the fix is not to fight it: move the canvas to an iframe pointed at a real
 * route (PLAN-06 §2.3, which recommended an iframe for other reasons anyway).
 * Nothing above `Canvas.tsx` changes.
 *
 * Prefer a CSS/native-HTML solution over an island wherever one exists — that is
 * both better for the public page and what keeps the canvas simple.
 */

export default function FaqAccordion({
  items,
  defaultOpenFirst,
  fieldAttrs,
}: {
  items: { question: string; answerHtml: string }[];
  defaultOpenFirst: boolean;
  /** Builder edit attributes, computed server-side and passed through inert. */
  fieldAttrs?: (index: number, field: "question" | "answer") => Record<string, string | undefined>;
}) {
  return (
    <div className="divide-y" style={{ borderColor: "var(--site-border)" }}>
      {items.map((item, index) => (
        <details
          key={`${item.question}-${index}`}
          open={defaultOpenFirst && index === 0}
          className="group py-4"
        >
          <summary
            className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium"
            {...fieldAttrs?.(index, "question")}
          >
            <span>{item.question}</span>
            <span
              aria-hidden="true"
              className="shrink-0 text-xl leading-none opacity-50 transition-transform group-open:rotate-45"
            >
              +
            </span>
          </summary>
          <div
            className="site-prose mt-3 text-sm leading-relaxed opacity-75"
            {...fieldAttrs?.(index, "answer")}
            dangerouslySetInnerHTML={{ __html: item.answerHtml }}
          />
        </details>
      ))}
    </div>
  );
}
