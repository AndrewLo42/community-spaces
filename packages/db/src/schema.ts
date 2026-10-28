import {
  COMMENT_POLICIES,
  COMMENT_STATUSES,
  GROUP_VISIBILITIES,
  JOIN_POLICIES,
  MEMBER_ROLES,
  MEMBERSHIP_STATUSES,
  POST_POLICIES,
  POST_STATUSES,
  REPORT_STATUSES,
  REPORT_TARGETS,
} from "@cs/core";
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

const tsvector = customType<{ data: string }>({
  dataType: () => "tsvector",
});

// ─── Auth (shape required by Better Auth) ────────────────────────────────────

export const users = pgTable("users", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  bio: text("bio").notNull().default(""),
  ...timestamps,
});

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: id(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (t) => [index("accounts_user_idx").on(t.userId)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: id(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

// ─── Communities ─────────────────────────────────────────────────────────────

export const memberRole = pgEnum("member_role", MEMBER_ROLES);
export const membershipStatus = pgEnum("membership_status", MEMBERSHIP_STATUSES);
export const groupVisibility = pgEnum("group_visibility", GROUP_VISIBILITIES);
export const joinPolicy = pgEnum("join_policy", JOIN_POLICIES);
export const postPolicy = pgEnum("post_policy", POST_POLICIES);
export const commentPolicy = pgEnum("comment_policy", COMMENT_POLICIES);
export const postStatus = pgEnum("post_status", POST_STATUSES);
export const commentStatus = pgEnum("comment_status", COMMENT_STATUSES);
export const reportTarget = pgEnum("report_target", REPORT_TARGETS);
export const reportStatus = pgEnum("report_status", REPORT_STATUSES);

export const groups = pgTable(
  "groups",
  {
    id: id(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    rules: text("rules").notNull().default(""),
    category: text("category").notNull(),
    accentColor: text("accent_color").notNull(),
    bannerKey: text("banner_key"),
    visibility: groupVisibility("visibility").notNull().default("public"),
    joinPolicy: joinPolicy("join_policy").notNull().default("open"),
    postPolicy: postPolicy("post_policy").notNull().default("members"),
    commentPolicy: commentPolicy("comment_policy").notNull().default("members"),
    // Denormalized so discovery and group headers never COUNT(*).
    memberCount: integer("member_count").notNull().default(0),
    createdById: text("created_by_id").references(() => users.id, { onDelete: "set null" }),
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      sql`setweight(to_tsvector('english', coalesce("name", '')), 'A') || setweight(to_tsvector('english', coalesce("description", '')), 'B')`,
    ),
    ...timestamps,
  },
  (t) => [
    index("groups_search_idx").using("gin", t.searchVector),
    index("groups_discover_idx").on(t.visibility, t.memberCount.desc()),
  ],
);

/**
 * One row per (group, user). A join request is a row with status "pending";
 * a ban keeps the row with status "banned" so the user can't simply rejoin.
 */
export const memberships = pgTable(
  "memberships",
  {
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull().default("member"),
    status: membershipStatus("status").notNull().default("active"),
    requestMessage: text("request_message"),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.groupId, t.userId] }),
    index("memberships_user_idx").on(t.userId, t.status),
    index("memberships_group_status_idx").on(t.groupId, t.status),
  ],
);

export const posts = pgTable(
  "posts",
  {
    id: id(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    status: postStatus("status").notNull().default("published"),
    pinned: boolean("pinned").notNull().default(false),
    locked: boolean("locked").notNull().default(false),
    commentCount: integer("comment_count").notNull().default(0),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    // Millisecond precision so a JS Date round-trips exactly as a feed cursor.
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    updatedAt: timestamps.updatedAt,
  },
  (t) => [
    // Keyset pagination for a group feed: WHERE group_id = ? AND status = 'published'
    // ORDER BY created_at DESC, id DESC
    index("posts_group_feed_idx").on(t.groupId, t.status, t.createdAt.desc(), t.id.desc()),
    index("posts_author_idx").on(t.authorId),
  ],
);

export const postImages = pgTable(
  "post_images",
  {
    id: id(),
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    width: integer("width"),
    height: integer("height"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("post_images_post_idx").on(t.postId, t.position)],
);

export const comments = pgTable(
  "comments",
  {
    id: id(),
    postId: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** One level of threading: replies point at a top-level comment. */
    parentId: text("parent_id").references((): AnyPgColumn => comments.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    status: commentStatus("status").notNull().default("visible"),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("comments_post_idx").on(t.postId, t.createdAt)],
);

export const reports = pgTable(
  "reports",
  {
    id: id(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    reporterId: text("reporter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetType: reportTarget("target_type").notNull(),
    targetId: text("target_id").notNull(),
    reason: text("reason").notNull(),
    status: reportStatus("status").notNull().default("open"),
    resolvedById: text("resolved_by_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("reports_group_status_idx").on(t.groupId, t.status, t.createdAt)],
);

// ─── Relations (for db.query.*) ──────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(memberships),
  posts: many(posts),
}));

export const groupsRelations = relations(groups, ({ many, one }) => ({
  memberships: many(memberships),
  posts: many(posts),
  createdBy: one(users, { fields: [groups.createdById], references: [users.id] }),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  group: one(groups, { fields: [memberships.groupId], references: [groups.id] }),
  user: one(users, { fields: [memberships.userId], references: [users.id] }),
}));

export const postsRelations = relations(posts, ({ one, many }) => ({
  group: one(groups, { fields: [posts.groupId], references: [groups.id] }),
  author: one(users, { fields: [posts.authorId], references: [users.id] }),
  images: many(postImages),
  comments: many(comments),
}));

export const postImagesRelations = relations(postImages, ({ one }) => ({
  post: one(posts, { fields: [postImages.postId], references: [posts.id] }),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  post: one(posts, { fields: [comments.postId], references: [posts.id] }),
  author: one(users, { fields: [comments.authorId], references: [users.id] }),
}));
