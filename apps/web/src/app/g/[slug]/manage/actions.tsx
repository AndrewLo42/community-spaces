"use client";

import { ROLE_LABELS, type MemberRole, type ReportTarget } from "@cs/core";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { GroupSettingsFields, type GroupSettings } from "@/components/group-settings-fields";
import { Button, Card, Field, Input, Select } from "@/components/ui";
import { errorMessage, fieldErrors } from "@/lib/errors";
import { timeAgo } from "@/lib/time";
import { useTRPC } from "@/trpc/client";

function useRefresh() {
  const router = useRouter();
  return () => router.refresh();
}

function ErrorText({ error }: { error: unknown }) {
  const message = errorMessage(error);
  return message ? <p className="text-xs text-danger">{message}</p> : null;
}

// ─── Join requests ───────────────────────────────────────────────────────────

export function RequestActions({ groupId, userId }: { groupId: string; userId: string }) {
  const trpc = useTRPC();
  const onSuccess = useRefresh();
  const review = useMutation(trpc.manage.reviewRequest.mutationOptions({ onSuccess }));
  const block = useMutation(trpc.manage.removeMember.mutationOptions({ onSuccess }));
  const busy = review.isPending || block.isPending;

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <div className="flex gap-1.5">
        <Button className="px-3 py-1.5" disabled={busy} onClick={() => review.mutate({ groupId, userId, approve: true })}>
          Approve
        </Button>
        <Button
          variant="secondary"
          className="px-3 py-1.5"
          disabled={busy}
          onClick={() => review.mutate({ groupId, userId, approve: false })}
        >
          Decline
        </Button>
        <Button
          variant="ghost"
          className="px-3 py-1.5"
          disabled={busy}
          title="Decline and stop them from asking again"
          onClick={() => {
            if (confirm("Block this person from requesting to join again?")) block.mutate({ groupId, userId, ban: true });
          }}
        >
          Block
        </Button>
      </div>
      <ErrorText error={review.error ?? block.error} />
    </div>
  );
}

// ─── Members ─────────────────────────────────────────────────────────────────

export function MemberActions({
  groupId,
  userId,
  name,
  role,
  assignableRoles,
  canRemove,
  canUnban,
}: {
  groupId: string;
  userId: string;
  name: string;
  role: MemberRole;
  assignableRoles: MemberRole[];
  canRemove: boolean;
  canUnban: boolean;
}) {
  const trpc = useTRPC();
  const onSuccess = useRefresh();
  const setRole = useMutation(trpc.manage.setRole.mutationOptions({ onSuccess }));
  const remove = useMutation(trpc.manage.removeMember.mutationOptions({ onSuccess }));
  const unban = useMutation(trpc.manage.unban.mutationOptions({ onSuccess }));
  const busy = setRole.isPending || remove.isPending || unban.isPending;
  const who = name || "this member";

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <div className="flex flex-wrap items-center gap-1.5">
        {assignableRoles.length > 0 ? (
          <Select
            aria-label={`Role for ${who}`}
            className="w-auto py-1.5"
            value={role}
            disabled={busy}
            onChange={(e) =>
              setRole.mutate({ groupId, userId, role: e.target.value as Exclude<MemberRole, "owner"> })
            }
          >
            {[role, ...assignableRoles].map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        ) : null}
        {canRemove ? (
          <>
            <Button
              variant="ghost"
              className="px-3 py-1.5"
              disabled={busy}
              onClick={() => {
                if (confirm(`Remove ${who} from the group? They can rejoin later.`)) {
                  remove.mutate({ groupId, userId, ban: false });
                }
              }}
            >
              Remove
            </Button>
            <Button
              variant="ghost"
              className="px-3 py-1.5 text-danger hover:text-danger"
              disabled={busy}
              onClick={() => {
                if (confirm(`Ban ${who}? They'll be removed and can't rejoin.`)) {
                  remove.mutate({ groupId, userId, ban: true });
                }
              }}
            >
              Ban
            </Button>
          </>
        ) : null}
        {canUnban ? (
          <Button variant="secondary" className="px-3 py-1.5" disabled={busy} onClick={() => unban.mutate({ groupId, userId })}>
            Unban
          </Button>
        ) : null}
      </div>
      <ErrorText error={setRole.error ?? remove.error ?? unban.error} />
    </div>
  );
}

// ─── Reports ─────────────────────────────────────────────────────────────────

export function ReportActions({
  groupId,
  targetType,
  targetId,
  alreadyRemoved,
}: {
  groupId: string;
  targetType: ReportTarget;
  targetId: string;
  alreadyRemoved: boolean;
}) {
  const trpc = useTRPC();
  const onSuccess = useRefresh();
  const resolve = useMutation(trpc.manage.resolveReport.mutationOptions({ onSuccess }));

  return (
    <div className="space-y-1 border-t border-line pt-3">
      <div className="flex flex-wrap gap-2">
        {alreadyRemoved ? (
          <Button disabled={resolve.isPending} onClick={() => resolve.mutate({ groupId, targetType, targetId, action: "remove" })}>
            Mark resolved
          </Button>
        ) : (
          <Button
            disabled={resolve.isPending}
            onClick={() => {
              if (confirm(`Remove this ${targetType}? Members will no longer see it.`)) {
                resolve.mutate({ groupId, targetType, targetId, action: "remove" });
              }
            }}
          >
            Remove {targetType}
          </Button>
        )}
        <Button
          variant="secondary"
          disabled={resolve.isPending}
          onClick={() => resolve.mutate({ groupId, targetType, targetId, action: "dismiss" })}
        >
          Dismiss, it's fine
        </Button>
      </div>
      <ErrorText error={resolve.error} />
    </div>
  );
}

// ─── Invites ─────────────────────────────────────────────────────────────────

interface InviteRow {
  id: string;
  code: string;
  uses: number;
  maxUses: number | null;
  expiresAt: Date | null;
  createdByName: string | null;
}

export function InvitePanel({ groupId, invites }: { groupId: string; invites: InviteRow[] }) {
  const trpc = useTRPC();
  const onSuccess = useRefresh();
  const create = useMutation(trpc.manage.createInvite.mutationOptions({ onSuccess }));
  const revoke = useMutation(trpc.manage.revokeInvite.mutationOptions({ onSuccess }));
  const [expires, setExpires] = useState<"1" | "7" | "30" | "never">("7");
  const [maxUses, setMaxUses] = useState<"1" | "10" | "50" | "unlimited">("unlimited");
  const [copied, setCopied] = useState<string | null>(null);

  // Links are absolute so they can be pasted anywhere; the origin is only known in the browser.
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);

  const now = new Date();
  const isLive = (i: InviteRow) => (!i.expiresAt || i.expiresAt > now) && (i.maxUses === null || i.uses < i.maxUses);

  return (
    <div className="space-y-6">
      <Card className="space-y-4 p-4">
        <p className="text-sm text-muted">
          Anyone with an invite link can join, whatever the group's join setting. It's the only way into invite-only and
          hidden groups.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Expires">
            <Select value={expires} onChange={(e) => setExpires(e.target.value as typeof expires)} className="w-36">
              <option value="1">After 1 day</option>
              <option value="7">After 7 days</option>
              <option value="30">After 30 days</option>
              <option value="never">Never</option>
            </Select>
          </Field>
          <Field label="Uses">
            <Select value={maxUses} onChange={(e) => setMaxUses(e.target.value as typeof maxUses)} className="w-36">
              <option value="1">1 person</option>
              <option value="10">10 people</option>
              <option value="50">50 people</option>
              <option value="unlimited">No limit</option>
            </Select>
          </Field>
          <Button
            disabled={create.isPending}
            onClick={() =>
              create.mutate({
                groupId,
                expiresInDays: expires === "never" ? null : (Number(expires) as 1 | 7 | 30),
                maxUses: maxUses === "unlimited" ? null : Number(maxUses),
              })
            }
          >
            {create.isPending ? "Creating…" : "Create invite link"}
          </Button>
        </div>
        <ErrorText error={create.error} />
      </Card>

      {invites.length > 0 ? (
        <Card className="divide-y divide-line">
          {invites.map((invite) => {
            const url = `${origin}/invite/${invite.code}`;
            return (
              <div key={invite.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1 text-sm">
                  <p className="truncate font-mono text-xs">{url}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {isLive(invite) ? "" : "Inactive · "}
                    {invite.uses}
                    {invite.maxUses !== null ? ` of ${invite.maxUses}` : ""} used ·{" "}
                    {invite.expiresAt
                      ? invite.expiresAt > now
                        ? `expires ${timeAgo(invite.expiresAt)}`
                        : "expired"
                      : "never expires"}
                    {invite.createdByName ? ` · by ${invite.createdByName}` : ""}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <Button
                    variant="secondary"
                    className="px-3 py-1.5"
                    disabled={!origin}
                    onClick={async () => {
                      await navigator.clipboard.writeText(url);
                      setCopied(invite.id);
                      setTimeout(() => setCopied((c) => (c === invite.id ? null : c)), 2000);
                    }}
                  >
                    {copied === invite.id ? "Copied" : "Copy link"}
                  </Button>
                  <Button
                    variant="ghost"
                    className="px-3 py-1.5"
                    disabled={revoke.isPending}
                    onClick={() => revoke.mutate({ groupId, inviteId: invite.id })}
                  >
                    Revoke
                  </Button>
                </div>
              </div>
            );
          })}
        </Card>
      ) : null}
    </div>
  );
}

// ─── Settings ────────────────────────────────────────────────────────────────

export function SettingsForm({ groupId, initial }: { groupId: string; initial: GroupSettings }) {
  const trpc = useTRPC();
  const onSuccess = useRefresh();
  const update = useMutation(trpc.manage.updateSettings.mutationOptions({ onSuccess }));
  const [form, setForm] = useState(initial);
  const errors = fieldErrors(update.error);

  return (
    <form
      className="space-y-8"
      onSubmit={(e) => {
        e.preventDefault();
        update.mutate({ ...form, groupId });
      }}
    >
      <GroupSettingsFields value={form} onChange={setForm} errors={errors} />
      <div className="flex items-center justify-end gap-3">
        {update.isSuccess && !update.isPending ? <span className="text-sm text-muted">Saved</span> : null}
        {update.error ? <span className="text-sm text-danger">{errorMessage(update.error)}</span> : null}
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

// ─── Danger zone (owner only) ────────────────────────────────────────────────

export function DangerZone({
  groupId,
  groupName,
  members,
}: {
  groupId: string;
  groupName: string;
  /** Other active members, who could take over. */
  members: Array<{ userId: string; name: string; role: MemberRole }>;
}) {
  const router = useRouter();
  const trpc = useTRPC();
  const transfer = useMutation(trpc.manage.transferOwnership.mutationOptions({ onSuccess: () => router.refresh() }));
  const remove = useMutation(
    trpc.manage.deleteGroup.mutationOptions({
      onSuccess: () => {
        router.push("/");
        router.refresh();
      },
    }),
  );
  const [newOwner, setNewOwner] = useState("");
  const [confirmName, setConfirmName] = useState("");
  const chosen = members.find((m) => m.userId === newOwner);

  return (
    <section className="mt-12 space-y-4 rounded-xl border border-danger/40 p-5">
      <h2 className="font-serif text-xl font-semibold">Danger zone</h2>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Transfer ownership</h3>
        <p className="text-xs text-muted">
          The new owner gets full control. You'll stay on as an admin, and can leave the group afterwards.
        </p>
        {members.length === 0 ? (
          <p className="text-sm text-muted">There's no one else in the group to hand it to yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Select value={newOwner} onChange={(e) => setNewOwner(e.target.value)} className="w-auto min-w-48" aria-label="New owner">
              <option value="">Choose a member…</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name || "Unnamed member"} ({ROLE_LABELS[m.role]})
                </option>
              ))}
            </Select>
            <Button
              variant="secondary"
              disabled={!chosen || transfer.isPending}
              onClick={() => {
                if (chosen && confirm(`Make ${chosen.name || "this member"} the owner of ${groupName}? You'll become an admin.`)) {
                  transfer.mutate({ groupId, userId: chosen.userId });
                }
              }}
            >
              {transfer.isPending ? "Transferring…" : "Transfer ownership"}
            </Button>
          </div>
        )}
        <ErrorText error={transfer.error} />
      </div>

      <div className="space-y-2 border-t border-line pt-4">
        <h3 className="text-sm font-medium">Delete this group</h3>
        <p className="text-xs text-muted">
          Permanently removes the group with every post, comment and photo in it. This can't be undone.
        </p>
        <Field label={`Type "${groupName}" to confirm`}>
          <Input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} autoComplete="off" />
        </Field>
        <Button
          className="bg-danger text-white"
          disabled={confirmName.trim() !== groupName.trim() || remove.isPending}
          onClick={() => remove.mutate({ groupId, confirmName })}
        >
          {remove.isPending ? "Deleting…" : "Delete group forever"}
        </Button>
        <ErrorText error={remove.error} />
      </div>
    </section>
  );
}
