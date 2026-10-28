import { CATEGORY_LABELS, type GroupCategory } from "@cs/core";
import { TRPCError } from "@trpc/server";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, EmptyState } from "@/components/ui";
import { serverApi } from "@/server/api";
import { getSessionUser } from "@/server/auth";
import { MembershipButton } from "./membership-button";

type Params = Promise<{ slug: string }>;

async function loadGroup(slug: string) {
  const api = await serverApi();
  try {
    return await api.group.bySlug({ slug });
  } catch (e) {
    if (e instanceof TRPCError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { group } = await loadGroup((await params).slug);
  return { title: group.name, description: group.description };
}

const postPolicyCopy = {
  members: "All members can post.",
  approval: "Member posts are reviewed by moderators before they appear.",
  admins: "Only admins post here. Members can comment.",
} as const;

export default async function GroupPage({ params }: { params: Params }) {
  const { slug } = await params;
  const [{ group, membership, permissions }, user] = await Promise.all([loadGroup(slug), getSessionUser()]);

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <div className="h-24 sm:h-32" style={{ background: group.accentColor }} />
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              {CATEGORY_LABELS[group.category as GroupCategory] ?? group.category}
              {group.visibility !== "public" ? ` · ${group.visibility}` : ""}
            </p>
            <h1 className="mt-1 font-serif text-3xl font-semibold tracking-tight">{group.name}</h1>
            <p className="mt-1 text-sm text-muted">
              {group.memberCount} {group.memberCount === 1 ? "member" : "members"}
              {membership?.status === "active" && membership.role !== "member" ? ` · You're ${membership.role === "owner" ? "the owner" : `a ${membership.role}`}` : ""}
            </p>
          </div>
          <MembershipButton
            groupId={group.id}
            signedIn={!!user}
            status={membership?.status ?? null}
            canJoin={permissions.join}
            canRequest={permissions.requestJoin}
            canLeave={permissions.leave}
          />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <section className="space-y-4">
          {permissions.read ? (
            <EmptyState title="No posts yet">
              {permissions.post ? "Posting arrives in the next build step." : "Posts from this group will appear here."}
            </EmptyState>
          ) : (
            <EmptyState title="This group is private">
              {membership?.status === "pending"
                ? "Your request is waiting for an admin."
                : "Join to see what members are posting."}
            </EmptyState>
          )}
        </section>

        <aside className="space-y-4">
          <Card className="space-y-3 p-4 text-sm">
            <h2 className="font-semibold">About</h2>
            <p className="whitespace-pre-line text-muted">{group.description || "No description yet."}</p>
            <p className="text-muted">{postPolicyCopy[group.postPolicy]}</p>
          </Card>
          {group.rules ? (
            <Card className="space-y-2 p-4 text-sm">
              <h2 className="font-semibold">Group rules</h2>
              <p className="whitespace-pre-line text-muted">{group.rules}</p>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
