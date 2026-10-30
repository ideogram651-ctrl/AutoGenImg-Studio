import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseImageRequest } from "../src/schema.js";

describe("parseImageRequest", () => {
  it("normalizes paths and applies browser defaults", () => {
    const request = parseImageRequest({
      task_id: "image-001",
      mode: "new",
      prompt: "draw a test image",
      reference_images: ["ref.png"],
      output_dir: "out",
    }, "C:/workspace");
    expect(request.reference_images).toEqual([path.resolve("C:/workspace", "ref.png")]);
    expect(request.output_dir).toBe(path.resolve("C:/workspace", "out"));
    expect(request.browser).toEqual({
      connection: "extension",
      channel: "chrome",
      session_name: "chatgpt-image",
    });
    expect(request.timeout_seconds).toBe(600);
  });

  it("requires a thread for continue mode", () => {
    expect(() => parseImageRequest({
      task_id: "image-002",
      mode: "continue",
      prompt: "change the pose",
      reference_images: [],
      output_dir: "out",
    })).toThrow(/thread_id or thread_url/);
  });

  it("rejects non-ChatGPT thread URLs", () => {
    expect(() => parseImageRequest({
      task_id: "image-003",
      mode: "continue",
      thread_url: "https://example.com/c/abc",
      prompt: "change the pose",
      reference_images: [],
      output_dir: "out",
    })).toThrow(/chatgpt/);
  });
});
