import path from "node:path";
import { z } from "zod";
import type { ImageRequest } from "./types.js";

const taskIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

const rawRequestSchema = z
  .object({
    task_id: z.string().regex(taskIdPattern, "task_id must be 1-128 safe filename characters"),
    mode: z.enum(["new", "continue"]),
    prompt: z.string().trim().min(1).max(100_000),
    reference_images: z.array(z.string().min(1)).default([]),
    output_dir: z.string().min(1),
    title: z.string().trim().min(1).max(200).optional(),
    thread_id: z.string().trim().min(1).max(200).optional(),
    thread_url: z.string().url().optional(),
    timeout_seconds: z.number().int().min(30).max(3600).default(600),
    force_resubmit: z.boolean().default(false),
    browser: z
      .object({
        connection: z.enum(["extension", "cdp"]).default("extension"),
        channel: z.string().trim().min(1).default("chrome"),
        session_name: z.string().regex(taskIdPattern).default("chatgpt-image"),
      })
      .default({ connection: "extension", channel: "chrome", session_name: "chatgpt-image" }),
  })
  .superRefine((value, context) => {
    if (value.mode === "continue" && !value.thread_id && !value.thread_url) {
      context.addIssue({
        code: "custom",
        path: ["thread_id"],
        message: "continue mode requires thread_id or thread_url",
      });
    }

    if (value.thread_url) {
      const parsed = new URL(value.thread_url);
      if (parsed.protocol !== "https:" || parsed.hostname !== "chatgpt.com" || !parsed.pathname.startsWith("/c/")) {
        context.addIssue({
          code: "custom",
          path: ["thread_url"],
          message: "thread_url must be an https://chatgpt.com/c/... URL",
        });
      }
    }
  });

export function parseImageRequest(input: unknown, cwd = process.cwd()): ImageRequest {
  const parsed = rawRequestSchema.parse(input);
  return {
    ...parsed,
    reference_images: parsed.reference_images.map((item) => path.resolve(cwd, item)),
    output_dir: path.resolve(cwd, parsed.output_dir),
  };
}

export const requestJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "ChatGPT Image CLI Request",
  type: "object",
  additionalProperties: false,
  required: ["task_id", "mode", "prompt", "reference_images", "output_dir"],
  properties: {
    task_id: { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$" },
    mode: { enum: ["new", "continue"] },
    prompt: { type: "string", minLength: 1 },
    reference_images: { type: "array", items: { type: "string", minLength: 1 } },
    output_dir: { type: "string", minLength: 1 },
    title: { type: "string", minLength: 1, maxLength: 200 },
    thread_id: { type: "string", minLength: 1 },
    thread_url: { type: "string", format: "uri", pattern: "^https://chatgpt\\.com/c/" },
    timeout_seconds: { type: "integer", minimum: 30, maximum: 3600, default: 600 },
    force_resubmit: { type: "boolean", default: false },
    browser: {
      type: "object",
      additionalProperties: false,
      properties: {
        connection: { enum: ["extension", "cdp"], default: "extension" },
        channel: { type: "string", default: "chrome" },
        session_name: { type: "string", default: "chatgpt-image" },
      },
    },
  },
  allOf: [
    {
      if: { properties: { mode: { const: "continue" } } },
      then: { anyOf: [{ required: ["thread_id"] }, { required: ["thread_url"] }] },
    },
  ],
} as const;
