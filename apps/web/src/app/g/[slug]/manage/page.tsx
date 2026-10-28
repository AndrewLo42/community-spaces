import { placeLabel, REPORT_REASON_LABELS, ROLE_LABELS, type ReportReason } from "@cs/core";
import { TRPCError } from "@trpc/server";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import type { GroupSettings } from "@/components/group-settings-fields";
import { MarkSeen } from "@/components/mark-seen";
import { PostCard } from "@/components/post-card";
import { Button, ButtonLink, Card, cx, EmptyState, Input } from "@/components/ui";
import { timeAgo } from "@/lib/time";
import { serverApi } from "@/server/api";
import { BannerField, DangerZone, InvitePanel, MemberActions, ReportActions, RequestActions, SettingsForm } from "./actions";

export const metadata: Metadata = { title: "Manage group" };

const TABS = ["requests", "posts", "reports", "members", "invites", "settings"] as const;
type Tab = (typeof TABS)[number];

type Params = Promise<{ slug: string }>;

export default async function ManagePage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<{ tab?: string; q?: string }>;
}) {
  const { slug } = await params;
  const api = await serverApi();

  let groupId: string;
  try {
    groupId = (await api.group.bySlug({ slug })).group.id;
  } catch (e) {
    if (e instanceof TRPCError && e.code === "NOT_FOUND") notFound();
    throw e;
  }

  let overview;
  try {
    overview = await api.manage.overview({ groupId });
  } catch (e) {
    // Non-moderators (and signed-out visitors) see the page as missing.
    if (e instanceof TRPCError && (e.code === "FORBIDDEN" || e.code === "UNAUTHORIZED")) notFound();
    throw e;
  }
  const { group, counts, permissions } = overview;

  const available = TABS.filter((t) => (t === "invites" ? permissions.manageInvites : t === "settings" ? permissions.editSettings : true));
  const counted: Partial<Record<Tab, number>> = {
    requests: counts.requests,
    posts: counts.pendingPosts,
    reports: counts.openReports,
  };
  const { tab: requestedTab, q } = await searchParams;
  const requested = requestedTab as Tab | undefined;
  const tab: Tab =
    requested && available.includes(requested)
      ? requested
      : (available.find((t) => (counted[t] ?? 0) > 0) ?? "members");

  const labels: Record<Tab, string> = {
    requests: "Join requests",
    posts: "Posts to review",
    reports: "Reports",
    members: "Members",
    invites: "Invite links",
    settings: "Settings",
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/g/${slug}`} className="text-sm text-muted hover:text-fg">
          ← {group.name}
        </Link>
        <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight">Manage group</h1>
      </div>

      <nav className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4" aria-label="Manage sections">
        {available.map((t) => (
          <Link
            key={t}
            href={`/g/${slug}/manage?tab=${t}`}
            aria-current={t === tab ? "page" : undefined}
            className={cx(
              "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm",
              t === tab ? "border-accent font-medium text-fg" : "border-transparent text-muted hover:text-fg",
            )}
          >
            {labels[t]}
            {counted[t] ? <span className="ml-1.5 text-xs text-muted">{counted[t]}</span> : null}
          </Link>
        ))}
      </nav>

      <MarkSeen modQueueGroupId={groupId} />
      <div className="max-w-3xl">
        {tab === "requests" ? <RequestsTab groupId={groupId} /> : null}
        {tab === "posts" ? <PendingPostsTab groupId={groupId} /> : null}
        {tab === "reports" ? <ReportsTab groupId={groupId} /> : null}
        {tab === "members" ? <MembersTab groupId={groupId} slug={slug} query={q?.trim() || undefined} /> : null}
        {tab === "invites" ? <InvitesTab groupId={groupId} /> : null}
        {tab === "settings" ? (
          <>
            <div className="mb-8">
              <BannerField groupId={groupId} bannerUrl={group.bannerUrl} accentColor={group.accentColor} />
            </div>
            <SettingsForm
              groupId={groupId}
              initial={{
                name: group.name,
                description: group.description,
                rules: group.rules,
                // Stored as text; written only through validated input, so these narrow safely.
                category: group.category as GroupSettings["category"],
                accentColor: group.accentColor as GroupSettings["accentColor"],
                visibility: group.visibility,
                joinPolicy: group.joinPolicy,
                postPolicy: group.postPolicy,
                commentPolicy: group.commentPolicy,
                placeId: group.place?.id ?? null,
              }}
              initialPlace={group.place}
            />
            {overview.role === "owner" ? <OwnerDangerZone groupId={groupId} groupName={group.name} /> : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

async function RequestsTab({ groupId }: { groupId: string }) {
  const requests = await (await serverApi()).manage.requests({ groupId });
  if (requests.length === 0) return <EmptyState title="No one is waiting to join" />;

  return (
    <ul className="space-y-3">
      {requests.map((r) => (
        <li key={r.userId}>
          <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
            <Avatar name={r.name} image={r.image} />
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium">
                {r.name || "Unnamed member"}
                <span className="ml-2 text-xs font-normal text-muted">
                  {r.place ? `${placeLabel(r.place)} · ` : ""}asked {timeAgo(r.requestedAt)}
                </span>
              </p>
              {r.bio ? <p className="mt-0.5 text-muted">{r.bio}</p> : null}
              {r.message ? <p className="mt-2 rounded-md bg-surface-2 px-3 py-2">“{r.message}”</p> : null}
            </div>
            <RequestActions groupId={groupId} userId={r.userId} />
          </Card>
        </li>
      ))}
    </ul>
  );
}

async function PendingPostsTab({ groupId }: { groupId: string }) {
  const posts = await (await serverApi()).manage.pendingPosts({ groupId });
  if (posts.length === 0) return <EmptyState title="No posts waiting for approval" />;
  return (
    <div className="space-y-4">
      {posts.map((p) => (
        <PostCard key={p.id} post={p} />
      ))}
    </div>
  );
}

async function ReportsTab({ groupId }: { groupId: string }) {
  const items = await (await serverApi()).manage.reports({ groupId });
  if (items.length === 0) return <EmptyState title="No open reports">Reported posts and comments show up here.</EmptyState>;

  return (
    <ul className="space-y-4">
      {items.map((item) => (
        <li key={`${item.targetType}:${item.targetId}`}>
          <Card className="space-y-3 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              {item.targetType} · {item.reports.length} {item.reports.length === 1 ? "report" : "reports"}
            </p>
            {item.content ? (
              <div className="rounded-lg border border-line p-3 text-sm">
                <p className="font-medium">{item.content.authorName || "Member"}</p>
                <p className="mt-1 line-clamp-4 whitespace-pre-line">{item.content.body || "(photo post)"}</p>
                <div className="mt-2 flex gap-3 text-xs text-muted">
                  <Link href={`/p/${item.content.postId}`} className="hover:text-fg">
                    View in context
                  </Link>
                  {item.content.removed ? <span>Already removed</span> : null}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted">This content no longer exists.</p>
            )}
            <ul className="space-y-1 text-sm">
              {item.reports.map((r) => (
                <li key={r.id}>
                  <span className="font-medium">{REPORT_REASON_LABELS[r.reason as ReportReason] ?? r.reason}</span>
                  <span className="text-muted">
                    {" "}
                    · {r.reporterName || "Member"} · {timeAgo(r.createdAt)}
                  </span>
                  {r.details ? <p className="text-muted">“{r.details}”</p> : null}
                </li>
              ))}
            </ul>
            <ReportActions
              groupId={groupId}
              targetType={item.targetType}
              targetId={item.targetId}
              alreadyRemoved={!item.content || item.content.removed}
            />
          </Card>
        </li>
      ))}
    </ul>
  );
}

const MEMBERS_SHOWN = 200; // matches the API's cap

async function MembersTab({ groupId, slug, query }: { groupId: string; slug: string; query?: string }) {
  const members = await (await serverApi()).manage.members({ groupId, query });
  const active = members.filter((m) => m.status === "active");
  const banned = members.filter((m) => m.status === "banned");

  return (
    <div className="space-y-8">
      <form action={`/g/${slug}/manage`} className="flex gap-2">
        <input type="hidden" name="tab" value="members" />
        <Input name="q" defaultValue={query} placeholder="Search members by name" aria-label="Search members" />
        <Button type="submit" variant="secondary">
          Search
        </Button>
        {query ? (
          <ButtonLink href={`/g/${slug}/manage?tab=members`} variant="ghost">
            Clear
          </ButtonLink>
        ) : null}
      </form>
      {query && members.length === 0 ? <EmptyState title={`No members match "${query}"`} /> : null}
      {members.length >= MEMBERS_SHOWN ? (
        <p className="text-xs text-muted">Showing the first {MEMBERS_SHOWN} alphabetically. Search to find someone specific.</p>
      ) : null}
      <Card className="divide-y divide-line">
        {active.map((m) => (
          <div key={m.userId} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Avatar name={m.name} image={m.image} size="sm" />
              <div className="min-w-0 text-sm">
                <p className="truncate font-medium">
                  {m.name || "Unnamed member"}
                  {m.isSelf ? <span className="ml-1 font-normal text-muted">(you)</span> : null}
                </p>
                <p className="text-xs text-muted">
                  {ROLE_LABELS[m.role]}
                  {m.place ? ` · ${placeLabel(m.place)}` : ""} · joined {timeAgo(m.joinedAt)}
                </p>
              </div>
            </div>
            <MemberActions
              groupId={groupId}
              userId={m.userId}
              name={m.name}
              role={m.role}
              assignableRoles={m.assignableRoles}
              canRemove={m.canRemove}
              canUnban={false}
            />
          </div>
        ))}
      </Card>

      {banned.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted">Banned</h2>
          <Card className="divide-y divide-line">
            {banned.map((m) => (
              <div key={m.userId} className="flex items-center gap-3 p-3">
                <Avatar name={m.name} image={m.image} size="sm" />
                <p className="min-w-0 flex-1 truncate text-sm">{m.name || "Unnamed member"}</p>
                <MemberActions
                  groupId={groupId}
                  userId={m.userId}
                  name={m.name}
                  role={m.role}
                  assignableRoles={[]}
                  canRemove={false}
                  canUnban={m.canUnban}
                />
              </div>
            ))}
          </Card>
        </section>
      ) : null}
    </div>
  );
}

async function InvitesTab({ groupId }: { groupId: string }) {
  const invites = await (await serverApi()).manage.invites({ groupId });
  return <InvitePanel groupId={groupId} invites={invites} />;
}

async function OwnerDangerZone({ groupId, groupName }: { groupId: string; groupName: string }) {
  const members = await (await serverApi()).manage.members({ groupId });
  const others = members
    .filter((m) => m.status === "active" && !m.isSelf)
    .map(({ userId, name, role }) => ({ userId, name, role }));
  return <DangerZone groupId={groupId} groupName={groupName} members={others} />;
}
