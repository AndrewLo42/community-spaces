import { ROLE_LABELS, type MemberRole } from "@cs/core";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GroupCard, type GroupCardData } from "@/components/group-card";
import { ButtonLink, EmptyState } from "@/components/ui";
import { timeAgo } from "@/lib/time";
import { serverApi } from "@/server/api";
import { getSessionUser } from "@/server/auth";

export const metadata: Metadata = { title: "My groups" };

type MyGroup = GroupCardData & { id: string; role: MemberRole; lastPostAt: Date | null; joinedAt: Date };

export default async function MyGroupsPage() {
  if (!(await getSessionUser())) redirect("/sign-in?next=/groups");
  const { managing, member, pending } = await (await serverApi()).group.myGroups();
  const total = managing.length + member.length;

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight">My groups</h1>
          <p className="mt-1 text-sm text-muted">
            {total === 0
              ? "Groups you join will live here."
              : `You're in ${total} ${total === 1 ? "group" : "groups"}, most recently active first.`}
          </p>
        </div>
        <div className="flex gap-2">
          <ButtonLink href="/discover" variant="secondary">
            Find more
          </ButtonLink>
          <ButtonLink href="/groups/new" variant="secondary">
            Start a group
          </ButtonLink>
        </div>
      </div>

      {total === 0 && pending.length === 0 ? (
        <EmptyState title="You haven't joined any groups yet">
          <ButtonLink href="/discover" className="mt-3">
            Discover groups
          </ButtonLink>
        </EmptyState>
      ) : null}

      <Section title="Groups you help run" groups={managing} footer={(g) => <RoleAndActivity group={g} />} />
      <Section
        title={managing.length > 0 ? "Groups you're in" : null}
        groups={member}
        footer={(g) => <Activity at={g.lastPostAt} />}
      />
      <Section
        title="Waiting for approval"
        groups={pending}
        footer={(g) => <>Requested {timeAgo(g.joinedAt)}</>}
      />
    </div>
  );
}

function Section({
  title,
  groups,
  footer,
}: {
  /** null hides the heading (when it's the only section). */
  title: string | null;
  groups: MyGroup[];
  footer: (g: MyGroup) => React.ReactNode;
}) {
  if (groups.length === 0) return null;
  return (
    <section className="space-y-3">
      {title ? <h2 className="text-xs font-medium uppercase tracking-wide text-muted">{title}</h2> : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((g) => (
          <GroupCard key={g.id} group={g} footer={footer(g)} />
        ))}
      </div>
    </section>
  );
}

function RoleAndActivity({ group }: { group: MyGroup }) {
  return (
    <>
      <span className="font-medium text-fg">{ROLE_LABELS[group.role]}</span> · <Activity at={group.lastPostAt} />
    </>
  );
}

function Activity({ at }: { at: Date | null }) {
  return <>{at ? `Last post ${timeAgo(at)}` : "No posts yet"}</>;
}
