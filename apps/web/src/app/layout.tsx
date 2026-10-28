import type { Metadata } from "next";
import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";
import { ButtonLink } from "@/components/ui";
import { getSessionUser } from "@/server/auth";
import { Providers } from "@/trpc/client";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Community Spaces", template: "%s · Community Spaces" },
  description: "A calm home for local communities.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();

  return (
    <html lang="en">
      <body className="min-h-screen font-sans">
        <Providers>
          <header className="border-b border-line bg-surface">
            <nav className="mx-auto flex max-w-5xl items-center gap-1 px-4 py-3">
              <Link href="/" className="mr-2 whitespace-nowrap font-serif text-lg font-semibold tracking-tight sm:mr-4">
                Community Spaces
              </Link>
              <ButtonLink href="/discover" variant="ghost">
                Discover
              </ButtonLink>
              <div className="ml-auto flex items-center gap-1">
                {user ? (
                  <>
                    <span className="hidden sm:contents">
                      <ButtonLink href="/groups/new" variant="ghost">
                        New group
                      </ButtonLink>
                    </span>
                    <ButtonLink href="/profile" variant="ghost" className="max-w-40 truncate">
                      {user.name || "Profile"}
                    </ButtonLink>
                    <span className="hidden sm:contents">
                      <SignOutButton />
                    </span>
                  </>
                ) : (
                  <ButtonLink href="/sign-in">Sign in</ButtonLink>
                )}
              </div>
            </nav>
          </header>
          <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
