import { eq, groups } from "@cs/db";
import type { Metadata } from "next";
import Link from "next/link";
import { Button, Card } from "@/components/ui";
import { db } from "@/server/db";
import { verifyUnsubscribe } from "@/server/unsubscribe";

export const metadata: Metadata = { title: "Unsubscribe" };

const profileLink = (
  <Link href="/profile" className="underline">
    profile
  </Link>
);

/** Confirms turning off digests, or (with ?g=) one group's announcement emails. */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string; t?: string; g?: string; done?: string }>;
}) {
  const { u, t, g, done } = await searchParams;
  const [group] = g ? await db.select({ name: groups.name }).from(groups).where(eq(groups.id, g)) : [];

  let body: React.ReactNode;
  if (done) {
    body = (
      <>
        <h1 className="font-serif text-2xl font-semibold">You're unsubscribed</h1>
        <p className="text-sm text-muted">
          {done === "announcements"
            ? "You won't get announcement emails from that group anymore. They'll still show up in the app."
            : "You won't get summary emails anymore."}{" "}
          You can turn them back on from your {profileLink}.
        </p>
      </>
    );
  } else if (!verifyUnsubscribe(u ?? null, t ?? null, g) || (g && !group)) {
    body = (
      <>
        <h1 className="font-serif text-2xl font-semibold">This link doesn't work</h1>
        <p className="text-sm text-muted">You can change email settings from your {profileLink}.</p>
      </>
    );
  } else {
    body = (
      <>
        <h1 className="font-serif text-2xl font-semibold">
          {group ? `Stop announcement emails from ${group.name}?` : "Stop summary emails?"}
        </h1>
        <p className="text-sm text-muted">
          {group
            ? "You'll stay in the group and still see announcements in the app. This only stops the emails."
            : "You'll still see everything in the app. This only turns off digest emails."}
        </p>
        <form method="post" action="/api/unsubscribe">
          <input type="hidden" name="u" value={u} />
          <input type="hidden" name="t" value={t} />
          {g ? <input type="hidden" name="g" value={g} /> : null}
          <Button type="submit">Unsubscribe</Button>
        </form>
      </>
    );
  }

  return (
    <div className="mx-auto max-w-md py-12">
      <Card className="space-y-4 p-6">{body}</Card>
    </div>
  );
}
