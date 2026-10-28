import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { serverApi } from "@/server/api";
import { getSessionUser } from "@/server/auth";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  if (!(await getSessionUser())) redirect("/sign-in");
  const me = await (await serverApi()).user.me();
  if (!me) redirect("/sign-in");

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="font-serif text-3xl font-semibold tracking-tight">Your profile</h1>
      <p className="mt-1 text-sm text-muted">
        Signed in as {me.email}. Profiles stay small on purpose: just enough for neighbors to recognize you.
      </p>
      <div className="mt-6">
        <ProfileForm initial={{ name: me.name, bio: me.bio }} />
      </div>
    </div>
  );
}
