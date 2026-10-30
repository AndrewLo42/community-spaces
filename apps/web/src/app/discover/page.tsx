import {
  DEFAULT_RADIUS_MILES,
  placeLabel,
  RADIUS_OPTIONS_MILES,
  type PlaceSummary,
  type RadiusMiles,
} from "@cs/core";
import type { Metadata } from "next";
import Link from "next/link";
import { GroupCard } from "@/components/group-card";
import { ButtonLink, EmptyState } from "@/components/ui";
import { serverApi } from "@/server/api";
import { getSessionUser } from "@/server/auth";
import { DiscoverSearchForm } from "./search-form";

export const metadata: Metadata = { title: "Discover" };

type SearchParams = Promise<{ q?: string; cursor?: string; near?: string; radius?: string }>;

export default async function DiscoverPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query = params.q?.trim() || undefined;
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

  const { groups, nextCursor } = await api.group.discover({ query, cursor, near: near?.id, radius });

  const moreHref = (() => {
    const sp = new URLSearchParams();
    if (query) sp.set("q", query);
    sp.set("near", near ? String(near.id) : "any");
    if (near) sp.set("radius", String(radius));
    if (nextCursor) sp.set("cursor", String(nextCursor));
    return `/discover?${sp}`;
  })();
  const anywhere = (() => {
    const sp = new URLSearchParams({ near: "any" });
    if (query) sp.set("q", query);
    return `/discover?${sp}`;
  })();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-semibold tracking-tight">Discover groups</h1>
        <p className="mt-1 text-sm text-muted">Find the people near you who care about the same things.</p>
      </div>

      <DiscoverSearchForm query={query} near={near} radius={radius} />

      {near ? (
        <p className="text-sm text-muted">
          Groups within {radius} mi of <span className="font-medium text-fg">{placeLabel(near)}</span>, nearest first ·{" "}
          <Link href={anywhere} className="underline hover:text-fg">
            Search anywhere
          </Link>
        </p>
      ) : null}

      {groups.length === 0 ? (
        <EmptyState
          title={
            near
              ? `No groups${describe(query)} within ${radius} mi of ${placeLabel(near)}`
              : query
                ? `No groups${describe(query)}`
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
          <ButtonLink href={moreHref} variant="secondary">
            More groups
          </ButtonLink>
        </div>
      ) : null}
    </div>
  );
}

/** ' matching "garden"' */
function describe(query?: string) {
  return query ? ` matching "${query}"` : "";
}
