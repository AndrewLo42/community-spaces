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
/** What people see. "hidden" is shown as Secret; the stored value stays "hidden". */
export const GROUP_VISIBILITY_LABELS: Record<GroupVisibility, string> = {
  public: "Public",
  private: "Private",
  hidden: "Secret",
};

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

/** Who can put events on the group's calendar. admins – admins and the owner. */
export const EVENT_POLICIES = ["members", "admins"] as const;
export type EventPolicy = (typeof EVENT_POLICIES)[number];

/** Who can make invite links. admins – admins and the owner (who can also see and revoke every link). */
export const INVITE_POLICIES = ["admins", "members"] as const;
export type InvitePolicy = (typeof INVITE_POLICIES)[number];
/** Live invite links one member can hold in a group at once. */
export const MAX_ACTIVE_INVITES_PER_MEMBER = 10;

export const RSVP_STATUSES = ["going", "maybe", "not_going"] as const;
export type RsvpStatus = (typeof RSVP_STATUSES)[number];

export const RSVP_LABELS: Record<RsvpStatus, string> = {
  going: "Going",
  maybe: "Maybe",
  not_going: "Can't go",
};

export const POST_STATUSES = ["published", "pending", "removed"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

export const COMMENT_STATUSES = ["visible", "removed"] as const;
export type CommentStatus = (typeof COMMENT_STATUSES)[number];

export const REPORT_TARGETS = ["post", "comment"] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];

export const REPORT_STATUSES = ["open", "resolved", "dismissed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_REASONS = ["spam", "harassment", "inappropriate", "off-topic", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  spam: "Spam or advertising",
  harassment: "Harassment or hate",
  inappropriate: "Inappropriate content",
  "off-topic": "Off-topic for this group",
  other: "Something else",
};

/**
 * Notifications are only for things addressed to you. New posts in your groups
 * show up in the home feed and the email digest, never as notifications.
 */
export const NOTIFICATION_TYPES = [
  "comment", // on your post
  "event_comment", // on an event you planned
  "reply", // to your comment
  "post_approved",
  "post_declined",
  "request_approved",
  "role_changed",
  "mod_queue", // moderators: requests, pending posts or reports to look at
  "announcement", // from a group's admins, or an event's organizer to its attendees
  "poll", // a new poll for you to answer
  "event_reminder", // an event you said you'd come to is coming up
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Announcements notify and email everyone, so each group or event gets a few a day at most. */
export const MAX_ANNOUNCEMENTS_PER_DAY = 3;
export const MAX_ANNOUNCEMENT_LENGTH = 2000;

/** Polls notify their whole audience too, so they share the same kind of daily cap. */
export const MAX_POLLS_PER_DAY = 3;
export const MIN_POLL_OPTIONS = 2;
export const MAX_POLL_OPTIONS = 6;
export const MAX_POLL_QUESTION_LENGTH = 200;
export const MAX_POLL_OPTION_LENGTH = 80;
/** How long a poll stays open, in days; null means until someone closes it. */
export const POLL_DURATIONS_DAYS = [1, 3, 7] as const;

export const EMAIL_DIGEST_OPTIONS = ["daily", "weekly", "off"] as const;
export type EmailDigest = (typeof EMAIL_DIGEST_OPTIONS)[number];

export const ROLE_LABELS: Record<MemberRole, string> = {
  member: "Member",
  moderator: "Moderator",
  admin: "Admin",
  owner: "Owner",
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
/** What an upload is for; it decides the storage folder and how the image is prepared. */
export const UPLOAD_PURPOSES = ["post", "banner", "avatar"] as const;
export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];
/** Avatars are cropped square to this many pixels. */
export const AVATAR_SIZE = 512;
/** Uploads never attached to anything are deleted after this long. */
export const UNUSED_UPLOAD_TTL_MS = 24 * 3_600_000;
export type ImageContentType = (typeof IMAGE_CONTENT_TYPES)[number];
