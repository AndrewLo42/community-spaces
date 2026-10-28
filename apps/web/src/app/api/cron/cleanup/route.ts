import { deleteUnusedUploads } from "@cs/api";
import { db } from "@/server/db";
import { storage } from "@/server/storage";

// Daily (apps/web/vercel.json): deletes photos that were uploaded but never
// attached to a post, banner or avatar, e.g. a draft that was never posted.

const TIME_BUDGET_MS = 45_000;

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const started = Date.now();
  const now = new Date();
  let deleted = 0;
  while (Date.now() - started < TIME_BUDGET_MS) {
    const batch = await deleteUnusedUploads(db, storage, now);
    deleted += batch;
    if (batch === 0) break;
  }
  return Response.json({ deleted });
}
