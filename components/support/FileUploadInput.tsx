"use client";

import React, { useRef, useState, useCallback, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { createPortal } from "react-dom";
import { Paperclip, X, CheckCircle2, AlertCircle, FileText, FileVideo } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AttachmentInput,
  SupportUploadTarget,
} from "@/types/support-ticket";

import {
  SUPPORT_ATTACHMENT_ACCEPTED_LABEL as ACCEPTED_LABEL,
  SUPPORT_ATTACHMENT_MAX_FILES as MAX_FILES,
  SUPPORT_ATTACHMENT_MAX_MB as MAX_SIZE_MB,
  SUPPORT_ATTACHMENT_NON_VIDEO_MAX_MB as NON_VIDEO_MAX_SIZE_MB,
  SUPPORT_ATTACHMENT_MIME_TYPES,
  isSupportVideoMimeType,
  resolveAttachmentContentType as resolveContentType,
} from "@/lib/support/attachment-constraints";

const ALLOWED_TYPES: readonly string[] = SUPPORT_ATTACHMENT_MIME_TYPES;

/**
 * Automatic recovery from a dropped connection mid-transfer.
 *
 * This restarts the transfer; it does not resume from a byte offset. Bunny
 * Storage exposes no resumable protocol — an `OPTIONS` to the storage API
 * allows only GET/DELETE/POST/PUT/DESCRIBE, with no PATCH and no
 * `Tus-Resumable` — so true offset resume would require migrating support
 * video to Bunny Stream. Retrying is what is achievable against the current
 * storage, and it is what removes the user-visible failure: a brief blip no
 * longer costs the reporter their upload or forces them to re-pick the file.
 *
 * Only transport-level failures are retried. An HTTP error status means the
 * server made a decision (rejected type, size, expired token) and repeating
 * the request would fail identically.
 */
const UPLOAD_MAX_ATTEMPTS = 3;
const UPLOAD_RETRY_BASE_DELAY_MS = 1_000;

/** Marks a failure as worth retrying — set only for transport-level errors. */
class RetryableUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryableUploadError";
  }
}

function uploadRetryDelayMs(attempt: number): number {
  // 1s, then 2s. Short enough that a reporter does not think it has hung.
  return UPLOAD_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export interface UploadedFileState {
  id: string;
  file: File;
  preview?: string;
  status: "pending" | "uploading" | "done" | "error";
  errorMessage?: string;
  result?: AttachmentInput;
  /** 0–100, present while status is "uploading". */
  progress?: number;
  /** Distinguishes target/auth setup, byte transfer, and the CDN response wait. */
  uploadStage?: "preparing" | "transferring" | "finishing" | "retrying";
  /** Deterministic Supabase path or CDN URL used for orphan cleanup. */
  cleanupPath?: string;
}

interface FileUploadInputProps {
  onUploadsChange: (attachments: AttachmentInput[]) => void;
  getUploadUrl: (
    fileName: string,
    fileId: string,
    sessionId: string,
    contentType: string,
  ) => Promise<{ target?: SupportUploadTarget; error?: string }>;
  sessionId: string;
  /**
   * Deletes an already-uploaded object from storage when the user cancels or
   * removes a file, so a discarded upload leaves no orphan in the bucket.
   * Optional: callers that haven't wired a cleanup action still get correct
   * abort behaviour, just without server-side deletion.
   */
  onDiscardUpload?: (filePath: string) => Promise<unknown>;
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
  onDiscardUpload,
  disabled,
  className,
  onUploadStateChange,
  variant = "dropzone",
  chipsContainer,
}: FileUploadInputProps) {
  const { getToken } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  // In-flight uploads, keyed by file id, so cancel can abort the actual request.
  const xhrRefs = useRef<Map<string, XMLHttpRequest>>(new Map());
  const preparationRefs = useRef<Map<string, AbortController>>(new Map());
  const activeUploadIds = useRef<Set<string>>(new Set());
  const cancelledUploadIds = useRef<Set<string>>(new Set());
  const cleanupPaths = useRef<Map<string, string>>(new Map());
  const discardUploadRef = useRef(onDiscardUpload);
  const isMountedRef = useRef(true);
  const [files, setFiles] = useState<UploadedFileState[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    discardUploadRef.current = onDiscardUpload;
  }, [onDiscardUpload]);

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
      activeUploadIds.current.add(id);
      const contentType = resolveContentType(file);
      let uploadTargetResult: {
        target?: SupportUploadTarget;
        error?: string;
      };
      try {
        uploadTargetResult = await getUploadUrl(
          file.name,
          id,
          sessionId,
          contentType,
        );
      } catch (error) {
        activeUploadIds.current.delete(id);
        if (isMountedRef.current && !cancelledUploadIds.current.has(id)) {
          setFiles((prev) =>
            prev.map((item) =>
              item.id === id
                ? {
                    ...item,
                    status: "error" as const,
                    errorMessage:
                      error instanceof Error
                        ? error.message
                        : "Failed to prepare upload",
                  }
                : item,
            ),
          );
        }
        return;
      }
      const { target, error } = uploadTargetResult;

      if (error || !target) {
        activeUploadIds.current.delete(id);
        if (isMountedRef.current && !cancelledUploadIds.current.has(id)) {
          setFiles((prev) =>
            prev.map((f) =>
              f.id === id
                ? { ...f, status: "error" as const, errorMessage: error || "Upload failed" }
                : f
            )
          );
        }
        return;
      }

      cleanupPaths.current.set(id, target.file_path);
      if (!isMountedRef.current || cancelledUploadIds.current.has(id)) {
        activeUploadIds.current.delete(id);
        cleanupPaths.current.delete(id);
        void discardUploadRef.current?.(target.file_path);
        return;
      }

      setFiles((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, cleanupPath: target.file_path } : item,
        ),
      );

      let cdnUploadToken: string | null = null;
      if (target.provider === "cdn") {
        // Use a fresh session only for a small, body-free authorization request.
        // Sending its one-minute JWT with video bytes lets it expire in transit.
        //
        // Ask for the `supabase` JWT template first, matching the kiosk CDN
        // uploaders. A bare `getToken()` can hand back a session ticket that is
        // not a JWT at all, which `cdn-upload` rejects at Clerk verification
        // with "Invalid JWT form" — surfacing to the user as a generic
        // "Could not authorize the video upload".
        //
        // `leewayInSeconds: 0` is load-bearing. Clerk session tokens live 60s,
        // and the default leeway lets a cached token be handed out with only a
        // few seconds remaining — `skipCache` alone does not prevent this. A
        // token that expires between the prepare call and Clerk's verification
        // fails the upload before the function ever runs. Zero leeway forces a
        // genuinely fresh 60s token for the authorization round-trip.
        const tokenOptions = { skipCache: true, leewayInSeconds: 0 } as const;
        const sessionToken =
          (await getToken({ template: "supabase", ...tokenOptions }).catch(
            () => null,
          )) || (await getToken(tokenOptions).catch(() => null));
        // Cancellation or unmount can happen while Clerk resolves the token.
        if (!isMountedRef.current || cancelledUploadIds.current.has(id)) {
          activeUploadIds.current.delete(id);
          cleanupPaths.current.delete(id);
          return;
        }
        if (!sessionToken || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
          activeUploadIds.current.delete(id);
          setFiles((prev) =>
            prev.map((item) =>
              item.id === id
                ? {
                    ...item,
                    status: "error" as const,
                    errorMessage: "CDN upload is not configured",
                  }
                : item,
            ),
          );
          return;
        }

        const preparation = new AbortController();
        preparationRefs.current.set(id, preparation);
        const deadline = setTimeout(() => preparation.abort(new DOMException(
          "Upload authorization timed out. Please retry.", "TimeoutError",
        )), 20_000);
        try {
          const response = await fetch(target.upload_url, {
            method: "GET",
            headers: {
              ...target.headers,
              Authorization: `Bearer ${sessionToken}`,
              apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
            },
            cache: "no-store",
            signal: preparation.signal,
          });
          const payload = await response.json() as {
            success?: boolean; uploadToken?: string; error?: string;
          };
          if (!response.ok || !payload.success || !payload.uploadToken) {
            throw new Error(response.status === 401
              ? "Your session expired. Refresh the page and try again."
              : payload.error || "Could not authorize the video upload. Please retry.");
          }
          cdnUploadToken = payload.uploadToken;
        } catch (error) {
          activeUploadIds.current.delete(id);
          cleanupPaths.current.delete(id);
          if (isMountedRef.current && !cancelledUploadIds.current.has(id)) {
            setFiles((prev) => prev.map((item) => item.id === id ? {
              ...item, status: "error" as const,
              errorMessage: error instanceof Error ? error.message : "Could not authorize the video upload.",
            } : item));
          }
          return;
        } finally {
          clearTimeout(deadline);
          preparationRefs.current.delete(id);
        }
        if (!isMountedRef.current || cancelledUploadIds.current.has(id)) {
          activeUploadIds.current.delete(id);
          cleanupPaths.current.delete(id);
          return;
        }
      }

      // XMLHttpRequest rather than fetch: fetch cannot report upload progress,
      // and a 100 MB upload showing only a spinner is indistinguishable from a
      // frozen UI. xhr.abort() also gives us a real cancel.
      const attemptTransfer = () =>
        new Promise<string>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhrRefs.current.set(id, xhr);

          setFiles((prev) =>
            prev.map((item) =>
              item.id === id
                ? {
                    ...item,
                    progress: 0,
                    uploadStage: "transferring" as const,
                  }
                : item,
            ),
          );

          xhr.open(target.method, target.upload_url, true);
          xhr.setRequestHeader("Content-Type", contentType);
          for (const [header, value] of Object.entries(target.headers ?? {})) {
            xhr.setRequestHeader(header, value);
          }
          if (target.provider === "cdn") {
            xhr.setRequestHeader("x-cdn-upload-token", cdnUploadToken!);
            xhr.setRequestHeader(
              "apikey",
              process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
            );
          }

          xhr.upload.onprogress = (event) => {
            if (!event.lengthComputable) return;
            const pct = Math.round((event.loaded / event.total) * 100);
            setFiles((prev) =>
              prev.map((f) => (f.id === id ? { ...f, progress: pct } : f))
            );
          };
          xhr.upload.onload = () => {
            // The request body has left the browser. The Edge Function may still
            // be waiting for Bunny to finish the streamed PUT and return JSON.
            setFiles((prev) =>
              prev.map((item) =>
                item.id === id
                  ? {
                      ...item,
                      progress: 100,
                      uploadStage: "finishing" as const,
                    }
                  : item,
              ),
            );
          };

          xhr.onload = () => {
            if (xhr.status < 200 || xhr.status >= 300) {
              let message = `Upload failed (${xhr.status})`;
              if (target.provider === "cdn") {
                try {
                  const payload = JSON.parse(xhr.responseText) as {
                    error?: string;
                  };
                  if (payload.error) message = payload.error;
                } catch {
                  // Keep the status-based message when the response is not JSON.
                }
              }
              reject(new Error(message));
              return;
            }

            if (target.provider === "cdn") {
              try {
                const payload = JSON.parse(xhr.responseText) as {
                  success?: boolean;
                  cdnUrl?: string;
                };
                if (!payload.success || payload.cdnUrl !== target.file_path) {
                  reject(new Error("CDN returned an unexpected attachment URL"));
                  return;
                }
              } catch (error) {
                reject(
                  error instanceof Error
                    ? error
                    : new Error("Invalid CDN upload response"),
                );
                return;
              }
            }

            resolve(target.file_path);
          };
          // Fires when the browser cannot read the response at all, rather than
          // for an ordinary error status — `onload` handles those and reports
          // the real code. The usual cause is a gateway-generated failure
          // (e.g. a 502 raised before the function boots), which carries no
          // CORS headers, so the browser blocks it and hands us no detail.
          // Say what the user can actually do; the precise status is only ever
          // visible in the cdn-upload logs.
          // Transport-level failure: the browser could not read a response at
          // all (connection dropped, or a gateway error with no CORS headers).
          // Worth retrying — unlike an HTTP error status, which is a decision
          // the server already made and would repeat.
          xhr.onerror = () => reject(new RetryableUploadError(
            "The upload was interrupted before it completed.",
          ));
          xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));

          xhr.send(file);
        });

      try {
        let uploadedPath: string | undefined;
        for (let attempt = 1; attempt <= UPLOAD_MAX_ATTEMPTS; attempt++) {
          try {
            uploadedPath = await attemptTransfer();
            break;
          } catch (attemptError) {
            const canRetry =
              attemptError instanceof RetryableUploadError &&
              attempt < UPLOAD_MAX_ATTEMPTS;
            if (!canRetry) throw attemptError;

            // A cancel or unmount during the backoff must not start another
            // transfer.
            if (!isMountedRef.current || cancelledUploadIds.current.has(id)) {
              throw new DOMException("Aborted", "AbortError");
            }

            // Tell the reporter this is recovering rather than stalled — a
            // silent pause on a large upload looks identical to a freeze.
            setFiles((prev) =>
              prev.map((item) =>
                item.id === id
                  ? { ...item, uploadStage: "retrying" as const, progress: 0 }
                  : item,
              ),
            );

            await new Promise((settle) =>
              setTimeout(settle, uploadRetryDelayMs(attempt)),
            );

            if (!isMountedRef.current || cancelledUploadIds.current.has(id)) {
              throw new DOMException("Aborted", "AbortError");
            }
          }
        }

        if (uploadedPath === undefined) {
          throw new Error("The upload did not complete. Please retry.");
        }

        const result: AttachmentInput = {
          file_name: file.name,
          file_path: uploadedPath,
          file_size: file.size,
          file_type: contentType,
        };

        setFiles((prev) =>
          prev.map((f) =>
            f.id === id
              ? { ...f, status: "done" as const, result, progress: 100 }
              : f
          )
        );
      } catch (err) {
        // A cancelled upload is removed outright by removeFile — don't flip it
        // to an error state and leave a stale chip behind.
        if (err instanceof DOMException && err.name === "AbortError") return;
        cleanupPaths.current.delete(id);
        void discardUploadRef.current?.(target.file_path);
        if (isMountedRef.current && !cancelledUploadIds.current.has(id)) {
          setFiles((prev) =>
            prev.map((f) =>
              f.id === id
                ? {
                    ...f,
                    status: "error" as const,
                    errorMessage:
                      err instanceof Error ? err.message : "Upload failed",
                  }
                : f
            )
          );
        }
      } finally {
        xhrRefs.current.delete(id);
        activeUploadIds.current.delete(id);
      }
    },
    [getToken, getUploadUrl, sessionId]
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

        // Validate against the resolved type, not file.type — an iOS .mov
        // reporting application/octet-stream is a supported video, and rejecting
        // it here would defeat the extension fallback.
        const contentType = resolveContentType(file);

        if (!ALLOWED_TYPES.includes(contentType)) {
          return {
            id,
            file,
            preview,
            status: "error" as const,
            errorMessage: `Unsupported file type. Accepted: ${ACCEPTED_LABEL}.`,
          };
        }
        const maxSizeMb = isSupportVideoMimeType(contentType)
          ? MAX_SIZE_MB
          : NON_VIDEO_MAX_SIZE_MB;
        if (file.size > maxSizeMb * 1024 * 1024) {
          return {
            id,
            file,
            preview,
            status: "error" as const,
            errorMessage: `${formatSize(file.size)} exceeds the ${maxSizeMb}MB limit.`,
          };
        }

        return {
          id,
          file,
          preview,
          status: "uploading" as const,
          uploadStage: "preparing" as const,
        };
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
      cancelledUploadIds.current.add(id);
      preparationRefs.current.get(id)?.abort();

      // Abort an in-flight upload so cancel actually stops the transfer rather
      // than just hiding the chip while bytes keep going.
      const inFlight = xhrRefs.current.get(id);
      if (inFlight) {
        inFlight.abort();
        xhrRefs.current.delete(id);
      }

      // A cancelled or completed-but-discarded upload can leave an object in the
      // bucket with no attachment row pointing at it. Clean it up. The row itself
      // is only written after the message is sent, so there is nothing to delete
      // on that side.
      if (removed?.result?.file_path || removed?.cleanupPath || inFlight) {
        const path =
          removed?.result?.file_path ??
          removed?.cleanupPath ??
          cleanupPaths.current.get(id);
        if (path) void discardUploadRef.current?.(path);
      }
      cleanupPaths.current.delete(id);

      if (removed?.preview) URL.revokeObjectURL(removed.preview);
      setFiles((prev) => prev.filter((file) => file.id !== id));
    },
    [files]
  );

  // Abort and clean up anything still in flight if the composer unmounts. An
  // upload target can resolve after unmount, so the mounted flag above also
  // prevents that late result from starting a now-orphaned transfer.
  useEffect(() => {
    // Strict Mode replays setup -> cleanup -> setup in development. Restore
    // this flag on every setup or all subsequent uploads silently stop after
    // their target resolves, leaving the visible chip stuck on Preparing.
    isMountedRef.current = true;
    const activeIds = activeUploadIds.current;
    const cancelledIds = cancelledUploadIds.current;
    const requests = xhrRefs.current;
    const preparations = preparationRefs.current;
    const paths = cleanupPaths.current;
    return () => {
      isMountedRef.current = false;
      activeIds.forEach((id) => {
        cancelledIds.add(id);
        requests.get(id)?.abort();
        preparations.get(id)?.abort();
        const path = paths.get(id);
        if (path) void discardUploadRef.current?.(path);
      });
      requests.clear();
      preparations.clear();
    };
  }, []);

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
            <p className="text-[11px] text-center text-muted-foreground/80">
              Images/PDF up to {NON_VIDEO_MAX_SIZE_MB} MB; video up to{" "}
              {MAX_SIZE_MB} MB ({MAX_FILES} files max)
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
  const {
    id,
    file,
    preview,
    status,
    errorMessage,
    progress,
    uploadStage,
  } = fileState;
  const resolvedType = resolveContentType(file);
  const isImage = resolvedType.startsWith("image/");
  const isVideo = resolvedType.startsWith("video/");
  const isUploading = status === "uploading";

  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-2xl border-0 px-2.5 py-1.5 text-xs max-w-[220px]",
        // A rejected file is routine input validation, not an alarm — the
        // message already says what is wrong. Keep the neutral chip and let the
        // icon plus the explanatory line carry the state.
        "bg-muted/60 text-muted-foreground"
      )}
      title={errorMessage}
    >
      <div className="flex items-center gap-1.5">
        {isImage && preview ? (
          <img src={preview} alt={file.name} className="h-5 w-5 rounded object-cover shrink-0" />
        ) : isVideo ? (
          <FileVideo className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <FileText className="h-3.5 w-3.5 shrink-0" />
        )}

        <span className="truncate max-w-[100px]">{file.name}</span>

        {isUploading && (
          <span className="shrink-0 tabular-nums">
            {uploadStage === "preparing"
              ? "Preparing…"
              : uploadStage === "retrying"
                ? "Reconnecting…"
                : uploadStage === "finishing"
                  ? "Finishing…"
                  : `${progress ?? 0}%`}
          </span>
        )}
        {status === "done" && <CheckCircle2 className="h-3 w-3 shrink-0" />}
        {status === "error" && <AlertCircle className="h-3 w-3 shrink-0" />}

        {!disabled && (
          <button
            type="button"
            onClick={() => onRemove(id)}
            className="shrink-0 hover:text-foreground ml-0.5"
            title={isUploading ? "Cancel upload" : "Remove file"}
            aria-label={isUploading ? "Cancel upload" : "Remove file"}
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {isUploading && (
        <div
          className="h-1 w-full overflow-hidden rounded-full bg-muted-foreground/20"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full bg-muted-foreground/70 transition-[width] duration-150"
            style={{ width: `${progress ?? 0}%` }}
          />
        </div>
      )}

      {status === "error" && errorMessage && (
        <span className="leading-tight">{errorMessage}</span>
      )}
    </div>
  );
}
