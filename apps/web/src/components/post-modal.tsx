"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

/**
 * The frame around a post opened from a feed. Closing goes back in history, so
 * the URL, the back button and the scroll position underneath all line up.
 * Escape, the × and a click outside the panel close it.
 */
export function PostModal({ postId, children }: { postId: string; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const panel = useRef<HTMLDivElement>(null);
  const close = useCallback(() => router.back(), [router]);

  // A parallel slot keeps showing its last page across soft navigations, so a
  // link clicked inside the modal would otherwise leave it open on top of the
  // next page. It only shows while the URL is this post. (A catch-all route in
  // the slot would also do this, but it sends Turbopack dev into a reload loop.)
  const open = pathname === `/p/${postId}`;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // A report, edit or photo dialog opened from the post closes first.
      const others = [...document.querySelectorAll('[aria-modal="true"]')].filter((d) => d !== panel.current);
      if (others.length === 0) close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 overflow-y-auto bg-black/50 px-0 sm:px-4 sm:py-10"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Post"
        tabIndex={-1}
        className="relative mx-auto min-h-full max-w-2xl bg-bg p-4 shadow-2xl outline-none sm:min-h-0 sm:rounded-2xl sm:p-6"
      >
        <div className="sticky top-0 z-10 -mx-4 -mt-4 mb-2 flex justify-end bg-bg/90 px-2 py-2 backdrop-blur sm:static sm:m-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
          <button
            type="button"
            aria-label="Close post"
            onClick={close}
            className="flex size-9 items-center justify-center rounded-full text-xl text-muted hover:bg-surface-2 hover:text-fg sm:absolute sm:-right-3 sm:-top-3 sm:bg-surface sm:shadow"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
