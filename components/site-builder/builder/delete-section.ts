"use client";

import { toast } from "sonner";

import type { BuilderStore } from "./store";

/**
 * Deletes a section and offers the way back.
 *
 * The confirmation dialog that would normally guard this is deliberately
 * absent: a dialog interrupts every deletion to protect against the rare
 * regretted one, while an Undo costs nothing until it is needed.
 *
 * **This toast is now the only way back.** The rebuild removed the undo button
 * and `Ctrl+Z` along with the rest of the toolbar, which makes offering the
 * Undo at the moment of the mistake not merely the better trade but the whole
 * of it — deleting a section a merchant spent ten minutes on would otherwise be
 * one click and irreversible. It costs no chrome, because it does not exist
 * until something destructive has happened.
 *
 * The generation guard keeps it honest: if the merchant has edited anything
 * since, undoing would revert *that* instead, so it declines and says so rather
 * than quietly destroying newer work.
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
          toast.info("Too late to undo — you have made other changes since.");
        }
      },
    },
  });
}
