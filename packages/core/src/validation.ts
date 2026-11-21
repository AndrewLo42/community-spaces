import { z } from "zod";
import {
  COMMENT_POLICIES,
  EMAIL_DIGEST_OPTIONS,
  EVENT_POLICIES,
  INVITE_POLICIES,
  GROUP_ACCENTS,
  GROUP_VISIBILITIES,
  IMAGE_CONTENT_TYPES,
  JOIN_POLICIES,
  MAX_ANNOUNCEMENT_LENGTH,
  MAX_POLL_OPTION_LENGTH,
  MAX_POLL_OPTIONS,
  MAX_POLL_QUESTION_LENGTH,
  MIN_POLL_OPTIONS,
  POLL_DURATIONS_DAYS,
  MAX_IMAGE_BYTES,
  MAX_POST_IMAGES,
  MEMBER_ROLES,
  POST_POLICIES,
  REPORT_REASONS,
  REPORT_TARGETS,
  RSVP_STATUSES,
  UPLOAD_PURPOSES,
  type MemberRole,
} from "./constants";
import { isValidTimeZone, MAX_EVENT_CAPACITY, zonedTimeToUtc } from "./events";
import { DEFAULT_RADIUS_MILES, RADIUS_OPTIONS_MILES, type RadiusMiles } from "./places";
import { cleanTags, MAX_GROUP_TAGS, MAX_TAG_LENGTH, normalizeTag } from "./tags";

export const slugSchema = z
  .string()
  .trim()
  .min(3, "At least 3 characters")
  .max(48, "At most 48 characters")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Lowercase letters, numbers and single dashes only");

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/, "");
}

export const placeIdSchema = z.number().int().positive();

export const tagsSchema = z
  .array(z.string().max(60))
  .max(MAX_GROUP_TAGS * 2)
  .default([])
  .transform(cleanTags);

export const tagSuggestInput = z.object({ prefix: z.string().trim().max(MAX_TAG_LENGTH + 1) });

export const groupSuggestInput = z.object({ query: z.string().trim().min(1).max(100) });

export const groupSettingsInput = z
  .object({
    name: z.string().trim().min(3, "At least 3 characters").max(80),
    description: z.string().trim().max(2000).default(""),
    rules: z.string().trim().max(4000).default(""),
    /** Hashtags in any spelling; stored normalized ("Trail Running" → "trail-running"). */
    tags: tagsSchema,
    accentColor: z.enum(GROUP_ACCENTS).default(GROUP_ACCENTS[0]),
    visibility: z.enum(GROUP_VISIBILITIES).default("public"),
    joinPolicy: z.enum(JOIN_POLICIES).default("open"),
    postPolicy: z.enum(POST_POLICIES).default("members"),
    commentPolicy: z.enum(COMMENT_POLICIES).default("members"),
    eventPolicy: z.enum(EVENT_POLICIES).default("members"),
    invitePolicy: z.enum(INVITE_POLICIES).default("admins"),
    /** null = no location (online groups). */
    placeId: placeIdSchema.nullable().default(null),
  })
  .refine((g) => g.visibility !== "hidden" || g.joinPolicy === "invite", {
    message: "Secret groups can only be joined by invite",
    path: ["joinPolicy"],
  });

export const createGroupInput = groupSettingsInput.and(z.object({ slug: slugSchema }));
export type CreateGroupInput = z.infer<typeof createGroupInput>;

export const discoverGroupsInput = z.object({
  /** Words to search for; any "#hashtag" in it is a filter instead (see parseSearch). */
  query: z.string().trim().max(200).optional(),
  /** Only groups within `radius` miles of this place, nearest first. */
  near: placeIdSchema.optional(),
  /** Only groups without a town, which are online-only. Ignored when `near` is set. */
  online: z.boolean().optional(),
  radius: z.union(RADIUS_OPTIONS_MILES.map((r) => z.literal(r)) as [z.ZodLiteral<RadiusMiles>, ...z.ZodLiteral<RadiusMiles>[]]).default(DEFAULT_RADIUS_MILES),
  cursor: z.number().int().min(0).default(0),
});

export const joinGroupInput = z.object({
  groupId: z.string().min(1),
  message: z.string().trim().max(500).optional(),
});

export const updateProfileInput = z.object({
  name: z.string().trim().min(1, "Tell people what to call you").max(60),
  bio: z.string().trim().max(280).default(""),
  /** Hometown, shown next to your name. null clears it; leaving it out keeps the current one. */
  placeId: placeIdSchema.nullable().optional(),
});

export const placeSearchInput = z.object({ query: z.string().trim().min(1).max(80) });

export const createUploadInput = z.object({
  purpose: z.enum(UPLOAD_PURPOSES).default("post"),
  contentType: z.enum(IMAGE_CONTENT_TYPES),
  size: z.number().int().positive().max(MAX_IMAGE_BYTES, "Image is too large"),
});

export const postImageInput = z.object({
  key: z.string().min(1).max(200),
  width: z.number().int().positive().max(10_000),
  height: z.number().int().positive().max(10_000),
});

export const createPostInput = z
  .object({
    groupId: z.string().min(1),
    body: z.string().trim().max(10_000).default(""),
    images: z.array(postImageInput).max(MAX_POST_IMAGES, `Up to ${MAX_POST_IMAGES} images`).default([]),
  })
  .refine((p) => p.body.length > 0 || p.images.length > 0, {
    message: "Write something or add a photo",
    path: ["body"],
  });
export type CreatePostInput = z.infer<typeof createPostInput>;

/** Opaque keyset cursor for feeds. */
export const feedInput = z.object({ cursor: z.string().max(200).optional() });
export const groupFeedInput = feedInput.extend({ groupId: z.string().min(1) });

export const postIdInput = z.object({ postId: z.string().min(1) });
export const postFlagInput = postIdInput.extend({ value: z.boolean() });
export const reviewPostInput = postIdInput.extend({ approve: z.boolean() });

/** Which discussion a comment belongs to: a post's or an event's. */
export const commentThreadInput = z.union([
  z.object({ postId: z.string().min(1) }),
  z.object({ eventId: z.string().min(1) }),
]);
export type CommentThreadRef = z.infer<typeof commentThreadInput>;

export const createCommentInput = commentThreadInput.and(
  z.object({
    parentId: z.string().min(1).optional(),
    body: z.string().trim().min(1, "Write a comment first").max(4000),
  }),
);

export const commentIdInput = z.object({ commentId: z.string().min(1) });

/** Editing changes the words only; a photo-only post may be left with no text. */
export const updatePostInput = postIdInput.extend({ body: z.string().trim().max(10_000) });
export const updateCommentInput = commentIdInput.extend({
  body: z.string().trim().min(1, "A comment can't be empty").max(4000),
});

// ─── Group management ────────────────────────────────────────────────────────

export const groupIdInput = z.object({ groupId: z.string().min(1) });
export const memberTargetInput = groupIdInput.extend({ userId: z.string().min(1) });
export const reviewRequestInput = memberTargetInput.extend({ approve: z.boolean() });
export const removeMemberInput = memberTargetInput.extend({ ban: z.boolean() });
/** Ownership moves through a separate transfer flow, never a role change. */
export const setRoleInput = memberTargetInput.extend({
  role: z.enum(MEMBER_ROLES.filter((r) => r !== "owner") as [MemberRole, ...MemberRole[]]),
});

export const membersInput = groupIdInput.extend({ query: z.string().trim().max(100).optional() });
/** null removes the image. */
export const setBannerInput = groupIdInput.extend({ key: z.string().min(1).max(200).nullable() });
export const setAvatarInput = z.object({ key: z.string().min(1).max(200).nullable() });

export const transferOwnershipInput = memberTargetInput;
/** The owner types the group's name to confirm, so a slip can't delete a community. */
export const deleteGroupInput = groupIdInput.extend({ confirmName: z.string() });

export const updateGroupInput = groupSettingsInput.and(groupIdInput);
export type UpdateGroupInput = z.infer<typeof updateGroupInput>;

export const createReportInput = z.object({
  targetType: z.enum(REPORT_TARGETS),
  targetId: z.string().min(1),
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(1000).default(""),
});

export const resolveReportInput = groupIdInput.extend({
  targetType: z.enum(REPORT_TARGETS),
  targetId: z.string().min(1),
  action: z.enum(["remove", "dismiss"]),
});

export const INVITE_EXPIRY_DAYS = [1, 7, 30] as const;
export const createInviteInput = groupIdInput.extend({
  /** null = never expires */
  expiresInDays: z.union([z.literal(1), z.literal(7), z.literal(30), z.null()]).default(7),
  maxUses: z.number().int().positive().max(1000).nullable().default(null),
});
export const inviteCodeInput = z.object({ code: z.string().trim().min(1).max(64) });

// ─── Notifications ───────────────────────────────────────────────────────────

export const notificationListInput = z.object({ cursor: z.string().max(200).optional() });
export const markSeenInput = z.union([
  z.object({ postId: z.string().min(1) }),
  z.object({ eventId: z.string().min(1) }),
  z.object({ modQueueGroupId: z.string().min(1) }),
]);
export const markReadInput = z.object({ ids: z.array(z.string().min(1)).min(1).max(100) });
export const updatePreferencesInput = z.object({ emailDigest: z.enum(EMAIL_DIGEST_OPTIONS) });
export const inviteIdInput = groupIdInput.extend({ inviteId: z.string().min(1) });

// ─── Events ──────────────────────────────────────────────────────────────────

const timeSchema = z.string().regex(/^\d{2}:\d{2}$/, "Pick a time");

/**
 * What the event form sends: a day and wall-clock times in the planner's time
 * zone, turned into instants here. An end time earlier than the start means
 * the event runs past midnight.
 */
export const eventFieldsInput = z
  .object({
    title: z.string().trim().min(3, "At least 3 characters").max(120),
    description: z.string().trim().max(5000).default(""),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
    startTime: timeSchema,
    endTime: timeSchema.or(z.literal("")).default(""),
    timeZone: z.string().refine(isValidTimeZone, "Unknown time zone"),
    /** Free text: "Riverside garden shed", "Powell's, 1005 W Burnside", "Online". */
    location: z.string().trim().max(200).default(""),
    /** A map, ticket or video-call link. */
    link: z
      .string()
      .trim()
      .max(500)
      .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), "Start the link with https://")
      .default(""),
    capacity: z.number().int().min(1, "At least 1").max(MAX_EVENT_CAPACITY).nullable().default(null),
  })
  .transform((e, ctx) => {
    const startsAt = zonedTimeToUtc(e.date, e.startTime, e.timeZone);
    if (!startsAt) {
      ctx.addIssue({ code: "custom", path: ["date"], message: "Pick a date" });
      return z.NEVER;
    }
    let endsAt = e.endTime ? zonedTimeToUtc(e.date, e.endTime, e.timeZone) : null;
    if (endsAt && endsAt <= startsAt) endsAt = new Date(endsAt.getTime() + 24 * 3_600_000);
    const { date: _date, startTime: _startTime, endTime: _endTime, ...rest } = e;
    return { ...rest, startsAt, endsAt };
  });

export const createEventInput = z.object({ groupId: z.string().min(1) }).and(eventFieldsInput);
export const updateEventInput = z.object({ eventId: z.string().min(1) }).and(eventFieldsInput);

export const listEventsInput = z.object({
  groupId: z.string().min(1),
  when: z.enum(["upcoming", "past"]).default("upcoming"),
  cursor: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(50).default(20),
});

export const rsvpInput = z.object({
  eventId: z.string().min(1),
  status: z.enum(RSVP_STATUSES),
  /** The event's share code, for someone outside a private group RSVPing from a shared link. */
  share: z.string().max(64).optional(),
});

// ─── Announcements ───────────────────────────────────────────────────────────

/** Who an announcement goes to: every member of a group, or the people coming to an event. */
export const announcementAudienceInput = z.union([
  z.object({ groupId: z.string().min(1) }),
  z.object({ eventId: z.string().min(1) }),
]);
export type AnnouncementAudience = z.infer<typeof announcementAudienceInput>;

export const createAnnouncementInput = announcementAudienceInput.and(
  z.object({ body: z.string().trim().min(1, "Write a message first").max(MAX_ANNOUNCEMENT_LENGTH) }),
);

export const setAnnouncementEmailsInput = z.object({ groupId: z.string().min(1), enabled: z.boolean() });

// ─── Polls ───────────────────────────────────────────────────────────────────

/** A group poll for every member, or an event poll for the people coming. Same audiences as announcements. */
export const createPollInput = announcementAudienceInput.and(
  z.object({
    question: z.string().trim().min(1, "Ask a question first").max(MAX_POLL_QUESTION_LENGTH),
    options: z
      .array(z.string().trim().max(MAX_POLL_OPTION_LENGTH))
      // Blank rows in the form are just unused slots.
      .transform((options) => options.filter(Boolean))
      .pipe(
        z
          .array(z.string())
          .min(MIN_POLL_OPTIONS, `Give at least ${MIN_POLL_OPTIONS} choices`)
          .max(MAX_POLL_OPTIONS, `At most ${MAX_POLL_OPTIONS} choices`)
          .refine((options) => new Set(options.map((o) => o.toLowerCase())).size === options.length, "Each choice must be different"),
      ),
    multiple: z.boolean().default(false),
    closesInDays: z
      .number()
      .refine((d) => (POLL_DURATIONS_DAYS as readonly number[]).includes(d))
      .nullable()
      .default(null),
  }),
);

/** The viewer's whole answer: one option, several if the poll allows, or none to take a vote back. */
export const votePollInput = z.object({
  pollId: z.string().min(1),
  optionIds: z.array(z.string().min(1)).max(MAX_POLL_OPTIONS),
});

export const pollIdInput = z.object({ pollId: z.string().min(1) });
