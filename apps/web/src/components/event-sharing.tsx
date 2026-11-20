"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { errorMessage } from "@/lib/errors";
import { useTRPC } from "@/trpc/client";
import { Button, Input } from "./ui";

/**
 * For the organizer of an event in a private or secret group: an invite link
 * people outside the group can open and RSVP from. Stopping it makes every
 * copy of the link stop working.
 */
export function EventSharing({
  eventId,
  code,
  showLocation,
  groupName,
  groupVisibility,
}: {
  eventId: string;
  code: string | null;
  showLocation: boolean;
  groupName: string;
  groupVisibility: "public" | "private" | "hidden";
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [confirmingOff, setConfirmingOff] = useState(false);
  const [copied, setCopied] = useState(false);
  const save = useMutation(
    trpc.event.setSharing.mutationOptions({
      onSuccess: () => {
        setConfirmingOff(false);
        router.refresh();
      },
    }),
  );
  const on = code !== null;
  const shownLocation = save.isPending ? save.variables.showLocation : showLocation;
  // The full address needs the browser's origin, which the server render doesn't know.
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const link = on ? `${origin}/e/${eventId}?s=${code}` : "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // The link is in the box, selected on focus, for copying by hand.
    }
  }

  return (
    <section className="w-full space-y-3 rounded-lg border border-line p-4 text-sm" aria-labelledby="event-sharing-title">
      <div className="space-y-1">
        <h3 id="event-sharing-title" className="font-semibold">
          {on ? "Invite link is on" : "Invite people who aren't in the group"}
        </h3>
        <p className="text-muted">
          {on
            ? `Anyone with this link can see the event and RSVP, without joining ${groupName}.`
            : `Right now only members of ${groupName} can open this event. Make a link you can text, email or post, and anyone who has it can see the event and RSVP, without joining the group.`}
        </p>
        <p className="text-xs text-muted">
          They'll see the details and how many are going, not the group's posts, the comments here, or who's coming.
          {groupVisibility === "hidden" ? " Since the group is secret, the invite page won't name it or who planned the event." : ""}
        </p>
      </div>

      {on ? (
        <div className="flex flex-wrap gap-2">
          <Input readOnly value={link} aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 text-xs" />
          <Button variant="secondary" onClick={copy}>
            <span aria-live="polite">{copied ? "Copied" : "Copy link"}</span>
          </Button>
        </div>
      ) : null}

      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={shownLocation}
          disabled={save.isPending}
          onChange={(e) => save.mutate({ eventId, enabled: on, showLocation: e.target.checked })}
        />
        <span>
          Show the address to people with the link
          <span className="block text-xs text-muted">
            Turn this off for a home address. They'll see it once they RSVP, and members always see it.
          </span>
        </span>
      </label>

      {save.error ? <p className="text-danger">{errorMessage(save.error)}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        {!on ? (
          <Button disabled={save.isPending} onClick={() => save.mutate({ eventId, enabled: true, showLocation })}>
            Create invite link
          </Button>
        ) : confirmingOff ? (
          <>
            <span className="text-muted">The link will stop working for anyone you've sent it to. People who already RSVP'd stay on the list.</span>
            <Button variant="secondary" disabled={save.isPending} onClick={() => save.mutate({ eventId, enabled: false, showLocation })}>
              Stop sharing
            </Button>
            <Button variant="ghost" onClick={() => setConfirmingOff(false)}>
              Keep it
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={() => setConfirmingOff(true)}>
            Stop sharing this link
          </Button>
        )}
      </div>
    </section>
  );
}
