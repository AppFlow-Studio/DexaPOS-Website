"use client";

import React, { useRef, useState, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { Paperclip, X, Loader2, CheckCircle2, AlertCircle, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { AttachmentInput } from "@/types/support-ticket";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
const MAX_SIZE_MB = 5;
const MAX_FILES = 3;

export interface UploadedFileState {
  id: string;
  file: File;
  preview?: string;
  status: "pending" | "uploading" | "done" | "error";
  errorMessage?: string;
  result?: AttachmentInput;
}

interface FileUploadInputProps {
  onUploadsChange: (attachments: AttachmentInput[]) => void;
  getUploadUrl: (
    fileName: string,
    fileId: string,
    sessionId: string
  ) => Promise<{ signedUrl?: string; path?: string; error?: string }>;
  sessionId: string;
  disabled?: boolean;
  className?: string;
  onUploadStateChange?: (isUploading: boolean) => void;
  /**
   * `dropzone` (default) is the full dashed drag-and-drop area used by the new
   * ticket form. `compact` is a single paperclip button for the chat composer,
   * where a full-width dropzone would dominate the reply row.
   */
  variant?: "dropzone" | "compact";
  /**
   * Renders the selected-file chips into this element instead of inline, so the
   * chat composer can show them above the thread while the picker sits by the
   * send button. Chips stay inline when omitted.
   */
  chipsContainer?: HTMLElement | null;
}

export default function FileUploadInput({
  onUploadsChange,
  getUploadUrl,
  sessionId,
  disabled,
  className,
  onUploadStateChange,
  variant = "dropzone",
  chipsContainer,
}: FileUploadInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<UploadedFileState[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    onUploadStateChange?.(files.some((file) => file.status === "uploading"));
  }, [files, onUploadStateChange]);

  useEffect(() => {
    const completedAttachments = files
      .filter((file) => file.status === "done" && file.result)
      .map((file) => file.result!);

    onUploadsChange(completedAttachments);
  }, [files, onUploadsChange]);

  const uploadFile = useCallback(
    async (fileState: UploadedFileState) => {
      const { file, id } = fileState;
      const { signedUrl, path, error } = await getUploadUrl(file.name, id, sessionId);

      if (error || !signedUrl || !path) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === id
              ? { ...f, status: "error" as const, errorMessage: error || "Upload failed" }
              : f
          )
        );
        return;
      }

      try {
        const res = await fetch(signedUrl, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type },
        });

        if (!res.ok) throw new Error("Upload failed");

        const result: AttachmentInput = {
          file_name: file.name,
          file_path: path,
          file_size: file.size,
          file_type: file.type,
        };

        setFiles((prev) =>
          prev.map((f) =>
            f.id === id ? { ...f, status: "done" as const, result } : f
          )
        );
      } catch {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === id
              ? { ...f, status: "error" as const, errorMessage: "Upload failed" }
              : f
          )
        );
      }
    },
    [getUploadUrl, sessionId]
  );

  const processFiles = useCallback(
    async (selected: File[], currentCount: number) => {
      const remaining = MAX_FILES - currentCount;
      const toAdd = selected.slice(0, remaining);

      const newStates: UploadedFileState[] = toAdd.map((file) => {
        const id = crypto.randomUUID();
        const preview = file.type.startsWith("image/")
          ? URL.createObjectURL(file)
          : undefined;

        if (!ALLOWED_TYPES.includes(file.type)) {
          return { id, file, preview, status: "error" as const, errorMessage: "Only images and PDFs allowed" };
        }
        if (file.size > MAX_SIZE_MB * 1024 * 1024) {
          return { id, file, preview, status: "error" as const, errorMessage: `Max ${MAX_SIZE_MB}MB per file` };
        }

        return { id, file, preview, status: "uploading" as const };
      });

      setFiles((prev) => [...prev, ...newStates]);

      for (const f of newStates) {
        if (f.status === "uploading") {
          uploadFile(f);
        }
      }
    },
    [uploadFile]
  );

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = Array.from(e.target.files || []);
      e.target.value = "";
      await processFiles(selected, files.length);
    },
    [files.length, processFiles]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!disabled && files.length < MAX_FILES) {
        setIsDragging(true);
      }
    },
    [disabled, files.length]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (disabled || files.length >= MAX_FILES) return;
      const dropped = Array.from(e.dataTransfer.files);
      await processFiles(dropped, files.length);
    },
    [disabled, files.length, processFiles]
  );

  const removeFile = useCallback(
    (id: string) => {
      const removed = files.find((file) => file.id === id);
      if (removed?.preview) URL.revokeObjectURL(removed.preview);
      setFiles((prev) => prev.filter((file) => file.id !== id));
    },
    [files]
  );

  const canAddMore = files.length < MAX_FILES;

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept={ALLOWED_TYPES.join(",")}
      multiple
      className="hidden"
      onChange={handleFileChange}
      disabled={disabled}
    />
  );

  const chips = files.length > 0 && (
    <div className="flex flex-wrap gap-2">
      {files.map((f) => (
        <FileChip key={f.id} fileState={f} onRemove={removeFile} disabled={disabled} />
      ))}
    </div>
  );

  if (variant === "compact") {
    return (
      <>
        {chipsContainer && chips
          ? createPortal(chips, chipsContainer)
          : null}

        <div className={cn("shrink-0", className)}>
          {fileInput}
          <button
            type="button"
            onClick={() => !disabled && canAddMore && inputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            disabled={disabled || !canAddMore}
            title={
              canAddMore
                ? `Attach a file (${files.length}/${MAX_FILES} used)`
                : `Attachment limit reached (${MAX_FILES})`
            }
            className={cn(
              "inline-flex size-9 shrink-0 items-center justify-center rounded-full border-0 bg-muted/60 text-muted-foreground shadow-none transition-colors hover:bg-muted hover:text-foreground",
              isDragging && "bg-muted text-foreground",
              (disabled || !canAddMore) && "opacity-40 cursor-not-allowed"
            )}
          >
            <Paperclip className="h-4 w-4" />
          </button>
        </div>

        {!chipsContainer && chips ? (
          <div className="w-full">{chips}</div>
        ) : null}
      </>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {/* Drop zone */}
      {canAddMore && (
        <>
          {fileInput}
          <div
            onClick={() => !disabled && inputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              "border-2 border-dashed rounded-2xl px-4 py-3 flex flex-col items-center gap-1.5 transition-colors select-none",
              isDragging
                ? "border-muted-foreground/60 bg-muted/60 cursor-copy"
                : "border-border bg-muted/20 hover:border-muted-foreground/40 hover:bg-muted/40 cursor-pointer",
              disabled && "opacity-50 cursor-not-allowed pointer-events-none"
            )}
          >
            <Paperclip className="h-4 w-4 text-muted-foreground transition-colors" />
            <p className="text-xs text-center text-muted-foreground">
              Drag files here or click to browse ({files.length}/{MAX_FILES} used)
            </p>
          </div>
        </>
      )}

      {/* File chips */}
      {chips}
    </div>
  );
}

function FileChip({
  fileState,
  onRemove,
  disabled,
}: {
  fileState: UploadedFileState;
  onRemove: (id: string) => void;
  disabled?: boolean;
}) {
  const { id, file, preview, status, errorMessage } = fileState;
  const isImage = file.type.startsWith("image/");

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-full border-0 px-2.5 py-1 text-xs max-w-[180px]",
        status === "error"
          ? "bg-destructive/10 text-destructive"
          : "bg-muted/60 text-muted-foreground"
      )}
      title={errorMessage}
    >
      {isImage && preview ? (
        <img src={preview} alt={file.name} className="h-5 w-5 rounded object-cover shrink-0" />
      ) : (
        <FileText className="h-3.5 w-3.5 shrink-0" />
      )}

      <span className="truncate max-w-[100px]">{file.name}</span>

      {status === "uploading" && <Loader2 className="h-3 w-3 animate-spin shrink-0" />}
      {status === "done" && <CheckCircle2 className="h-3 w-3 shrink-0" />}
      {status === "error" && <AlertCircle className="h-3 w-3 shrink-0" />}

      {!disabled && (
        <button
          type="button"
          onClick={() => onRemove(id)}
          className="shrink-0 hover:text-foreground ml-0.5"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
