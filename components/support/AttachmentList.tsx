"use client";

import React, { useState } from "react";
import { FileText, Download, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SupportTicketAttachmentWithUrl } from "@/types/support-ticket";

interface AttachmentListProps {
  attachments: SupportTicketAttachmentWithUrl[];
}

/**
 * Returns the audited proxy URL for an attachment. Every request hits
 * `/api/support/attachments/[id]` which authorizes + audit-logs access before
 * streaming bytes. Use `?download=1` to force a save dialog instead of inline
 * rendering.
 */
function attachmentUrl(id: string, opts: { download?: boolean } = {}) {
  return `/api/support/attachments/${id}${opts.download ? "?download=1" : ""}`;
}

export default function AttachmentList({ attachments }: AttachmentListProps) {
  const [lightboxId, setLightboxId] = useState<string | null>(null);
  const [lightboxName, setLightboxName] = useState<string>("");

  if (!attachments || attachments.length === 0) return null;

  const images = attachments.filter((a) => a.file_type.startsWith("image/"));
  const videos = attachments.filter((a) => a.file_type.startsWith("video/"));
  const pdfs = attachments.filter((a) => a.file_type === "application/pdf");

  return (
    <>
      {/* `items-start` keeps a short image tile aligned to the top of a row it
          shares with a taller card, rather than centring it against one. */}
      <div className="mt-2 flex flex-wrap items-start gap-2">
        {/* Image thumbnails */}
        {images.map((att) => (
          <button
            key={att.id}
            type="button"
            onClick={() => {
              setLightboxId(att.id);
              setLightboxName(att.file_name);
            }}
            className="group relative overflow-hidden rounded-lg bg-background ring-1 ring-black/[0.07] transition-shadow hover:shadow-md dark:bg-background/60 dark:ring-white/10"
            title={att.file_name}
          >
            {/* `object-contain` on an opaque tile, not `object-cover`: logos and
                screenshots are often not square, and cropping them to a square
                cut the subject out. The tile also gives non-square images a
                neutral ground instead of letting the message bubble show
                through behind them. */}
            <img
              src={attachmentUrl(att.id)}
              alt={att.file_name}
              className="h-20 w-20 object-contain p-1.5"
            />
            <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/5" />
          </button>
        ))}

        {/* Inline video players. `preload="metadata"` fetches only the header
            for duration/dimensions; seeking then pulls ranges on demand, which
            the attachment proxy serves as 206 responses. */}
        {videos.map((att) => (
          <div
            key={att.id}
            className="flex w-full max-w-sm flex-col overflow-hidden rounded-lg bg-background ring-1 ring-black/[0.07] dark:bg-background/60 dark:ring-white/10"
          >
            {/* No rounding on the player itself — the card clips it, so the
                video meets the card edge instead of leaving a seam of card
                colour around a second rounded rectangle. */}
            <video
              src={attachmentUrl(att.id)}
              controls
              preload="metadata"
              playsInline
              className="w-full bg-black"
            />
            <div className="flex items-center gap-2 px-2.5 py-1.5 text-xs">
              <span
                className="truncate text-foreground"
                title={att.file_name}
              >
                {att.file_name}
              </span>
              <span className="ml-auto shrink-0 text-muted-foreground">
                {formatBytes(att.file_size)}
              </span>
              <a
                href={attachmentUrl(att.id, { download: true })}
                download={att.file_name}
                className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                title="Download"
              >
                <Download className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        ))}

        {/* PDF file cards */}
        {pdfs.map((att) => (
          <div
            key={att.id}
            className="flex items-center gap-2 rounded-lg bg-background px-3 py-2 text-xs ring-1 ring-black/[0.07] dark:bg-background/60 dark:ring-white/10"
          >
            <FileText className="h-4 w-4 text-red-500 shrink-0" />
            <a
              href={attachmentUrl(att.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="max-w-[120px] truncate text-foreground hover:underline"
              title={att.file_name}
            >
              {att.file_name}
            </a>
            <span className="text-muted-foreground shrink-0">
              {formatBytes(att.file_size)}
            </span>
            <a
              href={attachmentUrl(att.id, { download: true })}
              download={att.file_name}
              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
              title="Download"
            >
              <Download className="h-3.5 w-3.5" />
            </a>
          </div>
        ))}
      </div>

      {/* Lightbox for images */}
      <Dialog
        open={!!lightboxId}
        onOpenChange={(open) => {
          if (!open) setLightboxId(null);
        }}
      >
        <DialogContent className="max-w-3xl p-2 bg-black/90 border-none">
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 z-10 text-white hover:bg-white/10"
              onClick={() => setLightboxId(null)}
            >
              <X className="h-4 w-4" />
            </Button>
            {lightboxId && (
              <img
                src={attachmentUrl(lightboxId)}
                alt={lightboxName}
                className="max-h-[80vh] w-full object-contain rounded"
              />
            )}
            <p className="text-center text-xs text-white/60 mt-2 pb-1 truncate px-8">
              {lightboxName}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
