import { placeLabel, tagLabel } from "@cs/core";
import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink, Card } from "@/components/ui";
import { serverApi } from "@/server/api";
import { getSessionUser } from "@/server/auth";
import { GroupTabs } from "../group-tabs";
import { loadGroup } from "../load-group";
import { MembershipButton } from "../membership-button";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { group } = await loadGroup((await params).slug);
  // The default goes through the root template; the tabs' own titles need it restated.
  return { title: { default: group.name, template: "%s · Community Spaces" }, description: group.description };
}

async function needsAttention(groupId: string) {
  const { counts } = await (await serverApi()).manage.overview({ groupId });
  return counts.requests + counts.pendingPosts + counts.openReports;
}

/** The group header and its Posts | Events tabs. */
export default async function GroupLayout({ params, children }: { params: Params; children: React.ReactNode }) {
  const { slug } = await params;
  const [{ group, membership, permissions }, user] = await Promise.all([loadGroup(slug), getSessionUser()]);
  const attention = permissions.manage ? await needsAttention(group.id) : 0;
  const details = [group.place ? placeLabel(group.place) : null, group.visibility !== "public" ? group.visibility : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        {group.bannerUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={group.bannerUrl} alt="" className="h-32 w-full object-cover sm:h-48" />
        ) : (
          <div className="h-24 sm:h-32" style={{ background: group.accentColor }} />
        )}
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            {details ? (
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">{details}</p>
            ) : null}
            <h1 className="font-serif text-3xl font-semibold tracking-tight">{group.name}</h1>
            {group.tags.length > 0 ? (
              <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                {group.tags.map((t) => (
                  <Link key={t} href={`/discover?${new URLSearchParams({ q: tagLabel(t), near: "any" })}`} className="text-accent hover:underline">
                    {tagLabel(t)}
                  </Link>
                ))}
              </p>
            ) : null}
            <p className="mt-1 text-sm text-muted">
              {group.memberCount} {group.memberCount === 1 ? "member" : "members"}
              {membership?.status === "active" && membership.role !== "member" ? ` · You're ${membership.role === "owner" ? "the owner" : membership.role === "admin" ? "an admin" : "a moderator"}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-start gap-2 sm:justify-end">
            {permissions.manage ? (
              <ButtonLink href={`/g/${group.slug}/manage`} variant="secondary">
                Manage{attention > 0 ? ` · ${attention} to review` : ""}
              </ButtonLink>
            ) : null}
            <MembershipButton
              groupId={group.id}
              signedIn={!!user}
              status={membership?.status ?? null}
              canJoin={permissions.join}
              canRequest={permissions.requestJoin}
              canLeave={permissions.leave}
            />
          </div>
        </div>
      </Card>

      <GroupTabs slug={group.slug} />

      {children}
    </div>
  );
}
