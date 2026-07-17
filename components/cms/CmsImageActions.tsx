"use client";

import { useEffect, useRef, useState } from "react";

type CmsImage = { name: string; url: string; created_at?: string };

type CmsImageActionsProps = {
  onSelect: (url: string) => void | Promise<void>;
  className?: string;
  uploadLabel?: string;
  libraryLabel?: string;
};

export default function CmsImageActions({
  onSelect,
  className = "",
  uploadLabel = "Upload image",
  libraryLabel = "Image library",
}: CmsImageActionsProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [images, setImages] = useState<CmsImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const loadImages = async () => {
    setOpen(true);
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/cms/images", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Failed to load images");
      setImages(Array.isArray(data.images) ? data.images : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load images");
    } finally {
      setLoading(false);
    }
  };

  const upload = async (file: File) => {
    setUploading(true);
    setError("");
    const formData = new FormData();
    formData.append("file", file);
    try {
      const response = await fetch("/api/cms/upload", { method: "POST", body: formData });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.url) throw new Error(data.error || "Upload failed");
      await onSelect(data.url);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed: network error");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className={`cms-image-actions ${className}`.trim()}>
      <input
        ref={inputRef}
        className="cms-image-file-input"
        type="file"
        accept="image/*"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}>
        {uploading ? "Uploading..." : uploadLabel}
      </button>
      <button type="button" onClick={() => void loadImages()}>{libraryLabel}</button>
      {error && !open && <span className="cms-image-error" role="alert">{error}</span>}

      {open && (
        <div className="cms-image-library-backdrop" onMouseDown={() => setOpen(false)}>
          <div
            className="cms-image-library"
            role="dialog"
            aria-modal="true"
            aria-label="Previously uploaded images"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="cms-image-library-head">
              <div><strong>Image library</strong><span>Previously uploaded images</span></div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close image library">Close</button>
            </div>
            <div className="cms-image-library-body">
              {loading && <p className="cms-image-library-message">Loading images...</p>}
              {error && <p className="cms-image-library-message is-error" role="alert">{error}</p>}
              {!loading && !error && images.length === 0 && <p className="cms-image-library-message">No images have been uploaded yet.</p>}
              {!loading && images.length > 0 && (
                <div className="cms-image-library-grid">
                  {images.map((image) => (
                    <button
                      key={image.name}
                      type="button"
                      title={image.name}
                      onClick={() => { void onSelect(image.url); setOpen(false); }}
                    >
                      <img src={image.url} alt={image.name} />
                      <span>{image.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="cms-image-library-foot">
              <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}>
                {uploading ? "Uploading..." : "Upload a new image"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
