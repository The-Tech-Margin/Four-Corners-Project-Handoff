/**
 * Project request shapes shared by the routes and the browser client.
 *
 * @author TheTechMargin
 * @copyright 2026 TheTechMargin
 */

import { z } from "zod";

const MainImageSchema = z.union([
  z.object({
    kind: z.literal("blob"),
    key: z.string().max(512),
    thumbnailKey: z.string().max(512).nullable(),
  }),
  z.object({ kind: z.literal("url"), url: z.string().max(4096) }),
  z.null(),
]);

const SlugSchema = z
  .string()
  .max(120)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "Use lowercase letters, numbers and dashes");

export const ProjectCreateSchema = z.object({
  metadata: z.unknown(),
  mainImage: MainImageSchema.optional(),
  slug: SlugSchema.nullable().optional(),
  title: z.string().max(200).nullable().optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  parentProjectId: z.string().max(64).nullable().optional(),
  publishToGallery: z.boolean().optional(),
});

export const ProjectSaveSchema = z.object({
  metadata: z.unknown(),
  mainImage: MainImageSchema.optional(),
  slug: SlugSchema.nullable().optional(),
  title: z.string().max(200).nullable().optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
});

export const ProjectPatchSchema = z.object({
  slug: SlugSchema.optional(),
  title: z.string().max(200).nullable().optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
});

export const VisibilitySchema = z
  .object({
    published: z.boolean().optional(),
    inGallery: z.boolean().optional(),
  })
  .refine((value) => value.published !== undefined || value.inGallery !== undefined, {
    message: "Set published, inGallery, or both",
  });

export const DuplicateSchema = z.object({
  slug: SlugSchema.nullable().optional(),
  title: z.string().max(200).nullable().optional(),
});

export type ProjectCreateBody = z.infer<typeof ProjectCreateSchema>;
export type ProjectSaveBody = z.infer<typeof ProjectSaveSchema>;
export type ProjectPatchBody = z.infer<typeof ProjectPatchSchema>;
export type VisibilityBody = z.infer<typeof VisibilitySchema>;
