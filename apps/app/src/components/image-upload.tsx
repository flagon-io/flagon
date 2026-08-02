"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@flagon/design";
import type { UploadTicket } from "@/lib/uploads-api";

/**
 * Generic image uploader (org logo, project icon, ...). Presigned direct-to-
 * bucket: pick a file, PUT the bytes straight to the store, confirm, persist.
 * The three steps are passed in so each consumer wires its own purpose + persist:
 *   onStart  — presign for this purpose
 *   onFinish — confirm + save the URL wherever it belongs, returns { url }
 *   onRemove — clear it
 * Rendered present-but-DISABLED when uploads aren't configured, and read-only for
 * non-managers, so a deployment with no storage secrets degrades gracefully.
 */
export function ImageUpload({
  currentUrl,
  canManage,
  uploadsEnabled,
  maxSizeBytes,
  acceptedTypes,
  fallback,
  uploadLabel = "Upload image",
  onStart,
  onFinish,
  onRemove,
}: {
  currentUrl: string | null;
  canManage: boolean;
  uploadsEnabled: boolean;
  maxSizeBytes: number;
  acceptedTypes: string[];
  /** A complete 64px preview shown when there's no image (initial, monogram…). */
  fallback: ReactNode;
  uploadLabel?: string;
  onStart: (body: {
    contentType: string;
    size: number;
  }) => Promise<{ ticket?: UploadTicket; error?: string }>;
  onFinish: (assetId: string) => Promise<{ url?: string; error?: string }>;
  onRemove: () => Promise<{ error?: string }>;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(currentUrl);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const canUpload = canManage && uploadsEnabled;
  const maxMb = Math.max(1, Math.round(maxSizeBytes / 1024 / 1024));

  function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (acceptedTypes.length && !acceptedTypes.includes(file.type)) {
      return setError("Use a PNG, JPEG, WebP, or GIF image.");
    }
    if (file.size > maxSizeBytes) {
      return setError(`That image is too large. Keep it under ${maxMb} MB.`);
    }
    start(async () => {
      const started = await onStart({ contentType: file.type, size: file.size });
      if (started.error || !started.ticket) {
        return setError(started.error ?? "Couldn't start the upload.");
      }
      const { upload, assetId } = started.ticket;
      // The one direct-to-bucket step: bytes never touch our servers.
      const put = await fetch(upload.url, {
        method: upload.method,
        headers: upload.headers,
        body: file,
      }).catch(() => null);
      if (!put || !put.ok) return setError("Upload to storage failed. Try again.");

      const done = await onFinish(assetId);
      if (done.error || !done.url) return setError(done.error ?? "Couldn't save the image.");
      setUrl(done.url);
      router.refresh();
    });
  }

  function remove() {
    setError(null);
    start(async () => {
      const res = await onRemove();
      if (res.error) return setError(res.error);
      setUrl(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-5">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- uploaded URLs, not build-time assets
          <img
            src={url}
            alt=""
            className="size-16 shrink-0 rounded-xl border border-white/10 object-cover"
          />
        ) : (
          fallback
        )}

        <div className="flex flex-col gap-2">
          {canManage ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => inputRef.current?.click()}
                disabled={!canUpload || pending}
              >
                <ImagePlus className="size-4" />
                {pending ? "Uploading…" : url ? "Replace" : uploadLabel}
              </Button>
              {url ? (
                <Button variant="secondary" onClick={remove} disabled={pending}>
                  <Trash2 className="size-4" /> Remove
                </Button>
              ) : null}
            </div>
          ) : null}

          <p className="text-xs text-zinc-500">
            {uploadsEnabled
              ? `PNG, JPEG, WebP, or GIF, up to ${maxMb} MB.`
              : "Uploads aren't configured on this deployment yet."}
          </p>
          {error ? <p className="text-xs text-red-400">{error}</p> : null}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={acceptedTypes.join(",")}
        className="hidden"
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
