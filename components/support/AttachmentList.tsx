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
  const pdfs = attachments.filter((a) => a.file_type === "application/pdf");

  return (
    <>
      <div className="mt-2 flex flex-wrap gap-2">
        {/* Image thumbnails */}
        {images.map((att) => (
          <button
            key={att.id}
            type="button"
            onClick={() => {
              setLightboxId(att.id);
              setLightboxName(att.file_name);
            }}
            className="group relative rounded-md overflow-hidden border border-border/50 hover:border-primary/40 transition-colors"
            title={att.file_name}
          >
            <img
              src={attachmentUrl(att.id)}
              alt={att.file_name}
              className="h-20 w-20 object-cover"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
          </button>
        ))}

        {/* PDF file cards */}
        {pdfs.map((att) => (
          <div
            key={att.id}
            className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-3 py-2 text-xs"
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
