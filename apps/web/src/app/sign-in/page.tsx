import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

/** Only same-site paths, so a crafted link can't bounce people to another site. */
function safeNext(next: string | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/";
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (await getSessionUser()) redirect(next);

  return (
    <div className="mx-auto max-w-sm py-12">
      <h1 className="font-serif text-3xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-2 text-sm text-muted">We'll email you a link. No password needed. New here? This creates your account.</p>
      <div className="mt-6">
        <SignInForm devHint={!process.env.RESEND_API_KEY} callbackURL={next} />
      </div>
    </div>
  );
}
