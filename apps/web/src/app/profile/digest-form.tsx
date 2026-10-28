"use client";

import type { EmailDigest } from "@cs/core";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { cx } from "@/components/ui";
import { errorMessage } from "@/lib/errors";
import { useTRPC } from "@/trpc/client";

const options: Array<{ value: EmailDigest; label: string; description: string }> = [
  { value: "daily", label: "Daily", description: "One email a day, only when something happened." },
  { value: "weekly", label: "Weekly", description: "A roundup once a week." },
  { value: "off", label: "Off", description: "No summary emails. Sign-in links still arrive." },
];

export function DigestForm({ initial }: { initial: EmailDigest }) {
  const trpc = useTRPC();
  const update = useMutation(trpc.notification.updatePreferences.mutationOptions());
  const [value, setValue] = useState(initial);

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Summary emails</legend>
      <p className="text-xs text-muted">Replies to you and new posts in your groups, bundled. Never one email per post.</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {options.map((o) => (
          <label
            key={o.value}
            className={cx(
              "cursor-pointer rounded-lg border p-3 text-sm transition",
              value === o.value ? "border-accent bg-accent/5 ring-1 ring-accent" : "border-line bg-surface",
            )}
          >
            <input
              type="radio"
              name="emailDigest"
              className="sr-only"
              checked={value === o.value}
              onChange={() => {
                setValue(o.value);
                update.mutate({ emailDigest: o.value });
              }}
            />
            <span className="block font-medium">{o.label}</span>
            <span className="mt-0.5 block text-xs text-muted">{o.description}</span>
          </label>
        ))}
      </div>
      <p className="h-4 text-xs text-muted" aria-live="polite">
        {update.isPending ? "Saving…" : update.isSuccess ? "Saved" : null}
        {update.error ? <span className="text-danger">{errorMessage(update.error)}</span> : null}
      </p>
    </fieldset>
  );
}
