"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { errorMessage } from "@/lib/errors";
import { useTRPC } from "@/trpc/client";

/** One switch per group: whether its announcements and event reminders also arrive by email. */
export function AnnouncementEmailsForm({ initial }: { initial: Array<{ groupId: string; name: string; enabled: boolean }> }) {
  const trpc = useTRPC();
  const update = useMutation(trpc.announcement.setEmails.mutationOptions());
  const [enabled, setEnabled] = useState(() => new Map(initial.map((g) => [g.groupId, g.enabled])));

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Announcement and reminder emails</legend>
      <p className="text-xs text-muted">
        Messages from a group's admins, updates from an event's organizer, and a reminder before events you said you'd
        come to. They always show up in the app too.
      </p>
      {initial.length === 0 ? (
        <p className="text-sm text-muted">Join a group to get its announcements.</p>
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {initial.map((g) => (
            <li key={g.groupId}>
              <label className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <span className="truncate">{g.name}</span>
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--accent)]"
                  checked={enabled.get(g.groupId) ?? true}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setEnabled((m) => new Map(m).set(g.groupId, on));
                    update.mutate({ groupId: g.groupId, enabled: on });
                  }}
                />
              </label>
            </li>
          ))}
        </ul>
      )}
      <p className="h-4 text-xs text-muted" aria-live="polite">
        {update.isPending ? "Saving…" : update.isSuccess ? "Saved" : null}
        {update.error ? <span className="text-danger">{errorMessage(update.error)}</span> : null}
      </p>
    </fieldset>
  );
}
