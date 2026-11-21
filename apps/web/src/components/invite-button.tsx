"use client";

import { MAX_ACTIVE_INVITES_PER_MEMBER } from "@cs/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { errorMessage } from "@/lib/errors";
import { useTRPC } from "@/trpc/client";
import { Dialog } from "./dialog";
import { Button, Field, Select } from "./ui";

const expiryLabel = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });

/** "Invite people": make and share your own invite links for this group. */
export function InviteButton({ groupId, groupName }: { groupId: string; groupName: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Invite people
      </Button>
      {open ? <InviteDialog groupId={groupId} groupName={groupName} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function InviteDialog({ groupId, groupName, onClose }: { groupId: string; groupName: string; onClose: () => void }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const mine = useQuery(trpc.invite.mine.queryOptions({ groupId }));
  const refresh = () => queryClient.invalidateQueries(trpc.invite.mine.queryFilter({ groupId }));
  const [copied, setCopied] = useState<string | null>(null);
  const create = useMutation(
    trpc.invite.create.mutationOptions({
      onSuccess: async ({ code }) => {
        await refresh();
        void copy(code);
      },
    }),
  );
  const revoke = useMutation(trpc.invite.revoke.mutationOptions({ onSuccess: refresh }));
  const [expires, setExpires] = useState<"1" | "7" | "30" | "never">("7");
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const linkFor = (code: string) => `${origin}/invite/${code}`;
  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(linkFor(code));
      setCopied(code);
    } catch {
      // Clipboard can be blocked; the link is still on screen to copy by hand.
    }
  };

  const links = mine.data ?? [];
  const atLimit = links.length >= MAX_ACTIVE_INVITES_PER_MEMBER;

  return (
    <Dialog title={`Invite people to ${groupName}`} onClose={onClose}>
      <p className="text-sm text-muted">
        Anyone with your link can join. It stops working if you turn it off, it expires, or you leave the group.
      </p>
      <div className="mt-4 flex items-end gap-2">
        <Field label="Expires">
          <Select value={expires} onChange={(e) => setExpires(e.target.value as typeof expires)} className="w-36">
            <option value="1">After 1 day</option>
            <option value="7">After 7 days</option>
            <option value="30">After 30 days</option>
            <option value="never">Never</option>
          </Select>
        </Field>
        <Button
          disabled={create.isPending || atLimit}
          onClick={() => create.mutate({ groupId, expiresInDays: expires === "never" ? null : (Number(expires) as 1 | 7 | 30) })}
        >
          {create.isPending ? "Making…" : "Make a link"}
        </Button>
      </div>
      {atLimit ? (
        <p className="mt-2 text-xs text-muted">You have {MAX_ACTIVE_INVITES_PER_MEMBER} links. Turn one off to make another.</p>
      ) : null}
      {create.error || revoke.error ? (
        <p className="mt-2 text-sm text-danger" role="alert">
          {errorMessage(create.error ?? revoke.error)}
        </p>
      ) : null}

      {links.length > 0 ? (
        <ul className="mt-5 divide-y divide-line rounded-lg border border-line">
          {links.map((l) => (
            <li key={l.id} className="space-y-1.5 px-3 py-2.5">
              <input
                readOnly
                value={linkFor(l.code)}
                aria-label="Invite link"
                onFocus={(e) => e.currentTarget.select()}
                className="w-full truncate rounded border border-line bg-bg px-2 py-1 font-mono text-xs"
              />
              <div className="flex items-center justify-between gap-2 text-xs text-muted">
                <span>
                  {l.uses} {l.uses === 1 ? "join" : "joins"}
                  {l.expiresAt ? ` · expires ${expiryLabel.format(l.expiresAt)}` : " · never expires"}
                </span>
                <span className="flex gap-1">
                  <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => void copy(l.code)}>
                    {copied === l.code ? "Copied" : "Copy"}
                  </Button>
                  <Button
                    variant="ghost"
                    className="px-2 py-1 text-xs text-danger"
                    disabled={revoke.isPending}
                    onClick={() => revoke.mutate({ groupId, inviteId: l.id })}
                  >
                    Turn off
                  </Button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : mine.isLoading ? null : (
        <p className="mt-5 text-sm text-muted">You haven't made any links yet.</p>
      )}

      <div className="mt-5 flex justify-end">
        <Button variant="ghost" onClick={onClose}>
          Done
        </Button>
      </div>
    </Dialog>
  );
}
