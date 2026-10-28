"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

const signedInLinks = [
  { href: "/", label: "Home" },
  { href: "/groups", label: "My groups" },
  { href: "/discover", label: "Discover" },
];
const signedOutLinks = [{ href: "/discover", label: "Discover" }];

/** "/groups/new" is its own page, not part of My groups. */
function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/groups") return pathname === "/groups";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The main sections. `inline` sits in the top bar (desktop, and signed-out
 * phones); `tabs` is the row under the header on signed-in phones.
 */
export function MainNav({ signedIn, variant }: { signedIn: boolean; variant: "inline" | "tabs" }) {
  const pathname = usePathname();
  // On desktop the logo already goes home, so "Home" only appears as a phone tab.
  const links = signedIn ? (variant === "tabs" ? signedInLinks : signedInLinks.slice(1)) : signedOutLinks;

  if (variant === "tabs") {
    return (
      <nav aria-label="Main" className="mx-auto flex max-w-5xl px-2">
        {links.map((l) => {
          const active = isActive(pathname, l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "-mb-px flex-1 border-b-2 py-2.5 text-center text-sm",
                active ? "border-accent font-medium text-fg" : "border-transparent text-muted",
              )}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav aria-label="Main" className="flex items-center gap-1">
      {links.map((l) => {
        const active = isActive(pathname, l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "rounded-lg px-3 py-2 text-sm font-medium transition",
              active ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
