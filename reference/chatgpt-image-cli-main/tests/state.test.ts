import { describe, expect, it } from "vitest";
import type { PageState } from "../src/types.js";
import {
  collectPendingImages,
  assistantText,
  findWorkedForText,
  imagesAreReady,
  newAssistantTurns,
  userPromptWasSubmitted,
} from "../src/workflow/state.js";

const readyState: PageState = {
  url: "https://chatgpt.com/c/thread",
  title: "Image task",
  threadId: "thread",
  loginRequired: false,
  humanChallenge: false,
  generating: false,
  alerts: [],
  turns: [
    { id: "old-user", turn: "user", writing: false, text: "old", images: [] },
    { id: "old-assistant", turn: "assistant", writing: false, text: "old reply", images: [] },
    { id: "new-user", turn: "user", writing: false, text: "Create image exact prompt", images: [] },
    {
      id: "new-assistant",
      turn: "assistant",
      writing: false,
      text: "Worked for 2m 6s",
      workedForText: "Worked for 2m 6s",
      images: [
        { src: "https://chatgpt.com/image/1", alt: "Generated image", complete: true, naturalWidth: 1024, naturalHeight: 1024 },
        { src: "https://chatgpt.com/image/1", alt: "", complete: true, naturalWidth: 1024, naturalHeight: 1024 },
      ],
    },
  ],
};

describe("workflow state helpers", () => {
  it("identifies the submitted prompt after the baseline", () => {
    expect(userPromptWasSubmitted(readyState, ["old-user", "old-assistant"], "exact prompt")).toBe(true);
  });

  it("selects new assistant turns and deduplicates image resources", () => {
    const turns = newAssistantTurns(readyState, ["old-user", "old-assistant"]);
    const images = collectPendingImages(turns);
    expect(turns.map((turn) => turn.id)).toEqual(["new-assistant"]);
    expect(images).toHaveLength(1);
    expect(images[0]?.turnId).toBe("new-assistant");
    expect(imagesAreReady(readyState, turns, images)).toBe(true);
  });

  it("does not complete while generation is active", () => {
    const state = { ...readyState, generating: true };
    const turns = newAssistantTurns(state, ["old-user", "old-assistant"]);
    expect(imagesAreReady(state, turns, collectPendingImages(turns))).toBe(false);
  });

  it("extracts only the exact Worked for duration and preserves following prose", () => {
    const turns = [{
      id: "assistant",
      turn: "assistant",
      writing: false,
      text: "Worked for 2m 6s This sentence must remain intact.",
      workedForText: "Worked for 2m 6s Edit image Share this image",
      images: [],
    }];
    expect(findWorkedForText(turns)).toBe("Worked for 2m 6s");
    expect(assistantText(turns)).toBe("This sentence must remain intact.");
  });

  it("does not remove control-like phrases embedded in assistant prose", () => {
    const turns = [{
      id: "assistant",
      turn: "assistant",
      writing: false,
      text: "Use Edit image when you want another variation.",
      images: [],
    }];
    expect(assistantText(turns)).toBe("Use Edit image when you want another variation.");
  });
});
