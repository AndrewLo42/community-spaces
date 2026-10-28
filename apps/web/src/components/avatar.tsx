import { cx } from "./ui";

export function Avatar({
  name,
  image,
  size = "md",
}: {
  name: string | null | undefined;
  image?: string | null;
  size?: "sm" | "md";
}) {
  const initials =
    (name ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]!.toUpperCase())
      .join("") || "?";
  const sizing = size === "sm" ? "size-7 text-[11px]" : "size-9 text-xs";

  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt="" className={cx("shrink-0 rounded-full object-cover", sizing)} />;
  }
  return (
    <span
      aria-hidden
      className={cx("inline-flex shrink-0 items-center justify-center rounded-full bg-surface-2 font-semibold text-muted", sizing)}
    >
      {initials}
    </span>
  );
}
