import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/sign-out-button";
import { serverApi } from "@/server/api";
import { getSessionUser } from "@/server/auth";
import { AvatarField } from "./avatar-field";
import { AnnouncementEmailsForm } from "./announcement-emails-form";
import { DigestForm } from "./digest-form";
import { NotificationSettingsForm } from "./notification-settings-form";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  if (!(await getSessionUser())) redirect("/sign-in");
  const api = await serverApi();
  const [me, prefs, announcementEmails] = await Promise.all([
    api.user.me(),
    api.notification.preferences(),
    api.announcement.emailSettings(),
  ]);
  if (!me) redirect("/sign-in");

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="font-serif text-3xl font-semibold tracking-tight">Your profile</h1>
      <p className="mt-1 text-sm text-muted">
        Signed in as {me.email}. Profiles stay small on purpose: just enough for neighbors to recognize you.
      </p>
      <div className="mt-6">
        <AvatarField name={me.name} image={me.image} />
      </div>
      <div className="mt-6">
        <ProfileForm initial={{ name: me.name, bio: me.bio, place: me.place }} />
      </div>
      <div className="mt-10 border-t border-line pt-6">
        <DigestForm initial={prefs.emailDigest} />
      </div>
      <div className="mt-8">
        <AnnouncementEmailsForm initial={announcementEmails} />
      </div>
      <div id="notifications" className="mt-8 scroll-mt-20">
        <NotificationSettingsForm muted={prefs.mutedNotifications} />
      </div>
      <div className="mt-10 border-t border-line pt-6">
        <SignOutButton />
      </div>
    </div>
  );
}
