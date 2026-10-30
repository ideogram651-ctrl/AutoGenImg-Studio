# Technical Review 2 — `chatgpt-image-cli`

## Scope

This report examines only the logic relevant to AutoGenImg Studio's current weakness: recognizing a newly generated ChatGPT image, deciding when it is truly ready, and recovering safely if the observation times out.

**Reviewed files in the supplied ZIP:**
- `README.md`
- `src/browser/scripts.ts`
- `src/workflow/state.ts`
- `src/workflow.ts`
- `src/types.ts`
- `src/image/inspect.ts` (only the validation step after detection)
- `tests/state.test.ts`, relevant `tests/workflow.test.ts`, and `tests/browser-scripts.test.ts`

The notes below describe the supplied source code; the repository's tests were inspected but not executed for this review.

## 1. Detection flow implemented by the CLI

The most relevant code is `collectPageStateScript()` in `src/browser/scripts.ts`, the pure state helpers in `src/workflow/state.ts`, and `waitForImages()` in `src/workflow.ts`.

1. **Record the baseline before sending.** After the page is prepared and reference uploads are handled, the workflow records all current turn IDs in `baselineTurnIds`, persists the record, and then submits the prompt.
2. **Confirm that the prompt was actually submitted.** `waitForSubmission()` repeatedly collects page state and looks for a new user turn, beyond the baseline, whose text contains the expected prompt. The workflow does not blindly assume that pressing Enter means the prompt was accepted.
3. **Collect page state from semantic DOM structure.** It reads conversation turns from `section[data-turn][data-turn-id]`, classifies turns as user or assistant, and collects the assistant turns' image elements and per-image readiness properties.
4. **Handle lazy-loaded images.** Before reading the state, the script attempts to scroll the newest assistant image into view. Its comment explains that an off-screen image can remain at `naturalWidth = 0` until revealed/loaded.
5. **Determine whether generation is active.** The page is treated as generating if an assistant turn contains `[data-writing-block]` or a Stop-generation button is present (including localized variants in the source).
6. **Ignore old assistant turns.** `newAssistantTurns()` excludes every turn ID recorded in `baselineTurnIds`.
7. **Collect unique image resources.** `collectPendingImages()` gathers image resources from those new assistant turns and deduplicates by `src`.
8. **Require several readiness signals at once.** `imagesAreReady()` returns true only if there is at least one new image, generation is no longer active, every new assistant turn is no longer writing, and every candidate image has `complete === true` plus positive `naturalWidth` and `naturalHeight`.
9. **Require the state to settle.** `waitForImages()` polls page state every 2 seconds. When images meet the readiness rules, it computes a signature from new turn IDs/writing flags and image URLs/loading dimensions. If the signature changes, the stability timer resets. It returns only after the same signature has remained stable for 4 seconds.
10. **Only then begin downloading.** The workflow changes its stage to `downloading`, associates each image with its assistant-turn ID and exact source URL, and processes every unique new image. It checks the returned bytes and validates the file using image metadata before marking the task `completed`.

### Simplified flow

`baseline turn IDs` → `submit prompt` → `verify new user turn` → `observe new assistant turns` → `find unique image resources` → `generation stopped + turns not writing + images loaded with dimensions` → `same state for 4 seconds` → `download and validate` → `completed`.

## 2. How the DOM observation works

`collectPageStateScript()` extracts these relevant properties per candidate image:

- `src` / `currentSrc`;
- `alt` text;
- `complete`;
- `naturalWidth` and `naturalHeight`.

It considers assistant-turn images relevant when their source resembles the observed ChatGPT image-resource path (`/backend-api/estuary/content`) or their alt text matches generated-image wording, including a localized Chinese phrase. It also captures the assistant turn ID, whether a writing block is present, relevant assistant message text, page alerts, login/challenge state, and a page-level `generating` flag.

This is important because it treats a visible or discoverable `<img>` element as a *candidate*, not automatically as a ready result. A candidate does not pass readiness while its load state or dimensions are incomplete.

## 3. The readiness condition is the key idea

In `src/workflow/state.ts`, `imagesAreReady()` effectively requires all of the following:

- at least one image belongs to a new assistant turn;
- the page-level `generating` flag is false;
- every new assistant turn has `writing === false`;
- every image reports `complete === true`;
- every image has `naturalWidth > 0` and `naturalHeight > 0`.

The workflow then adds a separate stabilization requirement. The signature includes turn IDs/writing state and each image's turn ID, source, `complete`, width, and height. A changing signature resets the timer. This helps avoid acting on a result while the page is still changing or the image is still loading.

## 4. Timeout and resume behavior

The workflow has an explicit `waiting_for_image` stage. If `waitForImages()` cannot observe a stable downloadable state before the configured timeout, it returns a `timed_out` result with `generation_timeout`; it does not label that state proof that ChatGPT failed to generate the image.

The task record retains `promptSubmitted`, baseline turn IDs, thread information, last observed page state, and its stage. `resume()` loads the existing task and forces `force_resubmit: false`. When a task has already submitted its prompt, the workflow reopens the existing conversation and checks the current state rather than intentionally submitting the same prompt again. This is particularly relevant to slow image generation: timeout should mean “observe/recover the original task”, not “send the prompt again”.

The workflow also checks page alerts and recognizes content-blocked assistant text rather than waiting indefinitely for an image that will not be produced.

## 5. Useful ideas to learn from

1. **Use a baseline of turn IDs, not just a global image count.** This isolates results created by the current task from images already in the conversation.
2. **Separate “prompt submitted” from “image generated”.** Verifying the new user turn avoids confusing a failed submission with a slow generation.
3. **Capture multiple independent readiness signals.** Generation stopped, assistant turns finished writing, and image load dimensions are all checked.
4. **Scroll lazy-loaded images into view before inspecting dimensions.** This addresses a specific reason an existing image element might report zero dimensions.
5. **Wait for stable state rather than trusting the first matching DOM element.** The source and dimensions must stop changing for a stabilization interval.
6. **Deduplicate by image source and keep turn ownership.** The image is tied to the assistant turn from which it came, and duplicates are ignored.
7. **Distinguish generation timeout from download failure.** These are separate workflow stages and error states.
8. **Resume the original task safely.** A timeout preserves the record and avoids blindly resubmitting the prompt.
9. **Unit-test the decision logic.** `tests/state.test.ts` explicitly checks that new assistant turns are selected, duplicate image URLs are deduplicated, and readiness is false while generation remains active.

## 6. Caveats and boundaries

1. **The detection still depends on ChatGPT's DOM.** It uses semantic turn structure and specific attributes/phrases. UI changes can require updating the selectors or resource recognition rules.
2. **A resource must match the extraction rules.** If ChatGPT changes the image URL pattern and also changes the alt text, an image may not be collected as a candidate.
3. **The stability interval is a heuristic, not an official generation-complete API.** Four seconds of unchanged state is stronger than a single check, but no DOM-based approach can guarantee ChatGPT's interface never changes.
4. **The download code path should not be copied blindly.** The source code's `downloadImageScript()` fetches the selected image URL directly with `page.request.get(source)`, then the workflow validates the response bytes and image metadata. This report focuses on detection; it does not claim that this download path is identical to AutoGenImg Studio's Share-card → Download flow.
5. **Test scope matters.** `tests/state.test.ts` covers helper-level baseline selection, deduplication, and the “not ready while generating” rule. `tests/browser-scripts.test.ts` checks parts of the generated browser script. Those tests are not, by themselves, proof that every current live ChatGPT UI variant is detected successfully. The tests were inspected, not run for this review.

## 7. What is relevant to AutoGenImg Studio?

For the reported symptom—ChatGPT visibly generated the image, but AutoGenImg Studio reaches `NEEDS_REVIEW` with “Generation timed out ... without observable result”—the CLI's approach is the stronger reference for the missing detection logic.

The highest-value parts to adapt conceptually are:

- baseline current assistant-turn IDs before prompt submission;
- verify the current prompt appears as a new user turn;
- inspect only new assistant turns after that baseline;
- identify candidate image elements and capture `complete`, `naturalWidth`, and `naturalHeight`;
- detect generation activity from both turn-writing state and the Stop-generation control;
- scroll the candidate image into view to trigger lazy loading;
- wait for the ready signature to remain stable for several seconds;
- preserve and resume the same task if a timeout happens, rather than requiring manual intervention or resubmitting.

The existing AutoGenImg Studio download engine should remain a separate stage. Once detection proves a new image is ready, it can invoke the existing working Share → Download engine; successful download and output-file validation should then drive the queue's transition to `SAVED`.

### Source map

- `src/workflow.ts:230-256` — baseline recorded before submission, submission confirmation, and transition to waiting.
- `src/workflow.ts:397-431` — wait/poll loop, error checks, readiness signature, 4-second stabilization.
- `src/browser/scripts.ts:13-101` — DOM collection, lazy-image scroll, candidate image properties, generation indicator.
- `src/workflow/state.ts:12-46` — new assistant-turn selection, image deduplication, ready predicate.
- `src/workflow/state.ts:48-59` — stable image signature.
- `src/browser/scripts.ts:406-432` — exact turn/source association and image-resource fetch after detection.
- `src/workflow.ts:291-336` — downloaded byte checks, image validation, and completed-stage update.
- `tests/state.test.ts:38-56` — direct tests for baseline filtering, deduplication, and active-generation blocking.
- `docs/ERROR_CODES.md` and `docs/AGENT_USAGE.md` — timeout/resume contract: resume the original task; do not blindly submit again.
