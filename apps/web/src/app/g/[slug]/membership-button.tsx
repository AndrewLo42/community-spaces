"use client";

import type { MembershipStatus } from "@cs/core";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui";
import { errorMessage } from "@/lib/errors";
import { useTRPC } from "@/trpc/client";

export function MembershipButton({
  groupId,
  signedIn,
  status,
  canJoin,
  canRequest,
  canLeave,
  secret = false,
}: {
  groupId: string;
  signedIn: boolean;
  status: MembershipStatus | null;
  canJoin: boolean;
  canRequest: boolean;
  canLeave: boolean;
  /** A secret group can't be found again, so leaving asks first. */
  secret?: boolean;
}) {
  const router = useRouter();
  const trpc = useTRPC();
  const onSuccess = () => router.refresh();
  const join = useMutation(trpc.group.join.mutationOptions({ onSuccess }));
  const leave = useMutation(trpc.group.leave.mutationOptions({ onSuccess }));
  const error = errorMessage(join.error ?? leave.error);
  const busy = join.isPending || leave.isPending;

  let action: React.ReactNode = null;
  if (!signedIn) {
    action = <ButtonLink href="/sign-in">Sign in to join</ButtonLink>;
  } else if (status === "pending") {
    action = (
      <Button variant="secondary" disabled={busy} onClick={() => leave.mutate({ groupId })}>
        Requested · Cancel
      </Button>
    );
  } else if (status === "active") {
    action = canLeave ? (
      <Button
        variant="secondary"
        disabled={busy}
        onClick={() => {
          if (secret && !confirm("Leave this group? It's secret, so you'll need a new invite link to come back.")) return;
          leave.mutate({ groupId });
        }}
      >
        Leave group
      </Button>
    ) : null;
  } else if (canJoin) {
    action = (
      <Button disabled={busy} onClick={() => join.mutate({ groupId })}>
        Join group
      </Button>
    );
  } else if (canRequest) {
    action = (
      <Button disabled={busy} onClick={() => join.mutate({ groupId })}>
        Request to join
      </Button>
    );
  } else if (status !== "banned") {
    action = <p className="text-sm text-muted">Invite only</p>;
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      {action}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
