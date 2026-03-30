"use client";

import React, { useState } from "react";
import { FileText, Download, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SupportTicketAttachmentWithUrl } from "@/types/support-ticket";

interface AttachmentListProps {
  attachments: SupportTicketAttachmentWithUrl[];
}

export default function AttachmentList({ attachments }: AttachmentListProps) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
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
              if (att.signed_url) {
                setLightboxUrl(att.signed_url);
                setLightboxName(att.file_name);
              }
            }}
            className="group relative rounded-md overflow-hidden border border-border/50 hover:border-primary/40 transition-colors"
            title={att.file_name}
          >
            {att.signed_url ? (
              <img
                src={att.signed_url}
                alt={att.file_name}
                className="h-20 w-20 object-cover"
              />
            ) : (
              <div className="h-20 w-20 bg-muted flex items-center justify-center">
                <FileText className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
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
            <span className="max-w-[120px] truncate text-foreground" title={att.file_name}>
              {att.file_name}
            </span>
            <span className="text-muted-foreground shrink-0">
              {formatBytes(att.file_size)}
            </span>
            {att.signed_url && (
              <a
                href={att.signed_url}
                download={att.file_name}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                title="Download"
              >
                <Download className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        ))}
      </div>

      {/* Lightbox for images */}
      <Dialog
        open={!!lightboxUrl}
        onOpenChange={(open) => { if (!open) setLightboxUrl(null); }}
      >
        <DialogContent className="max-w-3xl p-2 bg-black/90 border-none">
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 z-10 text-white hover:bg-white/10"
              onClick={() => setLightboxUrl(null)}
            >
              <X className="h-4 w-4" />
            </Button>
            {lightboxUrl && (
              <img
                src={lightboxUrl}
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
