"use client";

import React, { useRef, useState, useCallback } from "react";
import { Paperclip, X, Loader2, CheckCircle2, AlertCircle, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AttachmentInput } from "@/types/support-ticket";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
const MAX_SIZE_MB = 5;
const MAX_FILES = 3;

export interface UploadedFileState {
  id: string;
  file: File;
  preview?: string;       // object URL for images
  status: "pending" | "uploading" | "done" | "error";
  errorMessage?: string;
  result?: AttachmentInput; // available once status === "done"
}

interface FileUploadInputProps {
  /** Called with the full list of successfully uploaded attachment inputs */
  onUploadsChange: (attachments: AttachmentInput[]) => void;
  /** Server action that returns a signed upload URL and the final storage path */
  getUploadUrl: (
    fileName: string,
    fileId: string,
    sessionId: string
  ) => Promise<{ signedUrl?: string; path?: string; error?: string }>;
  /** Stable session ID so all files in one form submission share a folder */
  sessionId: string;
  disabled?: boolean;
  className?: string;
}

export default function FileUploadInput({
  onUploadsChange,
  getUploadUrl,
  sessionId,
  disabled,
  className,
}: FileUploadInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<UploadedFileState[]>([]);

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

      // Get signed upload URL from server action
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

      // PUT directly to Supabase Storage via the signed URL
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

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = Array.from(e.target.files || []);
      e.target.value = ""; // reset so same file can be re-selected

      const remaining = MAX_FILES - files.length;
      const toAdd = selected.slice(0, remaining);

      const newStates: UploadedFileState[] = toAdd.map((file) => {
        const id = crypto.randomUUID();
        const preview = file.type.startsWith("image/")
          ? URL.createObjectURL(file)
          : undefined;

        // Validate
        if (!ALLOWED_TYPES.includes(file.type)) {
          return { id, file, preview, status: "error", errorMessage: "Only images and PDFs allowed" };
        }
        if (file.size > MAX_SIZE_MB * 1024 * 1024) {
          return { id, file, preview, status: "error", errorMessage: `Max ${MAX_SIZE_MB}MB per file` };
        }

        return { id, file, preview, status: "uploading" };
      });

      setFiles((prev) => [...prev, ...newStates]);

      // Start uploads for valid files
      for (const f of newStates) {
        if (f.status === "uploading") {
          uploadFile(f);
        }
      }
    },
    [files.length, uploadFile]
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
      {/* File list */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f) => (
            <FileChip key={f.id} fileState={f} onRemove={removeFile} disabled={disabled} />
          ))}
        </div>
      )}

      {/* Add button */}
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
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground gap-1.5 px-2"
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
          >
            <Paperclip className="h-3.5 w-3.5" />
            {files.length === 0 ? "Attach files" : "Add more"}
            <span className="text-muted-foreground/60">
              ({files.length}/{MAX_FILES})
            </span>
          </Button>
        </>
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
        (status === "uploading" || status === "pending") && "border-border bg-muted/50 text-muted-foreground"
      )}
      title={errorMessage}
    >
      {/* Thumbnail for images, icon for PDFs */}
      {isImage && preview ? (
        <img
          src={preview}
          alt={file.name}
          className="h-5 w-5 rounded object-cover shrink-0"
        />
      ) : (
        <FileText className="h-3.5 w-3.5 shrink-0" />
      )}

      <span className="truncate max-w-[100px]">{file.name}</span>

      {/* Status indicator */}
      {status === "uploading" && (
        <Loader2 className="h-3 w-3 animate-spin shrink-0" />
      )}
      {status === "done" && (
        <CheckCircle2 className="h-3 w-3 shrink-0 text-green-600" />
      )}
      {status === "error" && (
        <AlertCircle className="h-3 w-3 shrink-0" />
      )}

      {/* Remove button */}
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
