import { TRPCError } from "@trpc/server";
import { notFound } from "next/navigation";
import { cache } from "react";
import { serverApi } from "@/server/api";

/** The group, the viewer's membership and permissions. Cached per request, so the layout and the tab share one load. */
export const loadGroup = cache(async (slug: string) => {
  const api = await serverApi();
  try {
    return await api.group.bySlug({ slug });
  } catch (e) {
    if (e instanceof TRPCError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
});
