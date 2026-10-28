import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { UPLOAD_KEY_PATTERN, userUploadPrefix } from "@cs/api/storage";
import { MAX_IMAGE_BYTES } from "@cs/core";
import { auth } from "@/server/auth";
import { isR2Configured, localUploadDir } from "@/server/storage";

// Dev-only stand-in for R2: accepts the same direct PUT the client makes to a
// presigned URL, and serves the files back. Disabled once R2 is configured.

type Params = { params: Promise<{ key: string[] }> };

const contentTypes: Record<string, string> = { webp: "image/webp", jpg: "image/jpeg", png: "image/png" };

async function resolveKey(params: Params["params"]) {
  const key = (await params).key.join("/");
  return UPLOAD_KEY_PATTERN.test(key) ? key : null;
}

export async function PUT(req: Request, { params }: Params) {
  if (isR2Configured) return new Response("Not found", { status: 404 });
  const key = await resolveKey(params);
  if (!key) return new Response("Bad key", { status: 400 });

  const session = await auth.api.getSession({ headers: req.headers });
  if (!session || !key.startsWith(userUploadPrefix(session.user.id))) {
    return new Response("Forbidden", { status: 403 });
  }

  const body = Buffer.from(await req.arrayBuffer());
  if (body.length === 0 || body.length > MAX_IMAGE_BYTES) return new Response("Too large", { status: 413 });

  const file = path.join(localUploadDir, key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
  return new Response(null, { status: 200 });
}

export async function GET(_req: Request, { params }: Params) {
  if (isR2Configured) return new Response("Not found", { status: 404 });
  const key = await resolveKey(params);
  if (!key) return new Response("Not found", { status: 404 });

  try {
    const data = await readFile(path.join(localUploadDir, key));
    const ext = key.split(".").pop()!;
    return new Response(data, {
      headers: { "Content-Type": contentTypes[ext]!, "Cache-Control": "public, max-age=31536000, immutable" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
