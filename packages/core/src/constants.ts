// Single source of truth for enum values. The database enums, validation
// schemas and permission checks are all built from these lists.

/** Ordered lowest → highest. Rank comparisons depend on this order. */
export const MEMBER_ROLES = ["member", "moderator", "admin", "owner"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const MEMBERSHIP_STATUSES = ["active", "pending", "banned"] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

/**
 * public  – anyone can find the group and read its posts
 * private – anyone can find the group; only members can read posts
 * hidden  – not listed anywhere; members only, invite-only
 */
export const GROUP_VISIBILITIES = ["public", "private", "hidden"] as const;
export type GroupVisibility = (typeof GROUP_VISIBILITIES)[number];

/** open – join instantly · request – admins approve · invite – invite link only */
export const JOIN_POLICIES = ["open", "request", "invite"] as const;
export type JoinPolicy = (typeof JOIN_POLICIES)[number];

/**
 * members  – any member can post
 * approval – members can post, but posts wait in the mod queue
 * admins   – only admins and the owner can post (announcement groups)
 */
export const POST_POLICIES = ["members", "approval", "admins"] as const;
export type PostPolicy = (typeof POST_POLICIES)[number];

export const COMMENT_POLICIES = ["members", "admins"] as const;
export type CommentPolicy = (typeof COMMENT_POLICIES)[number];

export const POST_STATUSES = ["published", "pending", "removed"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const COMMENT_STATUSES = ["visible", "removed"] as const;
export type CommentStatus = (typeof COMMENT_STATUSES)[number];

export const REPORT_TARGETS = ["post", "comment"] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];

export const REPORT_STATUSES = ["open", "resolved", "dismissed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const GROUP_CATEGORIES = [
  "neighborhood",
  "hobbies",
  "sports",
  "arts",
  "parents",
  "volunteering",
  "education",
  "faith",
  "local-business",
  "other",
] as const;
export type GroupCategory = (typeof GROUP_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<GroupCategory, string> = {
  neighborhood: "Neighborhood",
  hobbies: "Hobbies",
  sports: "Sports & fitness",
  arts: "Arts & culture",
  parents: "Parents & families",
  volunteering: "Volunteering",
  education: "Learning",
  faith: "Faith",
  "local-business": "Local business",
  other: "Other",
};

/** Accent swatches an owner can pick for their group. */
export const GROUP_ACCENTS = [
  "#2f6f5e", // pine
  "#3b5b92", // lake
  "#8a4b2f", // clay
  "#6b4f8a", // plum
  "#9a6b12", // ochre
  "#4a5560", // slate
] as const;

export const MAX_POST_IMAGES = 4;
/** Images are resized in the browser before upload; this is the hard cap. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 2000;
export const IMAGE_CONTENT_TYPES = ["image/webp", "image/jpeg", "image/png"] as const;
export type ImageContentType = (typeof IMAGE_CONTENT_TYPES)[number];
