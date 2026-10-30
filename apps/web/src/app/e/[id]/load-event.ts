import { TRPCError } from "@trpc/server";
import { notFound } from "next/navigation";
import { cache } from "react";
import { serverApi } from "@/server/api";

export const loadEvent = cache(async (eventId: string) => {
  const api = await serverApi();
  try {
    return await api.event.byId({ eventId });
  } catch (e) {
    if (e instanceof TRPCError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
});
