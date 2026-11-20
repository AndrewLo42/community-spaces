"use client";

import { useState } from "react";
import { Button, Input } from "./ui";

/**
 * Shares the event page: the phone's share sheet where there is one,
 * otherwise copies the link. If the browser won't allow copying, the link
 * shows up selected so it can be copied by hand.
 */
export function ShareEventButton({ eventId, title, when }: { eventId: string; title: string; when: string }) {
  const [copied, setCopied] = useState(false);
  const [manual, setManual] = useState<string | null>(null);

  async function share() {
    const url = `${window.location.origin}/e/${eventId}`;
    if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
      try {
        await navigator.share({ title, text: `${title} · ${when}`, url });
        return;
      } catch (e) {
        // Closing the sheet isn't a failure; anything else falls back to copying.
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setManual(url);
    }
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" onClick={share}>
        <span aria-live="polite">{copied ? "Link copied" : "Share"}</span>
      </Button>
      {manual ? (
        <Input
          readOnly
          value={manual}
          aria-label="Event link"
          ref={(el) => {
            el?.focus();
            el?.select();
          }}
          onFocus={(e) => e.currentTarget.select()}
          className="w-72 max-w-full text-xs"
        />
      ) : null}
    </span>
  );
}
