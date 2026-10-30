import { describe, expect, it } from "vitest";
import {
  collectPageStateScript,
  deleteConversationScript,
  ensureChatModeScript,
  ensureImageModeScript,
  submitPromptScript,
  uploadReferenceImagesScript,
  WORKED_FOR_PATTERN_SOURCE,
} from "../src/browser/scripts.js";

describe("browser scripts", () => {
  it("uses a bounded Worked for duration pattern", () => {
    const pattern = new RegExp(WORKED_FOR_PATTERN_SOURCE, "i");
    expect("Worked for 2m 6s Edit image".match(pattern)?.[0].trim()).toBe("Worked for 2m 6s");
    expect("Worked for 45 seconds Assistant prose".match(pattern)?.[0].trim()).toBe("Worked for 45 seconds");
    const script = collectPageStateScript();
    expect(script).toContain("data-message-author-role");
    expect(script).toContain("element.scrollIntoView");
    expect(script).not.toContain("scrollIntoViewIfNeeded");
  });

  it("fails closed when reference-image previews cannot be confirmed", () => {
    const script = uploadReferenceImagesScript(["C:/refs/one.png", "C:/refs/two.png"]);
    expect(script).toContain("UPLOAD_NOT_CONFIRMED:expected_");
    expect(script).not.toContain("return { uploaded: files.length, observed }");
    expect(script).toContain("previewCount >= attachmentsBefore + files.length");
  });

  it("supports the animated home-page image quick action", () => {
    const script = ensureImageModeScript();
    expect(script).toContain("'生成图片'");
    expect(script).toContain("activatedByQuickAction");
    expect(script).toContain("click({ force: true })");
  });

  it("forces and verifies Chat mode before using image generation", () => {
    const script = ensureChatModeScript();
    expect(script).toContain("name: 'Chat'");
    expect(script).toContain("name: 'Work'");
    expect(script).toContain("await chat.click({ force: true })");
    expect(script).toContain("WORK_MODE_FORBIDDEN:chat_mode_required");
    expect(script).toContain("source: 'conversation_label'");
    expect(script).toContain("UI_CHANGED:chat_mode_not_confirmed");
  });

  it("deletes only the already-open managed conversation with confirmation", () => {
    const script = deleteConversationScript("thread-one");
    expect(script).toContain("'/c/' + threadId");
    expect(script).toContain("managed_thread_not_open");
    expect(script).toContain("Open conversation options");
    expect(script).toContain("delete_confirmation_button_missing");
  });

  it("places the caret after the image-mode pill and verifies prompt insertion", () => {
    const script = submitPromptScript("hello", true);
    expect(script).toContain("await composer.focus()");
    expect(script).toContain("await composer.press('End')");
    expect(script).toContain("UI_CHANGED:prompt_text_not_inserted");
    expect(script).toContain("promptStillPresent");
    expect(script).toContain("promptWasPosted");
    expect(script).toContain("await composer.press('Enter')");
    expect(script).toContain("send.click({ force: true })");
    expect(script).toContain("SUBMISSION_UNCERTAIN:prompt_disappeared_without_user_turn");
    expect(script).toContain("UI_CHANGED:send_not_accepted");
  });
});
