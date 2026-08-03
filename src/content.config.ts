import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const blog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      pubDate: z.coerce.date(),
      updatedDate: z.coerce.date().optional(),
      tags: z.array(z.string()).default([]),
      ogpImage: image().optional(),
      draft: z.boolean().default(false),
    }),
});

const works = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/works" }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      url: z.string().url().optional(),
      repoUrl: z.string().url().optional(),
      image: image().optional(),
      tags: z.array(z.string()).default([]),
      date: z.coerce.date(),
    }),
});

const certifications = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/certifications" }),
  schema: z.object({
    name: z.string(),
    issuer: z.string().optional(),
    date: z.coerce.date(),
    url: z.string().url().optional(),
  }),
});

const profile = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/profile" }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      bio: z.string(),
      avatar: image().optional(),
      links: z
        .array(
          z.object({
            label: z.string(),
            url: z.string().url(),
            icon: z.enum(["github", "x", "qiita", "link"]).default("link"),
          }),
        )
        .default([]),
    }),
});

export const collections = { blog, works, certifications, profile };
