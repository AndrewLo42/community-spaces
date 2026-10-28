"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { errorMessage } from "@/lib/errors";
import { useTRPC } from "@/trpc/client";

export function AcceptInviteButton({ code }: { code: string }) {
  const router = useRouter();
  const trpc = useTRPC();
  const accept = useMutation(
    trpc.invite.accept.mutationOptions({
      onSuccess: ({ slug }) => {
        router.push(`/g/${slug}`);
        router.refresh();
      },
    }),
  );

  return (
    <div className="space-y-2">
      <Button disabled={accept.isPending} onClick={() => accept.mutate({ code })}>
        {accept.isPending ? "Joining…" : "Join group"}
      </Button>
      {accept.error ? <p className="text-xs text-danger">{errorMessage(accept.error)}</p> : null}
    </div>
  );
}
