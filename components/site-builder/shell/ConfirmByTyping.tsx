"use client";

import { useEffect, useState } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * A confirmation that cannot be dismissed by reflex.
 *
 * An ordinary yes/no dialog is one keystroke from gone, and the keystroke is
 * the same one that dismisses every harmless dialog a merchant sees in a day.
 * Requiring a typed word costs about two seconds and makes the action
 * deliberate — which is the whole point for something that has no undo.
 *
 * **Matching is case-insensitive and trimmed.** The friction is in having to
 * type a word at all, not in getting the shift key right; a merchant who typed
 * `CONFIRM` plainly meant it, and refusing them with no explanation would be
 * the kind of unhelpful strictness that teaches people to distrust a dialog
 * rather than read it.
 *
 * The field is cleared whenever the dialog opens, so a merchant who cancels and
 * comes back cannot land on a pre-armed confirm button.
 */
export default function ConfirmByTyping({
  open,
  onOpenChange,
  title,
  description,
  /** The word to type. Lower case here; matching ignores case either way. */
  confirmWord = "confirm",
  actionLabel,
  cancelLabel = "Cancel",
  pending = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description: React.ReactNode;
  confirmWord?: string;
  actionLabel: string;
  cancelLabel?: string;
  pending?: boolean;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (open) setTyped("");
  }, [open]);

  const matches = typed.trim().toLowerCase() === confirmWord.trim().toLowerCase();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2">
          <label htmlFor="confirm-by-typing" className="block text-sm">
            Type <span className="font-semibold text-foreground">{confirmWord}</span> to continue.
          </label>
          <Input
            id="confirm-by-typing"
            value={typed}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTyped(e.target.value)}
            // A destructive action should never be one stray Enter away, so the
            // key only submits once the word already matches.
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === "Enter" && matches && !pending) {
                e.preventDefault();
                onConfirm();
              }
            }}
            placeholder={confirmWord}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            aria-describedby="confirm-by-typing-hint"
          />
          <p id="confirm-by-typing-hint" className="sr-only">
            The button stays disabled until you type {confirmWord}.
          </p>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          {/*
            A plain Button rather than AlertDialogAction: the action closes the
            dialog on click, which would dismiss it before an async delete has
            reported whether it worked. Closing is the caller's business.
          */}
          <Button variant="destructive" disabled={!matches || pending} onClick={onConfirm}>
            {pending ? "Working…" : actionLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
