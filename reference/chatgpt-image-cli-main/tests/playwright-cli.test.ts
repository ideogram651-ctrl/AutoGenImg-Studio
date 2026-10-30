import { describe, expect, it } from "vitest";
import { assertAllowedChatGptUrl, parseTabList } from "../src/browser/playwright-cli.js";

describe("parseTabList", () => {
  it("parses current and background tabs", () => {
    expect(parseTabList([
      "- 0: [ChatGPT](https://chatgpt.com/)",
      "- 1: (current) [Conversation](https://chatgpt.com/c/abc)",
    ].join("\n"))).toEqual([
      { index: 0, current: false, title: "ChatGPT", url: "https://chatgpt.com/" },
      { index: 1, current: true, title: "Conversation", url: "https://chatgpt.com/c/abc" },
    ]);
  });
});

describe("assertAllowedChatGptUrl", () => {
  it("allows only HTTPS chatgpt.com", () => {
    expect(() => assertAllowedChatGptUrl("https://chatgpt.com/c/abc")).not.toThrow();
    expect(() => assertAllowedChatGptUrl("https://example.com/")).toThrow(/Refusing/);
    expect(() => assertAllowedChatGptUrl("http://chatgpt.com/")).toThrow(/Refusing/);
  });
});
