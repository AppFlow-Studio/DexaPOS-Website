"use client";

import { toast } from "sonner";

import type { BuilderStore } from "./store";

/**
 * Deletes a section and offers the way back.
 *
 * Shared by the canvas overlay and the section list so both routes to deletion
 * behave identically. The confirmation dialog that would normally guard this is
 * deliberately absent: a dialog interrupts every deletion to protect against the
 * rare regretted one, while an Undo costs nothing until it is needed. That trade
 * only holds if the Undo is actually offered at the moment of the mistake, which
 * is what this exists to guarantee — relying on the toolbar's undo button means
 * relying on the merchant knowing it applies.
 *
 * The generation guard makes the Undo honest: if the merchant has edited
 * anything since, the button would revert *that* instead, so it declines and
 * says so rather than quietly destroying newer work.
 */
export function deleteSectionWithUndo(store: BuilderStore, id: string): void {
  const deleted = store.getState().removeSection(id);
  if (!deleted) return;

  toast(`${deleted.title} deleted`, {
    action: {
      label: "Undo",
      onClick: () => {
        const restored = store.getState().undoDelete(deleted.generation);
        if (!restored) {
          toast.info("Too late to undo that here — use Ctrl+Z to step back.");
        }
      },
    },
  });
}
