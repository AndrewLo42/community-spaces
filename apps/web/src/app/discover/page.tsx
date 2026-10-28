import { CATEGORY_LABELS, GROUP_CATEGORIES, type GroupCategory } from "@cs/core";
import type { Metadata } from "next";
import Link from "next/link";
import { GroupCard } from "@/components/group-card";
import { Button, ButtonLink, cx, EmptyState, Input } from "@/components/ui";
import { serverApi } from "@/server/api";

export const metadata: Metadata = { title: "Discover" };

type SearchParams = Promise<{ q?: string; category?: string; cursor?: string }>;

export default async function DiscoverPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query = params.q?.trim() || undefined;
  const category = GROUP_CATEGORIES.includes(params.category as GroupCategory)
    ? (params.category as GroupCategory)
    : undefined;
  const cursor = Number(params.cursor) || 0;

  const api = await serverApi();
  const { groups, nextCursor } = await api.group.discover({ query, category, cursor });

  const href = (next: { category?: string; cursor?: number }) => {
    const sp = new URLSearchParams();
    if (query) sp.set("q", query);
    if (next.category) sp.set("category", next.category);
    if (next.cursor) sp.set("cursor", String(next.cursor));
    const s = sp.toString();
    return s ? `/discover?${s}` : "/discover";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-semibold tracking-tight">Discover groups</h1>
        <p className="mt-1 text-sm text-muted">Find the people near you who care about the same things.</p>
      </div>

      <form action="/discover" className="flex gap-2">
        <Input name="q" defaultValue={query} placeholder="Search by name or topic: garden, running, books…" />
        {category ? <input type="hidden" name="category" value={category} /> : null}
        <Button type="submit">Search</Button>
      </form>

      <div className="flex flex-wrap gap-2">
        <CategoryChip href={href({})} active={!category}>
          All
        </CategoryChip>
        {GROUP_CATEGORIES.map((c) => (
          <CategoryChip key={c} href={href({ category: c })} active={category === c}>
            {CATEGORY_LABELS[c]}
          </CategoryChip>
        ))}
      </div>

      {groups.length === 0 ? (
        <EmptyState title={query ? `No groups match "${query}"` : "No groups here yet"}>
          <p>Can't find yours?</p>
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
          <ButtonLink href={href({ category, cursor: nextCursor })} variant="secondary">
            More groups
          </ButtonLink>
        </div>
      ) : null}
    </div>
  );
}

function CategoryChip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
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
