import type { Metadata } from "next";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { MainNav } from "@/components/main-nav";
import { NotificationBell } from "@/components/notification-bell";
import { SignOutButton } from "@/components/sign-out-button";
import { ButtonLink } from "@/components/ui";
import { serverApi } from "@/server/api";
import { getSessionUser } from "@/server/auth";
import { Providers } from "@/trpc/client";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Community Spaces", template: "%s · Community Spaces" },
  description: "A calm home for local communities.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  const unread = user ? await (await serverApi()).notification.unreadCount() : 0;

  return (
    <html lang="en">
      <body className="min-h-screen font-sans">
        <Providers>
          <header className="border-b border-line bg-surface">
            <div className="mx-auto flex max-w-5xl items-center gap-1 px-4 py-3">
              <Link href="/" className="mr-2 whitespace-nowrap font-serif text-lg font-semibold tracking-tight sm:mr-4">
                Community Spaces
              </Link>
              {/* Signed-in phones get the section tabs below instead. */}
              <div className={user ? "hidden sm:block" : undefined}>
                <MainNav signedIn={!!user} variant="inline" />
              </div>
              <div className="ml-auto flex items-center gap-1">
                {user ? (
                  <>
                    <NotificationBell initialCount={unread} />
                    <ButtonLink href="/profile" variant="ghost" className="px-2 sm:px-4">
                      <span className="sm:hidden">
                        <Avatar name={user.name || user.email} image={user.image} size="sm" />
                        <span className="sr-only">Your profile</span>
                      </span>
                      <span className="hidden max-w-40 truncate sm:inline">{user.name || "Profile"}</span>
                    </ButtonLink>
                    <span className="hidden sm:contents">
                      <SignOutButton />
                    </span>
                  </>
                ) : (
                  <ButtonLink href="/sign-in">Sign in</ButtonLink>
                )}
              </div>
            </div>
            {user ? (
              <div className="border-t border-line sm:hidden">
                <MainNav signedIn variant="tabs" />
              </div>
            ) : null}
          </header>
          <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
          <footer className="mx-auto max-w-5xl px-4 pb-8 pt-4 text-xs text-muted">
            Town data from{" "}
            <a href="https://www.geonames.org/" className="underline hover:text-fg" rel="noreferrer">
              GeoNames
            </a>
            , licensed{" "}
            <a href="https://creativecommons.org/licenses/by/4.0/" className="underline hover:text-fg" rel="noreferrer">
              CC BY 4.0
            </a>
            .
          </footer>
        </Providers>
      </body>
    </html>
  );
}
