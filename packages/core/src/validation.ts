import { z } from "zod";
import {
  COMMENT_POLICIES,
  GROUP_ACCENTS,
  GROUP_CATEGORIES,
  GROUP_VISIBILITIES,
  JOIN_POLICIES,
  MAX_POST_IMAGES,
  POST_POLICIES,
} from "./constants";

export const slugSchema = z
  .string()
  .trim()
  .min(3, "At least 3 characters")
  .max(48, "At most 48 characters")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Lowercase letters, numbers and single dashes only");

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/, "");
}

export const groupSettingsInput = z
  .object({
    name: z.string().trim().min(3, "At least 3 characters").max(80),
    description: z.string().trim().max(2000).default(""),
    rules: z.string().trim().max(4000).default(""),
    category: z.enum(GROUP_CATEGORIES),
    accentColor: z.enum(GROUP_ACCENTS).default(GROUP_ACCENTS[0]),
    visibility: z.enum(GROUP_VISIBILITIES).default("public"),
    joinPolicy: z.enum(JOIN_POLICIES).default("open"),
    postPolicy: z.enum(POST_POLICIES).default("members"),
    commentPolicy: z.enum(COMMENT_POLICIES).default("members"),
  })
  .refine((g) => g.visibility !== "hidden" || g.joinPolicy === "invite", {
    message: "Hidden groups can only be joined by invite",
    path: ["joinPolicy"],
  });

export const createGroupInput = groupSettingsInput.and(z.object({ slug: slugSchema }));
export type CreateGroupInput = z.infer<typeof createGroupInput>;

export const discoverGroupsInput = z.object({
  query: z.string().trim().max(100).optional(),
  category: z.enum(GROUP_CATEGORIES).optional(),
  cursor: z.number().int().min(0).default(0),
});

export const joinGroupInput = z.object({
  groupId: z.string().min(1),
  message: z.string().trim().max(500).optional(),
});

export const updateProfileInput = z.object({
  name: z.string().trim().min(1, "Tell people what to call you").max(60),
  bio: z.string().trim().max(280).default(""),
});

export const createPostInput = z.object({
  groupId: z.string().min(1),
  body: z.string().trim().min(1, "Write something first").max(10_000),
  imageKeys: z.array(z.string().min(1)).max(MAX_POST_IMAGES).default([]),
});

export const createCommentInput = z.object({
  postId: z.string().min(1),
  parentId: z.string().min(1).optional(),
  body: z.string().trim().min(1).max(4000),
});
