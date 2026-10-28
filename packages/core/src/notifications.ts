import { ROLE_LABELS, type MemberRole, type NotificationType } from "./constants";

// Wording and links for notifications, shared by the web UI and digest emails
// (and the mobile app later), so a notification reads the same everywhere.

export interface NotificationSummary {
  type: NotificationType;
  actorName: string | null;
  actorCount: number;
  groupName: string | null;
  groupSlug: string | null;
  postId: string | null;
  data: Record<string, string> | null;
}

function actors(n: NotificationSummary): string {
  const first = n.actorName || "Someone";
  const others = n.actorCount - 1;
  if (others <= 0) return first;
  return `${first} and ${others} ${others === 1 ? "other" : "others"}`;
}

export function describeNotification(n: NotificationSummary): string {
  const group = n.groupName ?? "a group";
  switch (n.type) {
    case "comment":
      return `${actors(n)} commented on your post`;
    case "reply":
      return `${actors(n)} replied to your comment`;
    case "post_approved":
      return `Your post in ${group} was approved`;
    case "post_declined":
      return `Your post in ${group} wasn't approved by the moderators`;
    case "request_approved":
      return `You're now a member of ${group}`;
    case "role_changed": {
      const role = n.data?.role as MemberRole | undefined;
      if (role === "owner") return `You're now the owner of ${group}`;
      return role && role !== "member"
        ? `You're now ${role === "admin" ? "an" : "a"} ${ROLE_LABELS[role].toLowerCase()} of ${group}`
        : `Your role in ${group} changed to member`;
    }
    case "mod_queue":
      return `${group} has new items to review`;
  }
}

/** Where tapping the notification goes. */
export function notificationHref(n: Pick<NotificationSummary, "type" | "postId" | "groupSlug">): string {
  switch (n.type) {
    case "comment":
    case "reply":
    case "post_approved":
      return n.postId ? `/p/${n.postId}` : "/";
    case "mod_queue":
      return n.groupSlug ? `/g/${n.groupSlug}/manage` : "/";
    default:
      return n.groupSlug ? `/g/${n.groupSlug}` : "/";
  }
}
