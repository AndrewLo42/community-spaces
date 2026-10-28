import { z } from "zod";
import {
  COMMENT_POLICIES,
  GROUP_ACCENTS,
  GROUP_CATEGORIES,
  GROUP_VISIBILITIES,
  IMAGE_CONTENT_TYPES,
  JOIN_POLICIES,
  MAX_IMAGE_BYTES,
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

export const createUploadInput = z.object({
  contentType: z.enum(IMAGE_CONTENT_TYPES),
  size: z.number().int().positive().max(MAX_IMAGE_BYTES, "Image is too large"),
});

export const postImageInput = z.object({
  key: z.string().min(1).max(200),
  width: z.number().int().positive().max(10_000),
  height: z.number().int().positive().max(10_000),
});

export const createPostInput = z
  .object({
    groupId: z.string().min(1),
    body: z.string().trim().max(10_000).default(""),
    images: z.array(postImageInput).max(MAX_POST_IMAGES, `Up to ${MAX_POST_IMAGES} images`).default([]),
  })
  .refine((p) => p.body.length > 0 || p.images.length > 0, {
    message: "Write something or add a photo",
    path: ["body"],
  });
export type CreatePostInput = z.infer<typeof createPostInput>;

/** Opaque keyset cursor for feeds. */
export const feedInput = z.object({ cursor: z.string().max(200).optional() });
export const groupFeedInput = feedInput.extend({ groupId: z.string().min(1) });

export const postIdInput = z.object({ postId: z.string().min(1) });
export const postFlagInput = postIdInput.extend({ value: z.boolean() });
export const reviewPostInput = postIdInput.extend({ approve: z.boolean() });

export const createCommentInput = z.object({
  postId: z.string().min(1),
  parentId: z.string().min(1).optional(),
  body: z.string().trim().min(1, "Write a comment first").max(4000),
});

export const commentIdInput = z.object({ commentId: z.string().min(1) });
