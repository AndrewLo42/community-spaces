import type { Metadata } from "next";
import Link from "next/link";
import { Button, Card } from "@/components/ui";
import { verifyUnsubscribe } from "@/server/unsubscribe";

export const metadata: Metadata = { title: "Unsubscribe" };

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string; t?: string; done?: string }>;
}) {
  const { u, t, done } = await searchParams;

  let body: React.ReactNode;
  if (done) {
    body = (
      <>
        <h1 className="font-serif text-2xl font-semibold">You're unsubscribed</h1>
        <p className="text-sm text-muted">
          You won't get summary emails anymore. You can turn them back on from your{" "}
          <Link href="/profile" className="underline">
            profile
          </Link>
          .
        </p>
      </>
    );
  } else if (!verifyUnsubscribe(u ?? null, t ?? null)) {
    body = (
      <>
        <h1 className="font-serif text-2xl font-semibold">This link doesn't work</h1>
        <p className="text-sm text-muted">
          You can change email settings from your{" "}
          <Link href="/profile" className="underline">
            profile
          </Link>
          .
        </p>
      </>
    );
  } else {
    body = (
      <>
        <h1 className="font-serif text-2xl font-semibold">Stop summary emails?</h1>
        <p className="text-sm text-muted">You'll still see everything in the app. This only turns off digest emails.</p>
        <form method="post" action="/api/unsubscribe">
          <input type="hidden" name="u" value={u} />
          <input type="hidden" name="t" value={t} />
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
