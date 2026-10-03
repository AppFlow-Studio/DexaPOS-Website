"use client";

import { useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

type CmsImage = { name: string; url: string };

/** Uploads one image to the CMS bucket and returns its public URL. */
export async function uploadCmsImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/cms/upload", { method: "POST", body: formData });
  const data: { url?: string; error?: string } = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) throw new Error(data.error || "Upload failed");
  return data.url;
}

/**
 * A hidden file input plus the function that opens it. Uploads the chosen
 * image and hands its URL to `onUploaded`; failures surface as a toast.
 */
export function useCmsImageUpload(onUploaded: (url: string) => void) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      className="hidden"
      tabIndex={-1}
      aria-hidden
      onChange={async (event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;
        setUploading(true);
        try {
          onUploaded(await uploadCmsImage(file));
        } catch (err) {
          toast.error("Image upload failed", {
            description: err instanceof Error ? err.message : undefined,
          });
        } finally {
          setUploading(false);
        }
      }}
    />
  );

  return { input, uploading, openPicker: () => inputRef.current?.click() };
}

/**
 * The CMS image library: previously uploaded images, pick one or upload a new
 * one. A centred dialog (UI-DESIGN-SYSTEM §12) that clips while its body
 * scrolls; full screen on phones via the `DialogContent` default (§13.1).
 */
export function ImageLibraryDialog({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (url: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-h-[85vh] sm:max-w-3xl">
        {/* Mounted only while open, so every opening refetches the library. */}
        <ImageLibraryContents
          onChoose={(url) => {
            onSelect(url);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

type LibraryState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; images: CmsImage[] };

function ImageLibraryContents({ onChoose }: { onChoose: (url: string) => void }) {
  const [state, setState] = useState<LibraryState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const { input, uploading, openPicker } = useCmsImageUpload(onChoose);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/cms/images", { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Failed to load images");
        return Array.isArray(data.images) ? (data.images as CmsImage[]) : [];
      })
      .then((images) => {
        if (!cancelled) setState({ status: "ready", images });
      })
      .catch((err) => {
        if (!cancelled) {
          setState({ status: "error", message: err instanceof Error ? err.message : "Failed to load images" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = () => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  };

  const loading = state.status === "loading";
  const error = state.status === "error" ? state.message : "";
  const images = state.status === "ready" ? state.images : [];

  return (
    <>
      <DialogHeader className="px-6 pt-6 pr-14 pb-4 text-left">
        <DialogTitle>Image library</DialogTitle>
        <DialogDescription>
          {loading || error
            ? "Previously uploaded images"
            : `${images.length} ${images.length === 1 ? "image" : "images"} uploaded`}
        </DialogDescription>
      </DialogHeader>

      <div className="thin-scrollbar min-h-0 overflow-y-auto px-6 pb-4">
        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square w-full rounded-2xl" />
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl bg-muted/30 px-4 py-16 text-center">
            <p className="text-sm font-medium">We hit a snag loading the image library</p>
            <p className="text-xs text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" onClick={retry}>
              Retry
            </Button>
          </div>
        ) : images.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-muted/30 px-4 py-16 text-center">
            <p className="text-sm font-medium">No images uploaded yet</p>
            <p className="text-xs text-muted-foreground">
              Upload one and it will be kept here for every page.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {images.map((image) => (
              <button
                key={image.name}
                type="button"
                title={image.name}
                onClick={() => onChoose(image.url)}
                className="min-w-0 overflow-hidden rounded-2xl bg-muted/45 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary CMS bucket URLs */}
                <img src={image.url} alt={image.name} className="aspect-square w-full object-cover" />
                <span className="block truncate px-3 py-2 text-xs text-muted-foreground">{image.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <DialogFooter className="px-6 pt-2 pb-6 sm:justify-center">
        {input}
        <Button onClick={openPicker} disabled={uploading}>
          <Upload className="h-4 w-4" aria-hidden />
          {uploading ? "Uploading…" : "Upload new image"}
        </Button>
      </DialogFooter>
    </>
  );
}
