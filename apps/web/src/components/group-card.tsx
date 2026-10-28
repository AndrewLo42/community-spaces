import { CATEGORY_LABELS, type GroupCategory } from "@cs/core";
import Link from "next/link";

export interface GroupCardData {
  slug: string;
  name: string;
  description: string;
  category: string;
  accentColor: string;
  bannerUrl: string | null;
  visibility: "public" | "private" | "hidden";
  memberCount: number;
}

export function GroupCard({
  group,
  footer,
}: {
  group: GroupCardData;
  /** Extra line under the details, e.g. your role and the group's last activity. */
  footer?: React.ReactNode;
}) {
  return (
    <Link
      href={`/g/${group.slug}`}
      className="group block overflow-hidden rounded-xl border border-line bg-surface transition hover:border-muted/50"
    >
      {group.bannerUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={group.bannerUrl} alt="" loading="lazy" className="h-24 w-full object-cover" />
      ) : (
        <div className="h-2" style={{ background: group.accentColor }} />
      )}
      <div className="space-y-2 p-4">
        <h3 className="font-serif text-lg font-semibold leading-snug group-hover:underline">{group.name}</h3>
        <p className="line-clamp-2 text-sm text-muted">{group.description || "No description yet."}</p>
        <p className="text-xs text-muted">
          {CATEGORY_LABELS[group.category as GroupCategory] ?? group.category} ·{" "}
          {group.memberCount} {group.memberCount === 1 ? "member" : "members"}
          {group.visibility === "private" ? " · Private" : ""}
        </p>
        {footer ? <div className="border-t border-line pt-2 text-xs text-muted">{footer}</div> : null}
      </div>
    </Link>
  );
}
