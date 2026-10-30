import {
  DEFAULT_RADIUS_MILES,
  normalizeTag,
  placeLabel,
  RADIUS_OPTIONS_MILES,
  tagLabel,
  type PlaceSummary,
  type RadiusMiles,
} from "@cs/core";
import type { Metadata } from "next";
import Link from "next/link";
import { GroupCard } from "@/components/group-card";
import { ButtonLink, cx, EmptyState } from "@/components/ui";
import { serverApi } from "@/server/api";
import { getSessionUser } from "@/server/auth";
import { DiscoverSearchForm } from "./search-form";

export const metadata: Metadata = { title: "Discover" };

type SearchParams = Promise<{ q?: string; tag?: string; cursor?: string; near?: string; radius?: string }>;

export default async function DiscoverPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query = params.q?.trim() || undefined;
  const tag = params.tag ? (normalizeTag(params.tag) ?? undefined) : undefined;
  const cursor = Number(params.cursor) || 0;
  const radius = (RADIUS_OPTIONS_MILES as readonly number[]).includes(Number(params.radius))
    ? (Number(params.radius) as RadiusMiles)
    : DEFAULT_RADIUS_MILES;

  const api = await serverApi();
  // No ?near= means "near my town" when the viewer has set one; ?near=any means anywhere.
  let near: PlaceSummary | null = null;
  if (params.near && params.near !== "any") {
    near = (await api.place.byId({ id: Number(params.near) }).catch(() => null)) ?? null;
  } else if (!params.near && (await getSessionUser())) {
    near = (await api.user.me())?.place ?? null;
  }

  const [{ groups, nextCursor }, popular] = await Promise.all([
    api.group.discover({ query, tag, cursor, near: near?.id, radius }),
    api.tag.popular(),
  ]);
  // Keep the active tag visible as a chip even when it isn't one of the most used.
  const chips = popular.map((p) => p.tag);
  if (tag && !chips.includes(tag)) chips.unshift(tag);

  const href = (next: { tag?: string; cursor?: number }) => {
    const sp = new URLSearchParams();
    if (query) sp.set("q", query);
    if (next.tag) sp.set("tag", next.tag);
    sp.set("near", near ? String(near.id) : "any");
    if (near) sp.set("radius", String(radius));
    if (next.cursor) sp.set("cursor", String(next.cursor));
    return `/discover?${sp}`;
  };
  const anywhere = (() => {
    const sp = new URLSearchParams({ near: "any" });
    if (query) sp.set("q", query);
    if (tag) sp.set("tag", tag);
    return `/discover?${sp}`;
  })();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-semibold tracking-tight">Discover groups</h1>
        <p className="mt-1 text-sm text-muted">Find the people near you who care about the same things.</p>
      </div>

      <DiscoverSearchForm query={query} tag={tag} near={near} radius={radius} />

      {near ? (
        <p className="text-sm text-muted">
          Groups within {radius} mi of <span className="font-medium text-fg">{placeLabel(near)}</span>, nearest first ·{" "}
          <Link href={anywhere} className="underline hover:text-fg">
            Search anywhere
          </Link>
        </p>
      ) : null}

      {chips.length > 0 ? (
        <nav aria-label="Popular hashtags" className="flex flex-wrap gap-2">
          <TagChip href={href({})} active={!tag}>
            All
          </TagChip>
          {chips.map((t) => (
            // Clicking the active tag again clears it.
            <TagChip key={t} href={href(t === tag ? {} : { tag: t })} active={t === tag}>
              {tagLabel(t)}
            </TagChip>
          ))}
        </nav>
      ) : null}

      {groups.length === 0 ? (
        <EmptyState
          title={
            near
              ? `No groups${describe(query, tag)} within ${radius} mi of ${placeLabel(near)}`
              : query || tag
                ? `No groups${describe(query, tag)}`
                : "No groups here yet"
          }
        >
          {near ? (
            <p>
              Try a wider distance, or{" "}
              <Link href={anywhere} className="underline">
                search anywhere
              </Link>
              . Groups without a location only show up in anywhere searches.
            </p>
          ) : null}
          <p className="mt-2">Can't find yours?</p>
          <ButtonLink href="/groups/new" variant="secondary" className="mt-3">
            Start one
          </ButtonLink>
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <GroupCard key={g.id} group={g} />
          ))}
        </div>
      )}

      {nextCursor !== null ? (
        <div className="text-center">
          <ButtonLink href={href({ tag, cursor: nextCursor })} variant="secondary">
            More groups
          </ButtonLink>
        </div>
      ) : null}
    </div>
  );
}

/** ' matching "garden" tagged #compost' */
function describe(query?: string, tag?: string) {
  return `${query ? ` matching "${query}"` : ""}${tag ? ` tagged ${tagLabel(tag)}` : ""}`;
}

function TagChip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cx(
        "rounded-full border px-3 py-1 text-sm transition",
        active ? "border-accent bg-accent text-accent-fg" : "border-line bg-surface text-muted hover:text-fg",
      )}
    >
      {children}
    </Link>
  );
}
