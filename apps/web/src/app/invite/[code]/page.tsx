import { TRPCError } from "@trpc/server";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ButtonLink, Card } from "@/components/ui";
import { serverApi } from "@/server/api";
import { AcceptInviteButton } from "./accept-button";

export const metadata: Metadata = { title: "You're invited" };

const unavailable = {
  expired: "This invite link has expired.",
  revoked: "This invite link was turned off by the group's admins.",
  "used-up": "This invite link has already been used the maximum number of times.",
} as const;

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  let invite;
  try {
    invite = await (await serverApi()).invite.byCode({ code });
  } catch (e) {
    if (e instanceof TRPCError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const { group, viewer, status } = invite;
  if (viewer.membershipStatus === "active") redirect(`/g/${group.slug}`);

  let action: React.ReactNode;
  if (status !== "valid") {
    action = <p className="text-sm text-muted">{unavailable[status]} Ask an admin for a new one.</p>;
  } else if (!viewer.signedIn) {
    action = <ButtonLink href={`/sign-in?next=${encodeURIComponent(`/invite/${code}`)}`}>Sign in to join</ButtonLink>;
  } else if (viewer.membershipStatus === "banned") {
    action = <p className="text-sm text-muted">You can't join this group.</p>;
  } else {
    action = <AcceptInviteButton code={code} />;
  }

  return (
    <div className="mx-auto max-w-md py-10">
      <Card className="overflow-hidden text-center">
        {group.bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={group.bannerUrl} alt="" className="h-28 w-full object-cover" />
        ) : (
          <div className="h-20" style={{ background: group.accentColor }} />
        )}
        <div className="space-y-4 p-6">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">You're invited to join</p>
          <h1 className="font-serif text-3xl font-semibold tracking-tight">{group.name}</h1>
          {group.description ? <p className="text-sm text-muted">{group.description}</p> : null}
          <p className="text-xs text-muted">
            {group.memberCount} {group.memberCount === 1 ? "member" : "members"}
          </p>
          <div className="flex justify-center pt-2">{action}</div>
        </div>
      </Card>
    </div>
  );
}
