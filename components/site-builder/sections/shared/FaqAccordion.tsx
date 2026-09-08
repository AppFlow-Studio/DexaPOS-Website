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
 * **Each question is its own card.** It used to be a flat list divided by
 * hairlines, which made an open question and its answer read as one continuous
 * column of text — a merchant looking at their own page could not see where one
 * question ended and the next began. Separate bordered cards on the page's card
 * colour give every question an edge, a hover state and somewhere for the open
 * state to show itself.
 *
 * **The open/close is animated in CSS, not in JavaScript.** `::details-content`
 * plus `interpolate-size: allow-keywords` transitions a `<details>` from zero to
 * its natural height without measuring anything — see `FAQ_STYLES` in
 * `PageRenderer`. Browsers without it get the instant open they have always had,
 * which is why this stays a server component. That matters well beyond this
 * section: the canvas re-renders through `renderToStaticMarkup`, and Next
 * refuses `react-dom/server` in any module graph reaching a client component, so
 * one `"use client"` renderer would break the whole same-document canvas
 * (PLAN-06 §2.3). Prefer a CSS answer wherever one exists.
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
    <div className="site-faq mx-auto grid w-full max-w-3xl gap-3 text-left">
      {items.map((item, index) => (
        <details
          key={`${item.question}-${index}`}
          open={defaultOpenFirst && index === 0}
          className="site-faq-item group overflow-hidden rounded-[var(--site-radius)] border transition-shadow hover:shadow-sm open:shadow-sm"
          style={{ borderColor: "var(--site-border)", background: "var(--site-card)" }}
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-base font-medium">
            {/*
              The marker sits on this inner span rather than on the `<summary>`.
              The canvas patches a marked field by writing `textContent`, and it
              refuses any node that has element children — with the marker on the
              summary, every keystroke in a question fell back to a full server
              render because of the chevron sitting beside it.
            */}
            <span className="min-w-0" {...fieldAttrs?.(index, "question")}>
              {item.question}
            </span>
            <span
              aria-hidden="true"
              className="flex size-7 shrink-0 items-center justify-center rounded-full transition-transform duration-300 group-open:rotate-180"
              style={{ background: "var(--site-surface-muted)" }}
            >
              {/* A chevron, not a `+`. A rotated plus reads as a close button —
                  which is exactly what it looked like on an open question. */}
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </span>
          </summary>

          <div
            className="site-prose border-t px-5 pb-5 pt-4 text-sm leading-relaxed opacity-75"
            style={{ borderColor: "var(--site-border)" }}
            {...fieldAttrs?.(index, "answer")}
            dangerouslySetInnerHTML={{ __html: item.answerHtml }}
          />
        </details>
      ))}
    </div>
  );
}
