"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BrandedQrOptions } from "@/lib/qr/render";

import { BrandedQrPreview } from "./BrandedQrPreview";

export const MARKETING_QR_NAME_MAX_LENGTH = 80;

interface MarketingQrCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branding: Omit<BrandedQrOptions, "value">;
  /**
   * The address a real code will have, built from a placeholder short code of
   * the same length as a minted one. See `PREVIEW_SHORT_CODE` in the manager:
   * QR density follows payload length, so a placeholder of the right length
   * previews the real artwork and one of the wrong length quietly lies.
   */
  previewUrl: string;
  isCreating: boolean;
  /** Resolves true when the code was created, so the dialog knows to close. */
  onCreate: (name: string) => Promise<boolean>;
}

/**
 * Creating a marketing code.
 *
 * Behind a dialog rather than parked in the panel: creating is occasional,
 * while coming back to preview and download is the everyday job, and the list
 * is what deserves the space.
 */
export function MarketingQrCreateDialog({
  open,
  onOpenChange,
  branding,
  previewUrl,
  isCreating,
  onCreate,
}: MarketingQrCreateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Radix unmounts this subtree on close, so the form resets itself
            between openings without an effect watching `open`. */}
        <CreateForm
          branding={branding}
          previewUrl={previewUrl}
          isCreating={isCreating}
          onCreate={onCreate}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

interface CreateFormProps {
  branding: Omit<BrandedQrOptions, "value">;
  previewUrl: string;
  isCreating: boolean;
  onCreate: (name: string) => Promise<boolean>;
  onCancel: () => void;
}

function CreateForm({
  branding,
  previewUrl,
  isCreating,
  onCreate,
  onCancel,
}: CreateFormProps) {
  const [name, setName] = useState("");

  const trimmed = name.trim();

  async function submit() {
    if (!trimmed || isCreating) return;
    if (await onCreate(trimmed)) onCancel();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>New marketing QR code</DialogTitle>
        <DialogDescription>
          This code opens your online store. It is not tied to a table, so it
          works on anything you print.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col items-center gap-2">
        <BrandedQrPreview
          value={previewUrl || null}
          branding={branding}
          sizePx={168}
          label="Preview of the marketing QR code about to be created"
          emptyLabel="Your store needs a public address before a code can be printed."
        />
        <p className="max-w-[220px] text-center text-xs text-muted-foreground">
          Your logo and brand colours. The finished code looks like this.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="marketing-qr-name">Name</Label>
        <Input
          id="marketing-qr-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void submit();
          }}
          placeholder="e.g. Front window decal"
          maxLength={MARKETING_QR_NAME_MAX_LENGTH}
          disabled={isCreating}
          autoFocus
        />
        <p className="text-xs text-muted-foreground">
          How you will recognise this code later. It also names the files you
          download.
        </p>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={isCreating}>
          Cancel
        </Button>
        <Button onClick={() => void submit()} disabled={!trimmed || isCreating}>
          {isCreating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-2 h-4 w-4" />
          )}
          Create code
        </Button>
      </DialogFooter>
    </>
  );
}
