"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Arms the scroll-reveal system by putting `reveal-ready` on <html>.
 *
 * The reveal CSS is fail-visible: marketing.css only hides un-revealed
 * `.reveal` elements *under* `.reveal-ready`, so if this never runs the
 * content stays visible rather than stranded at opacity:0.
 *
 * This replaces an inline <script dangerouslySetInnerHTML> that used to sit in
 * the marketing layout's body. React never executes script tags it renders as
 * DOM nodes, so on a client-side navigation into a marketing route the class
 * was never applied — and React warned about it in the console.
 *
 * Keyed on the pathname rather than mounting once: this lives in the marketing
 * layout, which does NOT remount when navigating between pages that share it,
 * so a bare `[]` effect would only ever fire for the first page of a session.
 * Re-asserting per route keeps the class in step with the fresh `.reveal`
 * elements each page brings, and makes it self-healing if anything else on the
 * page clears it.
 *
 * The class is intentionally never removed on unmount: hiding is opt-in via
 * `.reveal-ready`, and tearing it down mid-session would flash already-hidden
 * reveal elements back into view.
 */
export default function RevealBoot() {
  const pathname = usePathname();

  useEffect(() => {
    try {
      document.documentElement.classList.add("reveal-ready");
    } catch {
      // Non-fatal: without the class, reveal content simply stays visible.
    }
  }, [pathname]);

  return null;
}
