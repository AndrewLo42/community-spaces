import { formatEventWhen } from "@cs/core";
import type { Metadata } from "next";
import Link from "next/link";
import { AnnounceButton } from "@/components/announce-button";
import { AnnouncementList } from "@/components/announcement-list";
import { Avatar } from "@/components/avatar";
import { CommentThread } from "@/components/comment-thread";
import { attendanceSummary, EventDateBadge } from "@/components/event-card";
import { EventActions } from "@/components/event-actions";
import { MarkSeen } from "@/components/mark-seen";
import { NewPollButton } from "@/components/new-poll-button";
import { PollList } from "@/components/poll-card";
import { EventSharing } from "@/components/event-sharing";
import { RsvpButtons } from "@/components/rsvp-buttons";
import { ShareEventButton } from "@/components/share-event-button";
import { ButtonLink, Card, cx } from "@/components/ui";
import { serverApi } from "@/server/api";
import { getSessionUser } from "@/server/auth";
import { loadEvent, shareParam } from "./load-event";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** `?s=code` on the event's own links, for guests who came in through a shared link. */
function guestQuery(event: { guest: boolean; sharing: { code: string | null } | null }) {
  return event.guest && event.sharing?.code ? `?s=${event.sharing.code}` : "";
}

export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: SearchParams }): Promise<Metadata> {
  const event = await loadEvent((await params).id, shareParam(await searchParams));
  const description = [formatEventWhen(event), event.location, event.group.name].filter(Boolean).join(" · ");
  const image = { url: `/e/${event.id}/og${guestQuery(event)}`, width: 1200, height: 630, alt: event.title };
  return {
    title: event.title,
    description,
    openGraph: { type: "website", title: event.title, description, siteName: "Community Spaces", images: [image] },
    twitter: { card: "summary_large_image", title: event.title, description, images: [image] },
    // Members-only events don't belong in search results even if a link leaks.
    ...(event.group.visibility === "public" ? {} : { robots: { index: false, follow: false } }),
  };
}

/** A map search for free-text places; "Online" and friends aren't on a map. */
function mapHref(location: string) {
  if (!location || /^(online|virtual|zoom|tbd)$/i.test(location.trim())) return null;
  return `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query: location })}`;
}

export default async function EventPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { id } = await params;
  const [event, user] = await Promise.all([loadEvent(id, shareParam(await searchParams)), getSessionUser()]);
  if (event.guest) return <GuestEventPage event={event} signedIn={user !== null} />;
  const api = await serverApi();
  const [comments, updates, polls] = await Promise.all([
    api.comment.list({ eventId: id }),
    api.announcement.forEvent({ eventId: id }),
    api.poll.list({ eventId: id }),
  ]);
  const groupSlug = event.group.slug!;
  const map = mapHref(event.location);
  const canAnswer = Object.values(event.viewer.canRsvp).some(Boolean);
  const when = formatEventWhen(event);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href={`/g/${groupSlug}/events`} className="text-sm text-muted hover:text-fg">
        ← {event.group.name} events
      </Link>

      {event.cancelled ? (
        <p role="status" className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          This event was cancelled.
        </p>
      ) : null}

      <AnnouncementList title="Updates from the organizer" items={updates} viewerId={user?.id ?? null} />

      <Card className="space-y-5 p-5 sm:p-6">
        <div className="flex gap-4">
          <EventDateBadge event={event} muted={event.cancelled || event.ended} />
          <div className="min-w-0 space-y-1">
            <h1 className={cx("font-serif text-2xl font-semibold tracking-tight sm:text-3xl", event.cancelled && "line-through decoration-muted")}>
              {event.title}
            </h1>
            <p className="text-sm text-muted">
              <Link href={`/g/${groupSlug}`} className="hover:text-fg hover:underline">
                {event.group.name}
              </Link>
              {event.organizer ? <> · Planned by {event.organizer.name}</> : null}
            </p>
          </div>
        </div>

        <dl className="space-y-2 text-sm">
          <div className="flex gap-3">
            <dt className="w-14 shrink-0 text-muted">When</dt>
            <dd>{when}</dd>
          </div>
          {event.location ? (
            <div className="flex gap-3">
              <dt className="w-14 shrink-0 text-muted">Where</dt>
              <dd>
                {map ? (
                  <a href={map} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                    {event.location}
                  </a>
                ) : (
                  event.location
                )}
              </dd>
            </div>
          ) : null}
          {event.link ? (
            <div className="flex gap-3">
              <dt className="w-14 shrink-0 text-muted">Link</dt>
              <dd className="min-w-0 truncate">
                <a href={event.link} target="_blank" rel="noreferrer nofollow" className="text-accent hover:underline">
                  {event.link.replace(/^https?:\/\//, "")}
                </a>
              </dd>
            </div>
          ) : null}
        </dl>

        {event.description ? <p className="whitespace-pre-line text-sm leading-relaxed">{event.description}</p> : null}

        {!event.cancelled && !event.ended ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <ShareEventButton key={event.sharing?.code ?? "members"} eventId={event.id} shareCode={event.sharing?.code ?? null} title={event.title} when={when} />
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-muted">Add to calendar:</span>
                <a href={`/e/${event.id}/calendar?to=google`} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                  Google
                </a>
                {/* An .ics file, which Apple Calendar, Outlook and most others open. */}
                <a href={`/e/${event.id}/calendar`} className="text-accent hover:underline">
                  Apple, Outlook and others
                </a>
              </span>
            </div>
            {event.sharing ? (
              <p className="text-xs text-muted">
                {event.sharing.code
                  ? "Anyone with the link can see this event, but not the rest of the group."
                  : `Only members of ${event.group.name} can open this link.`}
              </p>
            ) : null}
          </div>
        ) : null}

        {!event.cancelled ? (
          <div className="space-y-3 border-t border-line pt-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold">{event.ended ? "This event is over" : "Are you going?"}</h2>
              <p className="text-sm text-muted">{attendanceSummary(event)}</p>
            </div>
            {event.ended ? null : canAnswer || event.viewer.rsvp ? (
              <RsvpButtons eventId={event.id} current={event.viewer.rsvp} allowed={event.viewer.canRsvp} />
            ) : !user ? (
              <ButtonLink href={`/sign-in?next=${encodeURIComponent(`/e/${event.id}`)}`} variant="secondary">
                Sign in to RSVP
              </ButtonLink>
            ) : (
              <p className="text-sm text-muted">
                <Link href={`/g/${groupSlug}`} className="text-accent hover:underline">
                  Join {event.group.name}
                </Link>{" "}
                to RSVP.
              </p>
            )}
          </div>
        ) : null}

        {event.viewer.canManage || event.viewer.canMessage || event.sharing?.canChange ? (
          <div className="flex flex-wrap gap-2 border-t border-line pt-5">
            {event.viewer.canMessage ? (
              <AnnounceButton audience={{ eventId: event.id }} label="Message everyone coming" variant="primary" />
            ) : null}
            {event.viewer.canMessage && !event.cancelled ? <NewPollButton audience={{ eventId: event.id }} label="Start a poll" /> : null}
            {event.sharing?.canChange && !event.cancelled ? (
              <EventSharing eventId={event.id} code={event.sharing.code} showLocation={event.sharing.showLocation} groupVisibility={event.group.visibility} />
            ) : null}
            {event.viewer.canManage ? <EventActions eventId={event.id} title={event.title} goingCount={event.goingCount} /> : null}
          </div>
        ) : null}
      </Card>

      <PollList title="Polls" polls={polls} />

      {event.attendeesVisible ? (
        <>
          <PeopleList title={event.ended ? "Went" : "Going"} people={event.going} />
          {!event.ended ? <PeopleList title="Maybe" people={event.maybe} /> : null}
        </>
      ) : event.goingCount + event.maybeCount > 0 ? (
        <p className="text-sm text-muted">Members of {event.group.name} can see who's coming.</p>
      ) : null}

      {user ? <MarkSeen eventId={event.id} /> : null}
      <CommentThread thread={{ eventId: event.id }} comments={comments} canComment={event.viewer.canComment} />
    </div>
  );
}

function PeopleList({ title, people }: { title: string; people: { id: string; name: string; image: string | null }[] }) {
  if (people.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-medium uppercase tracking-wide text-muted">
        {title} · {people.length}
      </h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        {people.map((p) => (
          <li key={p.id} className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
            <Avatar name={p.name} image={p.image} size="sm" />
            <span className="truncate">{p.name}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

type EventDetails = Awaited<ReturnType<typeof loadEvent>>;

/**
 * What someone outside a private or secret group sees through a shared link:
 * the event itself, without the group's updates, polls, comments or who's coming.
 */
function GuestEventPage({ event, signedIn }: { event: EventDetails; signedIn: boolean }) {
  const map = mapHref(event.location);
  const when = formatEventWhen(event);
  const query = guestQuery(event);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <p className="text-sm text-muted">
        Shared with you{event.group.slug ? <> from <span className="font-medium text-fg">{event.group.name}</span></> : " from a private group"}
      </p>

      {event.cancelled ? (
        <p role="status" className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          This event was cancelled.
        </p>
      ) : null}

      <Card className="space-y-5 p-5 sm:p-6">
        <div className="flex gap-4">
          <EventDateBadge event={event} muted={event.cancelled || event.ended} />
          <div className="min-w-0 space-y-1">
            <h1 className={cx("font-serif text-2xl font-semibold tracking-tight sm:text-3xl", event.cancelled && "line-through decoration-muted")}>
              {event.title}
            </h1>
            {/* A secret group's guests already read "from a private group" above; nothing more to say here. */}
            {event.group.slug ? (
              <p className="text-sm text-muted">
                <Link href={`/g/${event.group.slug}`} className="hover:text-fg hover:underline">
                  {event.group.name}
                </Link>
                {event.organizer ? <> · Planned by {event.organizer.name}</> : null}
              </p>
            ) : null}
          </div>
        </div>

        <dl className="space-y-2 text-sm">
          <div className="flex gap-3">
            <dt className="w-14 shrink-0 text-muted">When</dt>
            <dd>{when}</dd>
          </div>
          {event.locationHidden ? (
            <div className="flex gap-3">
              <dt className="w-14 shrink-0 text-muted">Where</dt>
              <dd className="text-muted">The organizer shares where it is with group members.</dd>
            </div>
          ) : null}
          {event.location ? (
            <div className="flex gap-3">
              <dt className="w-14 shrink-0 text-muted">Where</dt>
              <dd>
                {map ? (
                  <a href={map} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                    {event.location}
                  </a>
                ) : (
                  event.location
                )}
              </dd>
            </div>
          ) : null}
          {event.link ? (
            <div className="flex gap-3">
              <dt className="w-14 shrink-0 text-muted">Link</dt>
              <dd className="min-w-0 truncate">
                <a href={event.link} target="_blank" rel="noreferrer nofollow" className="text-accent hover:underline">
                  {event.link.replace(/^https?:\/\//, "")}
                </a>
              </dd>
            </div>
          ) : null}
        </dl>

        {event.description ? <p className="whitespace-pre-line text-sm leading-relaxed">{event.description}</p> : null}

        {!event.cancelled && !event.ended ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <ShareEventButton key={event.sharing?.code ?? "members"} eventId={event.id} shareCode={event.sharing?.code ?? null} title={event.title} when={when} />
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-muted">Add to calendar:</span>
              <a href={`/e/${event.id}/calendar${query}${query ? "&" : "?"}to=google`} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                Google
              </a>
              <a href={`/e/${event.id}/calendar${query}`} className="text-accent hover:underline">
                Apple, Outlook and others
              </a>
            </span>
          </div>
        ) : null}

        {!event.cancelled ? (
          <div className="space-y-2 border-t border-line pt-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold">{event.ended ? "This event is over" : "Want to come?"}</h2>
              <p className="text-sm text-muted">{attendanceSummary(event)}</p>
            </div>
            {event.ended ? null : (
              <p className="text-sm text-muted">
                Only members of {event.group.slug ? event.group.name : "the group"} can RSVP for now. Ask whoever sent you this link
                {event.group.slug ? (
                  <>
                    , or{" "}
                    <Link href={signedIn ? `/g/${event.group.slug}` : `/sign-in?next=${encodeURIComponent(`/g/${event.group.slug}`)}`} className="text-accent hover:underline">
                      see the group
                    </Link>
                  </>
                ) : null}
                .
              </p>
            )}
          </div>
        ) : null}
      </Card>
    </div>
  );
}
