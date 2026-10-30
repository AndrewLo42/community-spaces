"use client";

import { MAX_ANNOUNCEMENT_LENGTH, MAX_ANNOUNCEMENTS_PER_DAY, type AnnouncementAudience } from "@cs/core";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { errorMessage } from "@/lib/errors";
import { useTRPC } from "@/trpc/client";
import { Dialog } from "./dialog";
import { Button, Textarea } from "./ui";

const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

/**
 * Opens the composer for an announcement to a whole group, or an update to an
 * event's attendees. Sending notifies everyone at once, so the dialog says how
 * many people it will reach before anything goes out.
 */
export function AnnounceButton({
  audience,
  label,
  variant = "secondary",
}: {
  audience: AnnouncementAudience;
  label: string;
  variant?: "primary" | "secondary" | "ghost";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open ? <AnnounceDialog audience={audience} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function AnnounceDialog({ audience, onClose }: { audience: AnnouncementAudience; onClose: () => void }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [body, setBody] = useState("");
  const [sentTo, setSentTo] = useState<number | null>(null);
  const size = useQuery(trpc.announcement.audienceSize.queryOptions(audience));
  const send = useMutation(
    trpc.announcement.create.mutationOptions({
      onSuccess: ({ recipients }) => {
        setSentTo(recipients);
        router.refresh();
      },
    }),
  );
  const isEvent = "eventId" in audience;

  if (sentTo !== null) {
    return (
      <Dialog title="Sent" onClose={onClose}>
        <p className="text-sm text-muted">
          {sentTo === 0 ? "Saved, but there's nobody else to send it to yet." : `On its way to ${people(sentTo)}.`}
        </p>
        <div className="mt-5 flex justify-end">
          <Button onClick={onClose}>Done</Button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog title={isEvent ? "Message everyone coming" : "Send an announcement"} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          send.mutate({ ...audience, body });
        }}
      >
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={isEvent ? "We've moved indoors to the library, room 2." : "The garden gate code changes Monday to 4471."}
          className="min-h-32"
          maxLength={MAX_ANNOUNCEMENT_LENGTH}
          autoFocus
          aria-label="Message"
        />
        <p className="text-xs text-muted">
          {size.data === undefined
            ? "Counting who it will reach…"
            : `Goes to ${people(size.data)}${isEvent ? " who said going or maybe" : " in the group"} as a notification, and by email unless they've turned those off.`}{" "}
          Up to {MAX_ANNOUNCEMENTS_PER_DAY} a day, so save it for things people need to know.
        </p>
        {send.error ? <p className="text-sm text-danger">{errorMessage(send.error)}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!body.trim() || send.isPending}>
            {send.isPending ? "Sending…" : "Send"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
