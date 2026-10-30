import { formatEventWhen } from "@cs/core";
import Link from "next/link";
import { AnnouncementList } from "@/components/announcement-list";
import { EventDateBadge } from "@/components/event-card";
import { PostCard } from "@/components/post-card";
import { PostComposer } from "@/components/post-composer";
import { ButtonLink, Card, EmptyState } from "@/components/ui";
import { serverApi } from "@/server/api";
import { getSessionUser } from "@/server/auth";
import { loadGroup } from "../load-group";

async function GroupFeed({
  groupId,
  slug,
  cursor,
  canPost,
  needsApproval,
}: {
  groupId: string;
  slug: string;
  cursor?: string;
  canPost: boolean;
  needsApproval: boolean;
}) {
  const api = await serverApi();
  const [feed, announcements, user] = await Promise.all([
    api.post.groupFeed({ groupId, cursor }),
    cursor ? [] : api.announcement.recent({ groupId }),
    getSessionUser(),
  ]);
  const isEmpty = feed.posts.length === 0 && feed.pinned.length === 0 && feed.pending.length === 0;

  return (
    <>
      <AnnouncementList title="Announcements" items={announcements} viewerId={user?.id ?? null} />
      {canPost && !cursor ? <PostComposer groupId={groupId} needsApproval={needsApproval} /> : null}

      {feed.pending.length > 0 ? (
        <div className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted">Waiting for approval</h2>
          {feed.pending.map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
        </div>
      ) : null}

      {[...feed.pinned, ...feed.posts].map((p) => (
        <PostCard key={p.id} post={p} />
      ))}

      {isEmpty ? (
        <EmptyState title={cursor ? "No older posts" : "No posts yet"}>
          {canPost && !cursor ? "Start the conversation." : null}
        </EmptyState>
      ) : null}

      {feed.nextCursor ? (
        <div className="text-center">
          <ButtonLink href={`/g/${slug}?cursor=${encodeURIComponent(feed.nextCursor)}`} variant="secondary">
            Older posts
          </ButtonLink>
        </div>
      ) : null}
    </>
  );
}

const postPolicyCopy = {
  members: "All members can post.",
  approval: "Member posts are reviewed by moderators before they appear.",
  admins: "Only admins post here. Members can comment.",
} as const;

/** Upcoming events, so the next meetup is visible without switching tabs. */
async function ComingUp({ groupId, slug, canCreate }: { groupId: string; slug: string; canCreate: boolean }) {
  const events = await (await serverApi()).event.nextUp({ groupId });
  if (events.length === 0 && !canCreate) return null;

  return (
    <Card className="space-y-3 p-4 text-sm">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">Coming up</h2>
        <Link href={`/g/${slug}/events`} className="text-xs text-muted hover:text-fg">
          All events
        </Link>
      </div>
      {events.length === 0 ? (
        <p className="text-muted">
          Nothing planned yet.{" "}
          <Link href={`/g/${slug}/events/new`} className="text-accent hover:underline">
            Plan an event
          </Link>
        </p>
      ) : (
        <ul className="space-y-3">
          {events.map((e) => (
            <li key={e.id}>
              <Link href={`/e/${e.id}`} className="group flex gap-3">
                <EventDateBadge event={e} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate font-medium group-hover:underline">{e.title}</span>
                  <span className="block truncate text-xs text-muted">{formatEventWhen(e)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default async function GroupPostsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { slug } = await params;
  const { cursor } = await searchParams;
  const { group, membership, permissions } = await loadGroup(slug);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <section className="space-y-4">
        {permissions.read ? (
          <GroupFeed
            groupId={group.id}
            slug={group.slug}
            cursor={cursor}
            canPost={permissions.post}
            needsApproval={!permissions.postWithoutApproval}
          />
        ) : (
          <EmptyState title="This group is private">
            {membership?.status === "pending"
              ? "Your request is waiting for an admin."
              : "Join to see what members are posting."}
          </EmptyState>
        )}
      </section>

      <aside className="space-y-4">
        {permissions.read ? <ComingUp groupId={group.id} slug={group.slug} canCreate={permissions.createEvent} /> : null}
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
  );
}
