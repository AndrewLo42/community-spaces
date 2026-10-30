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
  eventId: string | null;
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
    case "event_comment":
      return n.data?.title ? `${actors(n)} commented on ${n.data.title}` : `${actors(n)} commented on your event`;
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
    case "announcement": {
      const snippet = n.data?.snippet ?? "";
      return n.data?.eventTitle ? `Update about ${n.data.eventTitle}: ${snippet}` : `${group}: ${snippet}`;
    }
  }
}

/** Where tapping the notification goes. */
export function notificationHref(n: Pick<NotificationSummary, "type" | "postId" | "eventId" | "groupSlug">): string {
  switch (n.type) {
    case "comment":
    case "event_comment":
    case "reply":
    case "post_approved":
      return n.postId ? `/p/${n.postId}` : n.eventId ? `/e/${n.eventId}` : "/";
    case "mod_queue":
      return n.groupSlug ? `/g/${n.groupSlug}/manage` : "/";
    case "announcement":
      return n.eventId ? `/e/${n.eventId}` : n.groupSlug ? `/g/${n.groupSlug}` : "/";
    default:
      return n.groupSlug ? `/g/${n.groupSlug}` : "/";
  }
}

/** The first line of a message, cut to fit a notification or subject line. */
export function messageSnippet(body: string, max = 80): string {
  const line = body.trim().split("\n")[0]!.trim();
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}
