"use client";

import React, { useRef, useState, useCallback, useEffect } from "react";
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
}

export default function FileUploadInput({
  onUploadsChange,
  getUploadUrl,
  sessionId,
  disabled,
  className,
  onUploadStateChange,
}: FileUploadInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<UploadedFileState[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    onUploadStateChange?.(files.some((file) => file.status === "uploading"));
  }, [files, onUploadStateChange]);

  const notifyParent = useCallback(
    (updated: UploadedFileState[]) => {
      const done = updated
        .filter((f) => f.status === "done" && f.result)
        .map((f) => f.result!);
      onUploadsChange(done);
    },
    [onUploadsChange]
  );

  const uploadFile = useCallback(
    async (fileState: UploadedFileState) => {
      const { file, id } = fileState;
      const { signedUrl, path, error } = await getUploadUrl(file.name, id, sessionId);

      if (error || !signedUrl || !path) {
        setFiles((prev) => {
          const next = prev.map((f) =>
            f.id === id
              ? { ...f, status: "error" as const, errorMessage: error || "Upload failed" }
              : f
          );
          notifyParent(next);
          return next;
        });
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

        setFiles((prev) => {
          const next = prev.map((f) =>
            f.id === id ? { ...f, status: "done" as const, result } : f
          );
          notifyParent(next);
          return next;
        });
      } catch {
        setFiles((prev) => {
          const next = prev.map((f) =>
            f.id === id
              ? { ...f, status: "error" as const, errorMessage: "Upload failed" }
              : f
          );
          notifyParent(next);
          return next;
        });
      }
    },
    [getUploadUrl, sessionId, notifyParent]
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
      setFiles((prev) => {
        const removed = prev.find((f) => f.id === id);
        if (removed?.preview) URL.revokeObjectURL(removed.preview);
        const next = prev.filter((f) => f.id !== id);
        notifyParent(next);
        return next;
      });
    },
    [notifyParent]
  );

  const canAddMore = files.length < MAX_FILES;

  return (
    <div className={cn("space-y-2", className)}>
      {/* Drop zone */}
      {canAddMore && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept={ALLOWED_TYPES.join(",")}
            multiple
            className="hidden"
            onChange={handleFileChange}
            disabled={disabled}
          />
          <div
            onClick={() => !disabled && inputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              "border-2 border-dashed rounded-lg px-4 py-3 flex flex-col items-center gap-1.5 transition-colors select-none",
              isDragging
                ? "border-indigo-400 bg-indigo-50 cursor-copy"
                : "border-border bg-muted/20 hover:border-muted-foreground/40 hover:bg-muted/40 cursor-pointer",
              disabled && "opacity-50 cursor-not-allowed pointer-events-none"
            )}
          >
            <Paperclip
              className={cn(
                "h-4 w-4 transition-colors",
                isDragging ? "text-indigo-500" : "text-muted-foreground"
              )}
            />
            <p className={cn("text-xs text-center", isDragging ? "text-indigo-600" : "text-muted-foreground")}>
              Drag files here or click to browse ({files.length}/{MAX_FILES} used)
            </p>
          </div>
        </>
      )}

      {/* File chips */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f) => (
            <FileChip key={f.id} fileState={f} onRemove={removeFile} disabled={disabled} />
          ))}
        </div>
      )}
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
        "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs max-w-[180px]",
        status === "error" && "border-destructive/50 bg-destructive/5 text-destructive",
        status === "done" && "border-green-200 bg-green-50 text-green-800",
        (status === "uploading" || status === "pending") &&
          "border-border bg-muted/50 text-muted-foreground"
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
      {status === "done" && <CheckCircle2 className="h-3 w-3 shrink-0 text-green-600" />}
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
