"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

/** Posts | Events under the group header. */
export function GroupTabs({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/g/${slug}`;
  const tabs = [
    { href: base, label: "Posts", active: pathname === base },
    { href: `${base}/events`, label: "Events", active: pathname.startsWith(`${base}/events`) },
  ];

  return (
    <nav aria-label="Group sections" className="flex gap-1 border-b border-line">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? "page" : undefined}
          className={cx(
            "-mb-px border-b-2 px-4 py-2.5 text-sm",
            t.active ? "border-accent font-medium text-fg" : "border-transparent text-muted hover:text-fg",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
