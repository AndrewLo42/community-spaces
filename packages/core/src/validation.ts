import { z } from "zod";
import {
  COMMENT_POLICIES,
  EMAIL_DIGEST_OPTIONS,
  GROUP_ACCENTS,
  GROUP_VISIBILITIES,
  IMAGE_CONTENT_TYPES,
  JOIN_POLICIES,
  MAX_IMAGE_BYTES,
  MAX_POST_IMAGES,
  MEMBER_ROLES,
  POST_POLICIES,
  REPORT_REASONS,
  REPORT_TARGETS,
  UPLOAD_PURPOSES,
  type MemberRole,
} from "./constants";
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
    /** null = no location (online groups). */
    placeId: placeIdSchema.nullable().default(null),
  })
  .refine((g) => g.visibility !== "hidden" || g.joinPolicy === "invite", {
    message: "Hidden groups can only be joined by invite",
    path: ["joinPolicy"],
  });

export const createGroupInput = groupSettingsInput.and(z.object({ slug: slugSchema }));
export type CreateGroupInput = z.infer<typeof createGroupInput>;

export const discoverGroupsInput = z.object({
  /** Words to search for; any "#hashtag" in it is a filter instead (see parseSearch). */
  query: z.string().trim().max(200).optional(),
  /** Only groups within `radius` miles of this place, nearest first. */
  near: placeIdSchema.optional(),
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

export const createCommentInput = z.object({
  postId: z.string().min(1),
  parentId: z.string().min(1).optional(),
  body: z.string().trim().min(1, "Write a comment first").max(4000),
});

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
  z.object({ modQueueGroupId: z.string().min(1) }),
]);
export const markReadInput = z.object({ ids: z.array(z.string().min(1)).min(1).max(100) });
export const updatePreferencesInput = z.object({ emailDigest: z.enum(EMAIL_DIGEST_OPTIONS) });
export const inviteIdInput = groupIdInput.extend({ inviteId: z.string().min(1) });
