import { timeAgo } from "@/lib/time";
import { Avatar } from "./avatar";

export interface AnnouncementItem {
  id: string;
  body: string;
  createdAt: Date;
  recipientCount: number;
  authorId: string | null;
  authorName: string | null;
  authorImage: string | null;
}

/** Announcements or event updates, set apart from ordinary posts by an accent rule. */
export function AnnouncementList({
  title,
  items,
  viewerId,
}: {
  title: string;
  items: AnnouncementItem[];
  viewerId: string | null;
}) {
  if (items.length === 0) return null;
  return (
    <section aria-label={title} className="space-y-3">
      <h2 className="text-xs font-medium uppercase tracking-wide text-accent">{title}</h2>
      {items.map((a) => (
        <article key={a.id} className="rounded-xl border border-accent/40 bg-accent/5 p-4">
          <div className="flex items-center gap-2 text-sm">
            <Avatar name={a.authorName} image={a.authorImage} size="sm" />
            <span className="font-medium">{a.authorName || "Organizer"}</span>
            <span className="text-xs text-muted">
              {timeAgo(a.createdAt)}
              {/* Only the sender needs to know how far it went. */}
              {viewerId && viewerId === a.authorId ? ` · sent to ${a.recipientCount}` : ""}
            </span>
          </div>
          <p className="mt-2 whitespace-pre-line break-words text-sm leading-relaxed">{a.body}</p>
        </article>
      ))}
    </section>
  );
}
