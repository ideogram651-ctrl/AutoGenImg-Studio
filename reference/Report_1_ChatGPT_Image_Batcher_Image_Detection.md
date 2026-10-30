# Technical Review 1 — `chatgpt-image-batcher`

## Scope

This report examines only the part relevant to AutoGenImg Studio's current weakness: determining whether a new ChatGPT image has actually been generated and is ready for the next step. It does not recommend copying the repository's full application structure.

**Reviewed files in the supplied ZIP:**
- `README.md`
- `src/chatgpt.py`
- `src/browser.py` (only session/page context needed to understand detection)
- `tests/test_e2e.py`
- related source around error/refusal logging in `src/chatgpt.py`

The notes below describe the supplied source code, not a live test run against ChatGPT.

## 1. Detection flow implemented by Batcher

The core flow is in `src/chatgpt.py`, especially `generate_one()` and `wait_for_image_generation()`.

1. **Record a baseline before submitting.** `generate_one()` calls `_count_generated(page)` before writing/submitting the prompt. `_count_generated()` counts `img` elements whose `alt` starts with `Generated image:`. This count is passed as `prev_count`.
2. **Submit the prompt.** `type_prompt()` fills `#prompt-textarea[contenteditable="true"]`; `submit_prompt()` clicks `[data-testid="send-button"]`.
3. **Try to observe the generation loader.** `wait_for_image_generation()` first waits for `[data-testid="image-gen-loading-state-dots"]` to appear, for up to 30 seconds. This is best-effort: if it is not found, the code logs that it will check the image directly.
4. **Wait for the loader to disappear.** It polls every 250 ms for up to `min(300, timeout_s)` seconds, checking the latest assistant text for known errors as it polls. When the loader is absent, this phase breaks.
5. **Wait for a new generated-image element.** It then gives the image check a separate 60-second window. Each iteration checks known errors and asks whether the total generated-image count is now greater than `prev_count`.
6. **Handle a multi-image picker.** If `[data-testid="image-paragen-multigen"]` appears, the code tries once to click the button whose text includes `Image 1`.
7. **Return when the count increases.** If the count exceeds `prev_count`, the method logs `image generated` and returns. `generate_one()` immediately calls `download_image()`.

### Simplified flow

`count existing generated images` → `submit prompt` → `best-effort wait for loading dots` → `wait for dots to disappear` → `wait up to 60s for generated-image count to increase` → `download the last generated-image URL`.

## 2. Signals it trusts

### Primary signals

- **Generation activity:** `[data-testid="image-gen-loading-state-dots"]`.
- **Image result:** an image matching `img[alt^="Generated image:"]`.
- **Freshness:** total matching image count is greater than the count recorded before prompt submission.
- **Failure text:** the latest conversation turn is inspected for known phrases indicating rate limits, generation errors, or content refusal.

### Failure classification

`_check_for_errors()` raises separate exception types for:
- image-generation rate limits;
- model/generation errors;
- content-policy refusal.

If no image is obtained, `generate_batch()` records the latest assistant text and error in `no_image_log.jsonl`. That is useful diagnostically because repeated real response text can inform future refusal/error rules.

## 3. Useful ideas to learn from

1. **Take a baseline before the prompt.** This prevents a previously generated image from automatically being treated as the new result.
2. **Observe the generation loader, but do not rely on it as the only evidence.** The implementation has a separate image-element check after the loader phase.
3. **Check the assistant response for errors while waiting.** A rate limit or explicit rejection should not be mistaken for an unusually slow image.
4. **Capture no-image diagnostics.** Saving the latest assistant response and reason makes a timeout easier to debug.
5. **Account for the multi-image selection UI.** The code contains a targeted handler for the `Image 1` picker.

## 4. Important limitations of this detection logic

These are observations from the code, not claims that every run will fail.

1. **The loading selector is UI-specific.** If ChatGPT changes the test ID or no longer exposes the dots in that form, the first wait can fail to observe generation activity.
2. **A missing loader shortens effective waiting.** The initial appearance wait may consume 30 seconds. If it times out and the selector is absent during the next poll, the loading phase breaks immediately and the code moves to the separate 60-second image check. A still-generating task could therefore be classified as failed if the loader is not observable through that selector.
3. **It checks count, not actual image readiness.** Once the matching image count grows, it returns without checking `img.complete`, `naturalWidth`, `naturalHeight`, image URL stability, or whether the image stays unchanged for a stabilization interval.
4. **Freshness is global count-based, not turn-based.** It does not associate the discovered image with a specific new assistant-turn ID or verify that the current prompt's assistant turn owns the image. A DOM re-render, duplicate render, or selector/DOM behavior change could make a count-based assumption unreliable.
5. **The selector depends on the `alt` prefix.** If ChatGPT changes the image alt text or localization, valid images may not be counted.
6. **There is no direct image-readiness unit test in the supplied test set.** `tests/test_e2e.py` contains a real ChatGPT end-to-end path, including a single prompt and checking that an output image exists, is larger than 1,000 bytes, and is marked successful in `results.json`. That is useful integration coverage, but it is not a matrix of simulated loader/image readiness edge cases. The supplied tests were inspected, not executed for this review.

## 5. What is relevant to AutoGenImg Studio?

From the reported symptoms, AutoGenImg Studio appears to reach the correct ChatGPT conversation and eventually can download the image when `Retry Download` is used. Its remaining weak link is likely the transition from “generation started/ongoing” to “a new completed image is ready”, not the Share→Download interaction itself.

Batcher's useful concepts are baseline counting, loader observation, error classification, and recording the last assistant response when no image is found. However, its completion rule—“matching image count grew”—is too weak to adopt as the main readiness rule without improving it.

## 6. Recommended takeaway from Batcher

**Borrow the diagnostic and early-detection ideas, not the readiness rule by itself.** In the existing app, keep a before-submit baseline, watch generation indicators where possible, classify explicit error/refusal text, and preserve diagnostic page/turn evidence when nothing is detected. Then add stronger checks from the other reference: new assistant-turn ownership, fully loaded image dimensions, and a short stable-state interval.

### Source map

- `src/chatgpt.py:28-30` — selector constants.
- `src/chatgpt.py:40-52` — generated-image count and last image URL.
- `src/chatgpt.py:98-119` — rate-limit, generation-error, and refusal checks.
- `src/chatgpt.py:145-192` — main wait-for-image logic.
- `src/chatgpt.py:233-238` — baseline → submit → wait → download sequence.
- `src/chatgpt.py:241-246` — logging of the last assistant response when no image results.
- `tests/test_e2e.py:76-99` — live end-to-end output assertion.
