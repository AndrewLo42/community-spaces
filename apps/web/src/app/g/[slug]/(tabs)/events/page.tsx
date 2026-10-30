import type { Metadata } from "next";
import Link from "next/link";
import { EventCard } from "@/components/event-card";
import { ButtonLink, cx, EmptyState } from "@/components/ui";
import { serverApi } from "@/server/api";
import { loadGroup } from "../../load-group";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { group } = await loadGroup((await params).slug);
  return { title: `Events · ${group.name}` };
}

export default async function GroupEventsPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Promise<{ when?: string; cursor?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const when = sp.when === "past" ? "past" : "upcoming";
  const cursor = Number(sp.cursor) || 0;
  const { group, membership, permissions } = await loadGroup(slug);
  const base = `/g/${group.slug}/events`;

  if (!permissions.read) {
    return (
      <EmptyState title="This group is private">
        {membership?.status === "pending" ? "Your request is waiting for an admin." : "Join to see what the group has planned."}
      </EmptyState>
    );
  }

  const { events, nextCursor } = await (await serverApi()).event.list({ groupId: group.id, when, cursor });

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Which events" className="flex rounded-lg border border-line bg-surface p-0.5 text-sm">
          {(["upcoming", "past"] as const).map((w) => (
            <Link
              key={w}
              href={w === "past" ? `${base}?when=past` : base}
              aria-current={when === w ? "page" : undefined}
              className={cx("rounded-md px-3 py-1.5", when === w ? "bg-surface-2 font-medium text-fg" : "text-muted hover:text-fg")}
            >
              {w === "upcoming" ? "Upcoming" : "Past"}
            </Link>
          ))}
        </nav>
        {permissions.createEvent ? <ButtonLink href={`${base}/new`}>Plan an event</ButtonLink> : null}
      </div>

      {events.length === 0 ? (
        <EmptyState title={when === "upcoming" ? "Nothing planned yet" : cursor ? "No earlier events" : "No past events yet"}>
          {when === "upcoming"
            ? permissions.createEvent
              ? "Put the next meetup on the calendar."
              : "When someone plans a meetup, it shows up here."
            : "Events move here once they're over, so the group keeps its history."}
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {events.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </div>
      )}

      {nextCursor !== null ? (
        <div className="text-center">
          <ButtonLink
            href={`${base}?${new URLSearchParams({ ...(when === "past" ? { when } : {}), cursor: String(nextCursor) })}`}
            variant="secondary"
          >
            {when === "past" ? "Earlier events" : "Later events"}
          </ButtonLink>
        </div>
      ) : null}
    </div>
  );
}
