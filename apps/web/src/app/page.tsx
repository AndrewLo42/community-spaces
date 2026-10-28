import Link from "next/link";
import { GroupCard } from "@/components/group-card";
import { ButtonLink, EmptyState } from "@/components/ui";
import { serverApi } from "@/server/api";
import { getSessionUser } from "@/server/auth";

export default async function HomePage() {
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
  const groups = await api.group.mine();

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight">Your groups</h1>
          <p className="mt-1 text-sm text-muted">Posts from these groups will show up here, newest first.</p>
        </div>
        <ButtonLink href="/groups/new" variant="secondary">
          Start a group
        </ButtonLink>
      </div>

      {!user.name ? (
        <p className="rounded-lg bg-surface-2 px-4 py-3 text-sm">
          Add your name on your <Link href="/profile" className="font-medium underline">profile</Link> so groups know who you
          are.
        </p>
      ) : null}

      {groups.length === 0 ? (
        <EmptyState title="You haven't joined any groups yet">
          <ButtonLink href="/discover" className="mt-3">
            Discover groups
          </ButtonLink>
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <GroupCard key={g.id} group={g} />
          ))}
        </div>
      )}
    </div>
  );
}
