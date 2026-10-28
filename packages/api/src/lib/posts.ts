import { can, canCommentOnPost, canRemoveContent, canReport, type PermissionContext } from "@cs/core";
import { and, desc, eq, lt, or, posts, type Db, type SQL } from "@cs/db";
import type { Storage } from "../storage";

export const FEED_PAGE_SIZE = 20;

/** Every post query returns the same shape, so feeds and detail pages render alike. */
export function findPosts(db: Db, where: SQL | undefined, limit?: number) {
  return db.query.posts.findMany({
    where,
    limit,
    orderBy: [desc(posts.createdAt), desc(posts.id)],
    with: {
      author: { columns: { id: true, name: true, image: true } },
      images: {
        columns: { storageKey: true, width: true, height: true },
        orderBy: (t, { asc }) => [asc(t.position)],
      },
      group: {
        columns: {
          id: true,
          slug: true,
          name: true,
          accentColor: true,
          visibility: true,
          joinPolicy: true,
          postPolicy: true,
          commentPolicy: true,
        },
      },
    },
  });
}

type PostRow = Awaited<ReturnType<typeof findPosts>>[number];

export function toPostView(row: PostRow, ctx: PermissionContext, storage: Storage) {
  return {
    id: row.id,
    body: row.body,
    status: row.status,
    pinned: row.pinned,
    locked: row.locked,
    commentCount: row.commentCount,
    createdAt: row.createdAt,
    editedAt: row.editedAt,
    author: row.author,
    group: { slug: row.group.slug, name: row.group.name, accentColor: row.group.accentColor },
    images: row.images.map((img) => ({
      url: storage.publicUrl(img.storageKey),
      width: img.width,
      height: img.height,
    })),
    viewer: {
      canRemove: canRemoveContent(ctx, row),
      canModerate: can(ctx, "post:moderate"),
      canComment: canCommentOnPost(ctx, row),
      canReport: row.status === "published" && canReport(ctx, row),
    },
  };
}
export type PostView = ReturnType<typeof toPostView>;

// ─── Keyset cursor: "<createdAt ISO>|<id>" ──────────────────────────────────

export function encodeCursor(row: { createdAt: Date; id: string }): string {
  return `${row.createdAt.toISOString()}|${row.id}`;
}

/** Rows strictly after the cursor in (createdAt DESC, id DESC) order. */
export function afterCursor(cursor: string | undefined): SQL | undefined {
  if (!cursor) return undefined;
  const [iso, id] = cursor.split("|");
  const createdAt = new Date(iso ?? "");
  if (!id || Number.isNaN(createdAt.getTime())) return undefined;
  return or(lt(posts.createdAt, createdAt), and(eq(posts.createdAt, createdAt), lt(posts.id, id)));
}

/** Fetches one extra row to know whether another page exists. */
export function paginate<T extends { createdAt: Date; id: string }>(rows: T[]) {
  const page = rows.slice(0, FEED_PAGE_SIZE);
  const last = page[page.length - 1];
  return { page, nextCursor: rows.length > FEED_PAGE_SIZE && last ? encodeCursor(last) : null };
}
