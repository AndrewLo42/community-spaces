import { TRPCError } from "@trpc/server";
import { notFound } from "next/navigation";
import { cache } from "react";
import { serverApi } from "@/server/api";

/** `share` is the ?s= code that lets people outside a private group see the event. */
export const loadEvent = cache(async (eventId: string, share?: string) => {
  const api = await serverApi();
  try {
    return await api.event.byId({ eventId, share: share || undefined });
  } catch (e) {
    if (e instanceof TRPCError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
});

/** The ?s= value from a page's search params, if it's a single string. */
export function shareParam(searchParams: Record<string, string | string[] | undefined>) {
  const s = searchParams.s;
  return typeof s === "string" && s.length <= 64 ? s : undefined;
}
