"use client";

import type { UploadPurpose } from "@cs/core";
import { useRef, useState } from "react";
import { useImageUpload } from "@/lib/use-image-upload";
import { Button, cx } from "./ui";

/**
 * Pick, upload and save a single image (avatar or banner). `onSave` receives
 * the new key, or null to remove; the server swaps it in and deletes the old file.
 */
export function ImageField({
  purpose,
  label,
  hint,
  currentUrl,
  placeholder,
  onSave,
}: {
  purpose: Extract<UploadPurpose, "avatar" | "banner">;
  label: string;
  hint: string;
  currentUrl: string | null;
  /** Shown when there's no image yet. */
  placeholder: React.ReactNode;
  onSave: (key: string | null) => Promise<unknown>;
}) {
  const upload = useImageUpload(purpose);
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shown = preview ?? currentUrl;

  async function run(task: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium">{label}</span>
      <div className={cx("flex gap-4", purpose === "banner" ? "flex-col" : "items-center")}>
        <div
          className={cx(
            "shrink-0 overflow-hidden bg-surface-2",
            purpose === "avatar" ? "size-20 rounded-full" : "h-28 w-full rounded-xl sm:h-36",
            busy && "opacity-60",
          )}
        >
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt="" className="size-full object-cover" />
          ) : (
            placeholder
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={input}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setPreview(URL.createObjectURL(file));
              void run(async () => {
                const { key } = await upload(file);
                await onSave(key);
              });
            }}
          />
          <Button type="button" variant="secondary" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? "Uploading…" : shown ? "Change photo" : "Add photo"}
          </Button>
          {shown && !busy ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                void run(async () => {
                  await onSave(null);
                  setPreview(null);
                })
              }
            >
              Remove
            </Button>
          ) : null}
          <span className="text-xs text-muted">{hint}</span>
        </div>
      </div>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
