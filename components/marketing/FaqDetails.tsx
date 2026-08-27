"use client";

import { useRef, useState } from "react";

/**
 * A <details> FAQ row that animates BOTH ways.
 *
 * Native <details> applies `content-visibility: hidden` to its content the
 * instant `open` flips to false, so the closing transition never gets to run —
 * and on the next open the content is already laid out, so the opening
 * transition is skipped too. That is why only the very first open animated.
 *
 * Fix: take control of the `open` attribute.
 *  - Opening: set open immediately, then let CSS animate 0fr -> 1fr.
 *  - Closing: keep open=true, animate 1fr -> 0fr, and only remove `open` once
 *    the transition has finished (or a timeout fires, so a dropped
 *    transitionend can never leave a row stuck open).
 */
export default function FaqDetails({
  question,
  answerHtml,
  questionAttrs,
  answerAttrs,
}: {
  question: string;
  answerHtml?: string;
  questionAttrs?: Record<string, string>;
  answerAttrs?: Record<string, string>;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);

  const prefersReduced = () =>
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const toggle = (e: React.MouseEvent) => {
    // Drive the state ourselves so closing can be deferred until the animation
    // ends; without this the browser hides the content immediately.
    e.preventDefault();
    const details = detailsRef.current;
    const panel = panelRef.current;
    if (!details) return;

    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }

    if (!open) {
      details.open = true;
      setOpen(true);
      return;
    }

    // Closing.
    if (!panel || prefersReduced()) {
      details.open = false;
      setOpen(false);
      return;
    }

    setOpen(false); // drops the .is-open class -> CSS animates back to 0fr
    const done = () => {
      if (detailsRef.current) detailsRef.current.open = false;
      panel.removeEventListener("transitionend", onEnd);
      timer.current = null;
    };
    const onEnd = (ev: TransitionEvent) => {
      if (ev.propertyName !== "grid-template-rows") return;
      done();
    };
    panel.addEventListener("transitionend", onEnd);
    // Failsafe: never leave the row stuck open if transitionend doesn't arrive.
    timer.current = setTimeout(done, 600);
  };

  return (
    <details ref={detailsRef} className={`faq-item${open ? " is-open" : ""}`}>
      <summary onClick={toggle} {...questionAttrs}>
        {question}
      </summary>
      {answerHtml && (
        <div className="faq-answer" ref={panelRef}>
          <div
            className="faq-answer-inner"
            {...answerAttrs}
            dangerouslySetInnerHTML={{ __html: answerHtml }}
          />
        </div>
      )}
    </details>
  );
}
