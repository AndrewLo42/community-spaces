import Link from "next/link";
import { PostCard } from "@/components/post-card";
import { ButtonLink, EmptyState } from "@/components/ui";
import { serverApi } from "@/server/api";
import { getSessionUser } from "@/server/auth";

export default async function HomePage({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  const { cursor } = await searchParams;
  const user = await getSessionUser();

  if (!user) {
    return (
      <section className="mx-auto max-w-2xl py-16 text-center">
        <h1 className="font-serif text-4xl font-semibold tracking-tight sm:text-5xl">
          Your neighborhood, minus the noise.
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-lg text-muted">
          Community Spaces is for groups: gardens, running clubs, book circles, block associations. No algorithm, no
          follower counts. Just the communities you belong to.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <ButtonLink href="/discover">Find a group</ButtonLink>
          <ButtonLink href="/sign-in" variant="secondary">
            Sign in
          </ButtonLink>
        </div>
      </section>
    );
  }

  const api = await serverApi();
  const [groups, feed] = await Promise.all([api.group.mine(), api.post.homeFeed({ cursor })]);

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_17rem]">
      <div className="min-w-0 space-y-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight">Home</h1>
          <p className="mt-1 text-sm text-muted">The latest from your groups, newest first.</p>
        </div>

        {!user.name ? (
          <p className="rounded-lg bg-surface-2 px-4 py-3 text-sm">
            Add your name on your{" "}
            <Link href="/profile" className="font-medium underline">
              profile
            </Link>{" "}
            so groups know who you are.
          </p>
        ) : null}

        {feed.posts.length === 0 ? (
          <EmptyState title={groups.length === 0 ? "You haven't joined any groups yet" : "Nothing new yet"}>
            {groups.length === 0 ? (
              <ButtonLink href="/discover" className="mt-3">
                Discover groups
              </ButtonLink>
            ) : (
              "Posts from your groups will show up here."
            )}
          </EmptyState>
        ) : (
          feed.posts.map((p) => <PostCard key={p.id} post={p} showGroup />)
        )}

        {feed.nextCursor ? (
          <div className="text-center">
            <ButtonLink href={`/?cursor=${encodeURIComponent(feed.nextCursor)}`} variant="secondary">
              Older posts
            </ButtonLink>
          </div>
        ) : null}
      </div>

      <aside className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted">Your groups</h2>
        {groups.length === 0 ? (
          <p className="text-sm text-muted">None yet.</p>
        ) : (
          <ul className="space-y-1">
            {groups.map((g) => (
              <li key={g.id}>
                <Link href={`/g/${g.slug}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: g.accentColor }} />
                  <span className="truncate">{g.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2 pt-2">
          <ButtonLink href="/discover" variant="secondary" className="flex-1">
            Discover
          </ButtonLink>
          <ButtonLink href="/groups/new" variant="secondary" className="flex-1">
            New group
          </ButtonLink>
        </div>
      </aside>
    </div>
  );
}
