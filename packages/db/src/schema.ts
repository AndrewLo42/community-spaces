import {
  COMMENT_POLICIES,
  COMMENT_STATUSES,
  EMAIL_DIGEST_OPTIONS,
  EVENT_POLICIES,
  INVITE_POLICIES,
  GROUP_VISIBILITIES,
  JOIN_POLICIES,
  MEMBER_ROLES,
  MEMBERSHIP_STATUSES,
  NOTIFICATION_TYPES,
  POST_POLICIES,
  POST_STATUSES,
  REPORT_STATUSES,
  REPORT_TARGETS,
  RSVP_STATUSES,
} from "@cs/core";
import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
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

// ─── Places ──────────────────────────────────────────────────────────────────

/**
 * US cities and towns (GeoNames "cities1000", CC BY 4.0), loaded by
 * `pnpm db:places`. Groups and users point at a place, so search can match
 * by name and by distance without any outside service.
 */
export const places = pgTable(
  "places",
  {
    /** The GeoNames id, so reloading the list updates rows in place. */
    id: integer("id").primaryKey(),
    name: text("name").notNull(),
    asciiName: text("ascii_name").notNull(),
    /** Two-letter state code, e.g. "OR". */
    state: text("state").notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    population: integer("population").notNull().default(0),
  },
  (t) => [
    // Prefix search: lower(ascii_name) LIKE 'port%'
    index("places_name_prefix_idx").using("btree", sql`lower(${t.asciiName}) text_pattern_ops`),
    index("places_lat_lng_idx").on(t.lat, t.lng),
  ],
);

// ─── Auth (shape required by Better Auth) ────────────────────────────────────

export const emailDigest = pgEnum("email_digest", EMAIL_DIGEST_OPTIONS);

export const users = pgTable("users", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  /** Public URL (Better Auth's field); imageKey is the stored object behind it, if we host it. */
  image: text("image"),
  imageKey: text("image_key"),
  /** Hometown, shown next to the user's name. Optional. */
  placeId: integer("place_id").references(() => places.id, { onDelete: "set null" }),
  bio: text("bio").notNull().default(""),
  /** Opt-in: nobody gets summary emails until they choose daily or weekly. */
  emailDigest: emailDigest("email_digest").notNull().default("off"),
  /** Notification settings (keys of NOTIFICATION_SETTINGS) this person turned off in the app. */
  mutedNotifications: text("muted_notifications").array().notNull().default(sql`'{}'::text[]`),
  /** When this user's digest window last closed (sent, or checked with nothing to say). */
  lastDigestAt: timestamp("last_digest_at", { withTimezone: true }),
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

/**
 * Better Auth's request counters. Kept in the database rather than memory so
 * the limits hold across serverless instances.
 */
export const rateLimits = pgTable("rate_limits", {
  id: id(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

// ─── Communities ─────────────────────────────────────────────────────────────

export const memberRole = pgEnum("member_role", MEMBER_ROLES);
export const membershipStatus = pgEnum("membership_status", MEMBERSHIP_STATUSES);
export const groupVisibility = pgEnum("group_visibility", GROUP_VISIBILITIES);
export const joinPolicy = pgEnum("join_policy", JOIN_POLICIES);
export const postPolicy = pgEnum("post_policy", POST_POLICIES);
export const commentPolicy = pgEnum("comment_policy", COMMENT_POLICIES);
export const eventPolicy = pgEnum("event_policy", EVENT_POLICIES);
export const invitePolicy = pgEnum("invite_policy", INVITE_POLICIES);
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
    /** Owner-chosen hashtags, stored normalized without the "#" (see core/tags.ts). */
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    accentColor: text("accent_color").notNull(),
    bannerKey: text("banner_key"),
    visibility: groupVisibility("visibility").notNull().default("public"),
    joinPolicy: joinPolicy("join_policy").notNull().default("open"),
    postPolicy: postPolicy("post_policy").notNull().default("members"),
    commentPolicy: commentPolicy("comment_policy").notNull().default("members"),
    eventPolicy: eventPolicy("event_policy").notNull().default("members"),
    invitePolicy: invitePolicy("invite_policy").notNull().default("admins"),
    // Denormalized so discovery and group headers never COUNT(*).
    memberCount: integer("member_count").notNull().default(0),
    createdById: text("created_by_id").references(() => users.id, { onDelete: "set null" }),
    /** Where the group meets. Optional: online-only groups leave it empty. */
    placeId: integer("place_id").references(() => places.id, { onDelete: "set null" }),
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      sql`setweight(to_tsvector('english', coalesce("name", '')), 'A') || setweight(to_tsvector('english', coalesce("description", '')), 'B')`,
    ),
    ...timestamps,
  },
  (t) => [
    index("groups_search_idx").using("gin", t.searchVector),
    // tags @> ARRAY['gardening'] for the Discover tag filter
    index("groups_tags_idx").using("gin", t.tags),
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
    /** Whether announcements from this group also arrive by email. In-app notices always arrive. */
    announcementEmails: boolean("announcement_emails").notNull().default(true),
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

/**
 * Comments on a post or on an event (exactly one of the two). Events are
 * declared further down, so their reference is lazy.
 */
export const comments = pgTable(
  "comments",
  {
    id: id(),
    postId: text("post_id").references(() => posts.id, { onDelete: "cascade" }),
    eventId: text("event_id").references((): AnyPgColumn => events.id, { onDelete: "cascade" }),
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
  (t) => [
    index("comments_post_idx").on(t.postId, t.createdAt),
    index("comments_event_idx").on(t.eventId, t.createdAt),
    check("comments_one_thread", sql`num_nonnulls(${t.postId}, ${t.eventId}) = 1`),
  ],
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
    details: text("details").notNull().default(""),
    status: reportStatus("status").notNull().default("open"),
    resolvedById: text("resolved_by_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("reports_group_status_idx").on(t.groupId, t.status, t.createdAt),
    index("reports_target_idx").on(t.targetType, t.targetId, t.status),
  ],
);

export const rsvpStatus = pgEnum("rsvp_status", RSVP_STATUSES);

/**
 * Meetups on a group's calendar. Times are instants; `timeZone` is the IANA
 * zone they were planned in, which is how they're always displayed.
 * Cancelling keeps the row so the history (and who planned to come) stays.
 */
export const events = pgTable(
  "events",
  {
    id: id(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    createdById: text("created_by_id").references(() => users.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    timeZone: text("time_zone").notNull(),
    location: text("location").notNull().default(""),
    link: text("link").notNull().default(""),
    /** Spots for "going"; null = no limit. */
    capacity: integer("capacity"),
    // Denormalized so event lists never COUNT(*).
    goingCount: integer("going_count").notNull().default(0),
    maybeCount: integer("maybe_count").notNull().default(0),
    commentCount: integer("comment_count").notNull().default(0),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    /**
     * Lets people outside a private or secret group open the event with
     * /e/[id]?s=code. null = members only. Turning it off and on again makes
     * a new code, so old links stop working.
     */
    shareCode: text("share_code").unique(),
    /** Whether that shared page shows the address and online link. */
    shareLocation: boolean("share_location").notNull().default(true),
    /** When attendees were reminded. Cleared if the event moves, so they hear about the new time. */
    remindedAt: timestamp("reminded_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("events_group_starts_idx").on(t.groupId, t.startsAt),
    index("events_reminder_due_idx").on(t.startsAt).where(sql`${t.remindedAt} is null and ${t.cancelledAt} is null`),
  ],
);

export const eventRsvps = pgTable(
  "event_rsvps",
  {
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: rsvpStatus("status").notNull(),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.eventId, t.userId] }), index("event_rsvps_user_idx").on(t.userId)],
);

/**
 * A message from a group's admins to every member, or from an event's
 * organizer to the people going. Each one notifies and emails its audience
 * once, when sent; the row is what shows on the group or event page after.
 */
export const announcements = pgTable(
  "announcements",
  {
    id: id(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    /** Set for event updates; null for group-wide announcements. */
    eventId: text("event_id").references(() => events.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    /** How many people it reached when sent, shown to whoever sent it. */
    recipientCount: integer("recipient_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("announcements_group_idx").on(t.groupId, t.createdAt), index("announcements_event_idx").on(t.eventId, t.createdAt)],
);

/**
 * A question for a group's members or an event's attendees. Votes are counted
 * on the options so a poll renders without COUNT(*); who voted for what is
 * only ever used to show each viewer their own answer.
 */
export const polls = pgTable(
  "polls",
  {
    id: id(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    /** Set for event polls; null for group-wide ones. */
    eventId: text("event_id").references(() => events.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => users.id, { onDelete: "set null" }),
    question: text("question").notNull(),
    /** Whether each voter may pick more than one option. */
    multiple: boolean("multiple").notNull().default(false),
    voterCount: integer("voter_count").notNull().default(0),
    /** When it closes by itself; null = open until closed by hand. */
    closesAt: timestamp("closes_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("polls_group_idx").on(t.groupId, t.createdAt), index("polls_event_idx").on(t.eventId, t.createdAt)],
);

export const pollOptions = pgTable(
  "poll_options",
  {
    id: id(),
    pollId: text("poll_id")
      .notNull()
      .references(() => polls.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    position: integer("position").notNull(),
    voteCount: integer("vote_count").notNull().default(0),
  },
  (t) => [index("poll_options_poll_idx").on(t.pollId, t.position)],
);

export const pollVotes = pgTable(
  "poll_votes",
  {
    pollId: text("poll_id")
      .notNull()
      .references(() => polls.id, { onDelete: "cascade" }),
    optionId: text("option_id")
      .notNull()
      .references(() => pollOptions.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.optionId, t.userId] }), index("poll_votes_poll_user_idx").on(t.pollId, t.userId)],
);

/** Shareable join links. The only way into invite-only and hidden groups. */
export const invites = pgTable(
  "invites",
  {
    id: id(),
    code: text("code").notNull().unique(),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    createdById: text("created_by_id").references(() => users.id, { onDelete: "set null" }),
    uses: integer("uses").notNull().default(0),
    maxUses: integer("max_uses"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("invites_group_idx").on(t.groupId)],
);

/**
 * Every file a browser uploads gets a row when its upload URL is issued.
 * Attaching it to a post, banner or avatar sets attachedAt; anything still
 * unattached after a day is deleted by the cleanup cron.
 */
export const uploads = pgTable(
  "uploads",
  {
    key: text("key").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(),
    size: integer("size").notNull(),
    attachedAt: timestamp("attached_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("uploads_unattached_idx").on(t.createdAt).where(sql`${t.attachedAt} is null`)],
);

export const notificationType = pgEnum("notification_type", NOTIFICATION_TYPES);

/**
 * Similar events coalesce into one unread row via `groupKey`
 * ("comment:<postId>", "modqueue:<groupId>"…), so three comments on your post
 * are one notification: "Maria and 2 others commented". Once read, the next
 * event starts a fresh row.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: notificationType("type").notNull(),
    groupKey: text("group_key").notNull(),
    groupId: text("group_id").references(() => groups.id, { onDelete: "cascade" }),
    postId: text("post_id").references(() => posts.id, { onDelete: "cascade" }),
    eventId: text("event_id").references((): AnyPgColumn => events.id, { onDelete: "cascade" }),
    /** Most recent actor, plus everyone who contributed to this row. */
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorIds: text("actor_ids").array().notNull().default(sql`'{}'::text[]`),
    data: jsonb("data").$type<Record<string, string>>(),
    readAt: timestamp("read_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("notifications_user_recent_idx").on(t.userId, t.updatedAt.desc()),
    uniqueIndex("notifications_unread_key_idx")
      .on(t.userId, t.groupKey)
      .where(sql`${t.readAt} is null`),
  ],
);

// ─── Relations (for db.query.*) ──────────────────────────────────────────────

export const usersRelations = relations(users, ({ many, one }) => ({
  place: one(places, { fields: [users.placeId], references: [places.id] }),
  memberships: many(memberships),
  posts: many(posts),
}));

export const groupsRelations = relations(groups, ({ many, one }) => ({
  place: one(places, { fields: [groups.placeId], references: [places.id] }),
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
  event: one(events, { fields: [comments.eventId], references: [events.id] }),
  author: one(users, { fields: [comments.authorId], references: [users.id] }),
}));
