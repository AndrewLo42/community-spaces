const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const dateFmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });
const dateYearFmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" });

/** "just now", "5 minutes ago", "yesterday", then a plain date after a week. */
export function timeAgo(date: Date, now = new Date()): string {
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return "just now";
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(seconds / 3600), "hour");
  if (abs < 7 * 86_400) return rtf.format(Math.round(seconds / 86_400), "day");
  return (date.getFullYear() === now.getFullYear() ? dateFmt : dateYearFmt).format(date);
}
