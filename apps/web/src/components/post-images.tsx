"use client";

import type { PostView } from "@cs/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { cx } from "./ui";

type Images = PostView["images"];

/**
 * A post's photos. Clicking one opens it full screen over the page; Escape,
 * the close button or a click outside the photo returns to the post. Plain
 * links underneath keep cmd/ctrl-click ("open in new tab") working.
 */
export function PostImages({ images }: { images: Images }) {
  const [open, setOpen] = useState<number | null>(null);

  const thumb = (i: number) => ({
    href: images[i]!.url,
    onClick: (e: React.MouseEvent) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      setOpen(i);
    },
    "aria-label": images.length > 1 ? `View photo ${i + 1} of ${images.length}` : "View photo",
  });

  return (
    <>
      {images.length === 1 ? (
        <a {...thumb(0)} className="mt-3 block cursor-zoom-in overflow-hidden rounded-lg bg-surface-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={images[0]!.url}
            alt=""
            width={images[0]!.width ?? undefined}
            height={images[0]!.height ?? undefined}
            loading="lazy"
            className="max-h-[32rem] w-full object-contain"
          />
        </a>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-1.5 overflow-hidden rounded-lg">
          {images.map((img, i) => (
            <a
              key={img.url}
              {...thumb(i)}
              className={cx("block cursor-zoom-in bg-surface-2", images.length === 3 && i === 0 && "row-span-2")}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt="" loading="lazy" className="aspect-square h-full w-full object-cover" />
            </a>
          ))}
        </div>
      )}

      {open !== null ? <Lightbox images={images} index={open} onIndex={setOpen} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

function Lightbox({
  images,
  index,
  onIndex,
  onClose,
}: {
  images: Images;
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const count = images.length;
  const step = useCallback((delta: number) => onIndex((index + delta + count) % count), [index, count, onIndex]);

  useEffect(() => {
    // Keep keyboard focus inside, stop the page scrolling behind, and put focus back afterwards.
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      previouslyFocused?.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" && count > 1) step(1);
      else if (e.key === "ArrowLeft" && count > 1) step(-1);
      else if (e.key === "Tab") {
        // Cycle through the lightbox's own buttons only.
        const buttons = [...(dialog.current?.querySelectorAll("button") ?? [])];
        if (buttons.length === 0) return;
        e.preventDefault();
        const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[(at + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length]!.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, step, count]);

  const img = images[index]!;
  const control =
    "flex size-11 items-center justify-center rounded-full bg-black/50 text-2xl leading-none text-white transition hover:bg-black/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-white";

  return (
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-label={count > 1 ? `Photo ${index + 1} of ${count}` : "Photo"}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4 sm:p-10"
      onClick={onClose}
      // Swipe left/right between photos on touch screens.
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const start = touchStartX.current;
        const end = e.changedTouches[0]?.clientX;
        touchStartX.current = null;
        if (start === null || end === undefined || count < 2 || Math.abs(end - start) < 50) return;
        step(end < start ? 1 : -1);
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={img.url}
        alt=""
        width={img.width ?? undefined}
        height={img.height ?? undefined}
        className="max-h-full max-w-full object-contain shadow-2xl"
        // Clicking the photo itself doesn't close it; clicking around it does.
        onClick={(e) => e.stopPropagation()}
      />

      <button
        ref={closeButton}
        type="button"
        aria-label="Close"
        className={cx(control, "absolute right-3 top-3")}
        onClick={onClose}
      >
        ×
      </button>

      {count > 1 ? (
        <>
          <button
            type="button"
            aria-label="Previous photo"
            className={cx(control, "absolute left-3 top-1/2 -translate-y-1/2")}
            onClick={(e) => {
              e.stopPropagation();
              step(-1);
            }}
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Next photo"
            className={cx(control, "absolute right-3 top-1/2 -translate-y-1/2")}
            onClick={(e) => {
              e.stopPropagation();
              step(1);
            }}
          >
            ›
          </button>
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs text-white">
            {index + 1} / {count}
          </p>
        </>
      ) : null}
    </div>
  );
}
