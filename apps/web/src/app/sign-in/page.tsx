import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage() {
  if (await getSessionUser()) redirect("/");

  return (
    <div className="mx-auto max-w-sm py-12">
      <h1 className="font-serif text-3xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-2 text-sm text-muted">We'll email you a link. No password needed. New here? This creates your account.</p>
      <div className="mt-6">
        <SignInForm devHint={!process.env.RESEND_API_KEY} />
      </div>
    </div>
  );
}
