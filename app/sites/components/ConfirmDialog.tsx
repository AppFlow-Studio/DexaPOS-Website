"use client";

import * as Dialog from "@radix-ui/react-dialog";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Style the confirm button as destructive (red) instead of the brand CTA color. Default false. */
  destructive?: boolean;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          data-slot="dialog-overlay"
          className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-[2px]"
          onClick={(e) => e.stopPropagation()}
        />
        <Dialog.Content
          data-slot="dialog-content"
          className="fixed left-1/2 top-1/2 z-[91] w-full max-w-xs -translate-x-1/2 -translate-y-1/2 p-5 shadow-xl"
          style={{
            backgroundColor: "var(--card, #ffffff)",
            borderRadius: "var(--radius, 16px)",
            fontFamily: "var(--font)",
          }}
          onClick={(e) => e.stopPropagation()}
          onPointerDownOutside={(e) => e.stopPropagation()}
          onInteractOutside={(e) => e.stopPropagation()}
          onEscapeKeyDown={(e) => e.stopPropagation()}
        >
          <Dialog.Title
            className="text-base font-semibold"
            style={{ color: "var(--text, #111827)" }}
          >
            {title}
          </Dialog.Title>
          {description && (
            <Dialog.Description
              className="mt-1.5 text-sm"
              style={{ color: "var(--text-secondary, #6b7280)" }}
            >
              {description}
            </Dialog.Description>
          )}

          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex-1 py-2.5 text-sm font-medium rounded-xl transition-colors"
              style={{
                backgroundColor: "var(--card)",
                border: "1px solid var(--border)",
                color: "var(--text)",
              }}
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={() => {
                onConfirm();
                onOpenChange(false);
              }}
              className="flex-1 py-2.5 text-sm font-semibold rounded-xl transition-opacity hover:opacity-90"
              style={{
                backgroundColor: destructive ? "#ef4444" : "var(--primary)",
                color: destructive ? "#ffffff" : "var(--primary-text, #ffffff)",
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
