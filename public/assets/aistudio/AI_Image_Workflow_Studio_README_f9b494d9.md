# AI Image Workflow Studio

**Product Specification, Feature Plan, Architecture, and Implementation Roadmap**

**Document status:** Planning baseline  
**Working product name:** AI Image Workflow Studio  
**Primary platform:** Windows desktop, operated through a local web interface  
**Primary use case:** Prepare a structured image-prompt bundle from a video script, then manage image generation, downloads, progress, review, and recovery in one place.

---

## 1. Product Summary

AI Image Workflow Studio is a local application for creators who need a sequence of AI-generated images for a YouTube video or another visual project. It combines a beginner-friendly preparation guide with a structured prompt-bundle manager and a browser-driven generation workflow.

The application is intended to reduce repetitive manual work. Instead of repeatedly selecting a prompt, pasting it into an AI conversation, attaching references, waiting, downloading an image, renaming it, and recording progress, the user prepares a project once and lets the application process the queue while displaying clear status information.

The application runs locally from VS Code. Running `npm run dev` starts a local server and provides a URL that the user opens in Chrome. The web interface communicates with a local Node.js process that manages the project, queue, browser interactions, downloads, persistent state, and reports.

### Core product principles

1. **Beginner-friendly:** Explain the workflow inside the application, with examples and a guided path.
2. **Structured inputs:** Use a validated prompt bundle with stable prompt IDs rather than relying on ambiguous free-form text.
3. **Visible browser workflow:** Interact through the provider's visible interface and normal user-facing controls. Images must not be extracted from hidden page data or direct hidden asset URLs.
4. **Recoverable execution:** Save state throughout a run so the user can resume after a crash, interruption, or restart.
5. **No blind regeneration:** If an image's result is uncertain or an image cannot be verified, place the item in review and continue to the next eligible prompt.
6. **Accurate status:** Distinguish generated images, saved images, failed items, paused work, and items needing review.
7. **Provider-aware behavior:** Chat transitions, attachment support, completion detection, and limits can differ by service. Do not assume that every provider behaves the same way.

## 2. Problem to Solve

A creator may have a two-minute video and want one image every five seconds. That requires 24 images. The manual process can involve:

- Providing the script to an AI and asking it to create a prompt bundle.
- Defining a visual style and maintaining consistent characters or environments.
- Sending prompts one at a time.
- Attaching one or more reference files to the correct prompts.
- Waiting for each generation to finish.
- Downloading and naming each result.
- Remembering which prompts succeeded and which still need attention.
- Repeating the process if the browser or application is interrupted.

The application brings this workflow together so that the user's main responsibilities are to provide project inputs, review the plan, start the run, and resolve exceptions that genuinely need human judgment.

## 3. Goals and Scope

### In scope

- A local browser-based UI launched from VS Code with `npm run dev`.
- Project setup, including an output folder and an AI conversation URL.
- A built-in **How to Use / Guided Workflow** section for first-time users.
- A master-prompt template that helps users request a structured image-prompt bundle from their chosen AI.
- Import and validation of JSON prompt bundles, with optional Markdown support if a reliable parser is implemented.
- Reference-file management and assignment to all or selected prompt IDs.
- Sequential queue execution through visible browser UI interactions where supported and permitted by the selected provider.
- Waiting for a visible completion signal, then using the visible Download control to obtain the image.
- Automatic filenames based on prompt IDs and saving to the user's selected output folder.
- Live progress, timestamps, logs, pause/stop/resume controls, checkpointing, and error handling.
- New-conversation continuation when the current conversation cannot reasonably continue and the provider permits the transition.
- Automatic stopping when a provider/account usage limit is reached; resume only when permitted and usable again.
- A final HTML report with a row for each prompt, image status, timing, file path, errors, and review instructions.

### Out of scope for the initial release

- A video editor, timeline editor, trimming tool, or video-rendering engine.
- Generating the images inside this application itself; generation occurs through the selected AI provider.
- Hidden-source or hidden-asset extraction to obtain images. The intended flow uses the visible interface and normal download action.
- Bypassing provider usage limits, rate limits, access controls, CAPTCHA, or other protective measures.
- Automatically repeating an uncertain image generation without user review.
- Parallel generation of multiple prompts in the first release. The initial queue is sequential to make state and recovery predictable.
- A mandatory external API. The initial planned workflow is browser-driven; any future provider integration must use a supported and permitted interface.

## 4. Primary User Workflow: Script to Prompt Bundle

This workflow helps people who are not confident writing AI prompts.

### Step 1 — Open the guide

The user opens **How to Use** and follows the instructions. The guide explains the full workflow, required files, visual-style choices, reference files, prompt-bundle format, and how to start a run.

### Step 2 — Prepare the video script

The user prepares a plain-text `.txt` file containing the video script. The guide explains how to save and select the file.

### Step 3 — Choose the visual direction

The user chooses a style or enters a custom description. Initial examples may include:

- Raw / cinematic imagery.
- Photorealistic human scenes.
- Realistic 3D characters.
- Minimalist stickman illustrations.
- A custom style described by the user or informed by a supplied reference.

These are examples, not a restriction on the user's creative choices.

### Step 4 — Specify the image plan

The user supplies the target image count or the interval used to calculate it. The form should not silently assume that every video follows the same timing. For example, a 120-second video with a five-second interval needs 24 images. If duration is not evenly divisible by the interval, the application must define and display how the final partial interval is covered.

Other useful fields include aspect ratio, character consistency, visual consistency requirements, and any project-specific instructions. Fields must be explained in plain language.

### Step 5 — Build the master prompt

The application provides a predefined master-prompt template. The user fills in the project settings, copies the resulting instructions into their chosen AI conversation, and attaches the script and any required references through that AI's supported visible interface.

The master prompt must instruct the AI to:

- Analyze the script and divide it into scenes appropriate for the requested number of images.
- Create a detailed visual prompt for each scene.
- Keep the requested visual style consistent.
- Preserve character or environment consistency where requested.
- Assign a unique, stable ID and sequence to every prompt.
- Include timing information when the project uses a timeline or interval.
- Return a structured bundle in the requested format, not an unstructured essay.
- Avoid missing IDs, duplicate IDs, blank prompts, and extra output outside the requested structure.

The application prepares and explains the instructions; the user then obtains the bundle from the selected AI and imports it into the app.

### Step 6 — Import and validate the bundle

The user imports the JSON bundle. The application validates its schema, IDs, sequence, prompt text, timing data when present, and reference assignments. Errors should be reported with a clear explanation and the affected prompt ID. The app must not begin a run while blocking validation errors remain.

## 5. Primary User Workflow: Prompt Bundle to Saved Images

1. The user creates or opens a project.
2. The user selects an output folder.
3. The user provides the target AI conversation URL and chooses the supported execution mode/provider.
4. The user imports and validates the prompt bundle.
5. The user selects reference files and defines how they apply to prompts.
6. The app shows a preflight summary: prompt count, output folder, selected references, reference assignments, and validation status.
7. The user starts the run.
8. The queue processes one prompt at a time.
9. For a prompt, the automation prepares its instructions and attachments, uses the visible UI to submit it, and waits for an observable completion signal.
10. When a result is clearly available, the automation uses the visible Download action and saves the downloaded file under the prompt's ID-based filename.
11. The application verifies that the file was saved and records its metadata and timing.
12. If the result is missing, ambiguous, or cannot be verified, the app marks that prompt `NEEDS_REVIEW`, records the reason, and proceeds to the next eligible prompt instead of blindly regenerating it.
13. After every item, the run state is persisted.
14. At completion or pause, the application updates the dashboard and produces/updates the HTML report.

## 6. Application Pages and UI Structure

The UI should be simple, readable, and task-focused. A persistent sidebar or top navigation should make the main areas easy to find.

### 6.1 Home / Projects Dashboard

Purpose: Show recent projects and the current state at a glance.

Display:
- Create Project and Open Project actions.
- Recent projects and their output locations.
- Last run status and time.
- Counts for saved images, pending prompts, failed items, and items needing review.
- A clear Resume action when a run can safely resume.

### 6.2 New Project / Project Settings

Fields and actions:
- Project name.
- Output folder path and a folder-picker option where supported by the local app.
- AI provider or execution mode.
- Target conversation URL, editable before a run and changeable later with a safe pause/confirmation.
- Prompt bundle path.
- Project settings such as interval, target image count, aspect ratio, and style description when these are not already defined in the bundle.
- Preflight checks for path validity, write permission, required inputs, and configuration consistency.

Changing the conversation URL during an active run must not silently redirect an in-flight prompt. Pause the run and ask the user to confirm how pending work should continue.

### 6.3 How to Use / Guided Workflow

Purpose: Teach the end-to-end process without requiring the user to leave the application.

Content:
- What the application does.
- Required inputs and supported file types.
- How to prepare a script `.txt` file.
- How to choose a visual style.
- How to choose image count or interval.
- How to attach references in the chosen AI tool.
- How to use the built-in master prompt.
- How to obtain and import a JSON bundle.
- How to run, pause, resume, and review results.
- Troubleshooting for common mistakes.

The guide should include a copyable master prompt and short explanations near relevant fields. It should not require the user to memorize the process.

### 6.4 Prompt Bundle Manager

Purpose: Import and inspect prompts before generation.

Features:
- Import a JSON bundle.
- Show prompt ID, sequence, prompt text, timing, and assigned reference IDs.
- Validate required fields and report errors against specific IDs.
- Detect missing IDs, duplicate IDs, empty prompt text, inconsistent sequence values, invalid time ranges, and unknown reference IDs.
- Allow the user to correct supported metadata or return to the source file for complex changes.
- Show a preview of the effective queue order.
- Protect the original imported bundle from accidental mutation during a run.

JSON is the canonical format. Markdown may be supported as an optional convenience format only if a deterministic parser and clear format rules are defined.

### 6.5 Reference Manager

Purpose: Organize local reference files and specify where they apply.

Features:
- Select supported files from the user's computer.
- Display filename, file type, size, label, and preview when possible.
- Assign a stable reference ID such as `REF-STYLE-01` or `REF-CHAR-01`.
- Categorize references as style, character, environment, object, or custom.
- Support **All Prompts** and **Selected Prompt IDs** assignment modes.
- Allow prompt-specific reference assignments, for example `IMG-001`, `IMG-003`, `IMG-005`, and `IMG-016`.
- Show the effective reference list for each prompt during preflight.
- Validate provider-supported file types and size limits before the run.
- Avoid blindly uploading an entire directory. The user must see which individual files are selected.

Reference support depends on the selected provider. If a provider does not accept a given file type, the UI must explain the limitation rather than implying that the attachment will work.

### 6.6 Run Monitor

Purpose: Show what the application is doing in real time.

Display:
- Project name and current provider/conversation.
- Current prompt ID and prompt sequence.
- Current activity, such as preparing references, submitting prompt, waiting for generation, downloading, saving, or reviewing.
- Total prompts, processed prompts, saved images, failed items, and items needing review.
- Overall progress percentage and a progress bar.
- Current-item elapsed time and overall run time.
- Timestamped event log.
- Pause, Resume, Stop, and Open Output Folder actions where applicable.

The progress percentage should represent the number of processed queue items divided by total queue items. A processed item may be saved, failed, or marked for review; therefore the UI must also show saved and needs-review counts separately. A completed queue does not mean every image was saved successfully.

### 6.7 Review Center

Purpose: Make exceptions easy to resolve.

Display each item that requires attention, including:
- Prompt ID and prompt preview.
- Reason the result could not be verified.
- Whether a file exists.
- Any available screenshot or diagnostic evidence.
- Suggested next action: inspect provider page, locate/download the output if available, mark reviewed, or explicitly request a new generation.

The application must not automatically regenerate an uncertain item. Any later regeneration should be a deliberate user action and must be recorded as a separate attempt.

### 6.8 Reports & History

Purpose: Show completed and past runs.

Features:
- Run list with start/end time and status.
- Links to the output folder and HTML report.
- Counts of saved, failed, paused, and review-needed prompts.
- Access to event logs and the manifest for a run.
- Clear indication of active time versus wall-clock time if the run includes pauses.

### 6.9 Settings

Purpose: Keep configuration easy to manage.

Potential settings:
- Default output location.
- Default provider/mode and browser profile settings where supported.
- Default image interval and aspect ratio.
- Default wait-time and timeout policies.
- Report and diagnostic preferences.

Secrets and login credentials must not be stored in plain-text project files. The intended workflow uses the user's existing authenticated browser session and does not automate login.

## 7. Prompt Bundle Data Contract

JSON is the canonical input format because its fields and IDs can be validated deterministically. The initial schema should be versioned.

Illustrative example:

```json
{
  "schemaVersion": "1.0",
  "project": {
    "name": "My Video Project",
    "durationSeconds": 120,
    "imageIntervalSeconds": 5,
    "aspectRatio": "16:9",
    "styleDescription": "Cinematic, realistic lighting"
  },
  "prompts": [
    {
      "id": "IMG-001",
      "sequence": 1,
      "startSeconds": 0,
      "endSeconds": 5,
      "prompt": "Detailed visual description for scene one",
      "referenceIds": ["REF-STYLE-01"]
    },
    {
      "id": "IMG-002",
      "sequence": 2,
      "startSeconds": 5,
      "endSeconds": 10,
      "prompt": "Detailed visual description for scene two",
      "referenceIds": []
    }
  ]
}
```

This is an example, not the final schema. The implementation phase must formalize required and optional fields, valid values, and error messages.

### Bundle rules

- Every prompt must have a unique, stable ID.
- The sequence must define deterministic processing order.
- Prompt text must not be empty.
- Reference IDs must resolve to known references.
- Time ranges, when supplied, must be valid and non-overlapping unless overlap is explicitly allowed by the schema.
- Duration and interval calculations must handle the final partial interval consistently. For example, a 120-second video with a five-second interval requires 24 images; a longer duration that is not divisible by five may require one image for the final partial interval.
- The app must display the computed image count before the user starts.
- A run should use a stable snapshot of the imported bundle so that edits made afterward do not silently change the active queue.

## 8. Reference Assignment Rules

Each reference receives a stable ID and metadata. A prompt may refer to zero or more reference IDs.

Supported assignment options:

1. **All Prompts:** selected references are applied to every prompt.
2. **Selected Prompts:** selected references are applied only to the entered prompt IDs.
3. **Prompt-specific mapping:** each prompt explicitly lists the reference IDs it needs.
4. **Initial/session reference setup:** this may be used only if the chosen provider supports carrying the reference context across subsequent prompts. The UI must not promise that a provider will retain visual context unless its behavior has been verified.

The preflight screen must summarize the exact references planned for each prompt or clearly group prompts that share the same reference set.

## 9. Technology Stack

The initial application should reuse the same general engineering approach as the existing CourseXtract project: a Node.js orchestrator, Playwright browser control, modular JavaScript files, persistent JSON state, and clear report generation.

| Layer | Planned technology | Responsibility |
|---|---|---|
| Main language | JavaScript | Queue logic, project state, validation, browser workflow, logging, and reports |
| Runtime | Node.js | Run the local server and automation engine |
| Browser automation | Playwright | Interact with the browser UI and observe normal user-facing actions/events |
| Browser communication | Chrome DevTools Protocol when required by the selected launch/attach approach | Connect the automation process to its dedicated Chrome session |
| Local UI | HTML, CSS, and JavaScript | Project setup, guide, queue monitor, review center, and report navigation |
| Local server | Node.js HTTP server; use a server framework only if required by implementation | Serve the UI and provide local project operations |
| Live updates | Server-Sent Events (SSE) | Stream progress and log events from the Node.js process to the UI |
| Persistence | JSON files and append-only event logs | Bundle metadata, run state, manifest, and history |
| File operations | Node.js file-system APIs | Validate paths, save downloads, write checkpoints, and generate reports |
| Package management | npm | Dependencies and development scripts |
| Tests | Node.js test runner or a compatible JavaScript test framework | Unit, integration, and end-to-end checks |

### Browser interaction rule

The automation should use the visible website workflow: focus the message field, enter the prompt, attach files through the supported interface, activate the send/generate control, wait for a reliable visible completion state, and activate the visible download control. It must not use hidden asset URLs or page-source extraction as a substitute for the normal download action.

Playwright can use DOM locators to identify and click visible controls; that is a normal implementation technique for UI automation. Provider-specific selectors and completion signals must be isolated in provider adapters so that UI changes are easier to diagnose.

### Runtime behavior

- `npm run dev` starts the local application.
- The terminal prints the local URL.
- The user opens that URL in Chrome.
- The local Node.js process continues to own the queue and browser automation. Closing or refreshing the UI must not silently corrupt the persisted job state.
- The project should use a dedicated automation browser profile where appropriate, rather than taking control of the user's everyday browser session unexpectedly.

## 10. High-Level Architecture

```text
Local Web UI
  ├── Home / Project Setup
  ├── Guided Workflow / Master Prompt
  ├── Prompt Bundle Manager
  ├── Reference Manager
  ├── Run Monitor
  ├── Review Center
  └── Reports & History
          │
          │ local HTTP operations + SSE progress events
          ▼
Node.js Application Controller
  ├── Project Manager
  ├── Prompt Bundle Parser and Validator
  ├── Reference Assignment Manager
  ├── Queue Orchestrator
  ├── Provider UI Adapter (Playwright)
  ├── Completion/Download Verifier
  ├── Run-State and Checkpoint Manager
  ├── Logging and Diagnostics
  └── HTML Report Generator
          │
          ▼
Visible Browser UI of the selected provider
  ├── Open selected conversation
  ├── Attach supported references
  ├── Submit one prompt
  ├── Wait for visible completion
  └── Use the visible Download action
          │
          ▼
User-selected output folder + project state + HTML report
```

The UI should not directly control the queue logic. It sends commands to the local application controller and renders state updates from that controller. The queue remains responsible for ordering, checkpoints, timing, and error handling.

## 11. Queue Lifecycle and Item States

Each prompt must have a clear state and timestamps. Exact internal names can be adjusted during implementation, but the distinctions must remain.

### Normal successful path

`PENDING → PREPARING → SUBMITTING → GENERATING → RESULT_READY → DOWNLOADING → SAVED`

### Non-success paths

- `NEEDS_REVIEW`: generation or download outcome is uncertain, output cannot be verified, or the page returns an ambiguous response.
- `FAILED`: a definite failure occurred and the item cannot proceed in the current attempt.
- `SKIPPED`: the item was intentionally skipped according to user choice or a defined run rule.
- `PAUSED`: the queue is stopped temporarily by the user or by a recoverable condition.
- `PAUSED_PROVIDER_LIMIT`: a provider/account usage limit prevents further generation.
- `BLOCKED_AUTH`: a login/session problem requires the user to intervene.
- `CANCELLED`: the user explicitly stopped the run before the item completed.

### Required state behavior

1. Persist item state after every meaningful transition, not only when the entire run ends.
2. Record timestamps for submission, generation completion when observable, download start, download completion, and final state.
3. A saved image is not considered complete until the file exists and has a usable size/type according to validation rules.
4. If it is not clear whether an image was generated, mark `NEEDS_REVIEW`; do not send the same prompt again automatically.
5. After an item is marked `NEEDS_REVIEW` or definitively `FAILED`, continue to the next eligible prompt if the run is otherwise healthy and no provider-level stop condition exists.
6. A provider usage limit, authentication problem, or other run-wide blocker pauses the queue rather than skipping through all remaining prompts.
7. User Stop must stop scheduling new prompts and safely settle or record any in-flight operation. It must not delete already saved images.

## 12. New Conversation and Limit Handling

The application may need to change conversations when the current conversation is no longer suitable for continuing the project. This must be implemented as a provider-aware workflow, not as a universal assumption.

### New conversation continuation

When a conversation-specific issue occurs and a new conversation is appropriate and permitted:

1. Finish or safely pause the current item.
2. Persist the current item state and identify the next pending prompt.
3. Open a new conversation through the provider's visible UI where supported.
4. Prepare a concise continuation brief from the project state: project instructions, style requirements, completed IDs, next prompt ID, and required references.
5. Restore only the context needed for the next prompt, without resubmitting completed prompts.
6. Record the new conversation/session identifier or URL in the run history.
7. Continue only after the new conversation is ready and the provider workflow permits it.

### Provider/account usage limits

A new conversation must not be used to evade an account-level or service-level image-generation limit. If a usage limit is reached:

- Stop sending prompts.
- Save the current state.
- Set the run status to `PAUSED_PROVIDER_LIMIT`.
- Show the provider's visible message and the affected prompt ID when available.
- Tell the user that the queue can resume when the provider permits more generation.
- Do not try alternate conversations or accounts as a workaround for the limit.

### Authentication and protection checks

If the browser session expires or a CAPTCHA/security challenge appears, pause and request user intervention. The app must not automate login, defeat CAPTCHA, or bypass provider protections.

## 13. Generation Completion and Download Verification

The queue must not rely on a fixed sleep alone. Generation duration can vary.

### Completion detection

The provider adapter should use reliable, provider-specific visible UI indicators. It should distinguish at least:

- Prompt accepted/submitted.
- Generation in progress.
- Result visibly available.
- Explicit error or provider limit.
- Unknown/ambiguous result.

If the completion state cannot be determined within the configured timeout, record the timeout and classify the item as `NEEDS_REVIEW` unless the provider clearly signals a definite failure.

### Download behavior

1. Use the visible Download control for the generated result.
2. Wait for the browser's download event or equivalent supported download signal.
3. Save the downloaded file to the configured output folder using a stable filename such as `IMG-001.png` while preserving the actual file extension where appropriate.
4. Validate that the file exists and is non-empty. Perform basic file-type/extension checks.
5. If a file with that name already exists, do not silently overwrite it. Reconcile it with the manifest or ask the user to choose an overwrite/keep-both action.
6. Record the saved path, file size, extension, and relevant timestamps.
7. Do not access the image through a hidden asset endpoint as a shortcut around the visible download workflow.

## 14. Retry, Review, and Continue Rules

The user explicitly wants an uncertain image to be reviewed rather than automatically regenerated.

- **Definite provider error:** mark the item `FAILED` or `NEEDS_REVIEW` according to the available evidence, record the reason, and move to the next eligible prompt.
- **Timeout or ambiguous response:** mark `NEEDS_REVIEW`, do not regenerate automatically, and continue to the next eligible prompt when the provider is not blocking the whole run.
- **Generation succeeded but download failed:** record the generation result separately from the download result. Retry only the download when the existing result is still available and the selected provider's workflow supports it; do not submit a new generation just to fix a download problem.
- **User-requested regeneration:** make it an explicit action in the Review Center, create a separate attempt record, and keep the prior attempt in history.
- **Provider limit or authentication problem:** pause the entire queue. Do not continue sending prompts to the blocked provider.

## 15. Checkpointing, Recovery, and Duplicate Prevention

The application must maintain a durable record of each prompt and each run.

### Recovery requirements

- Save project settings and bundle identity.
- Save the queue order and current item.
- Persist each prompt's state and timestamps.
- Record output filenames and paths.
- Record reference IDs associated with each prompt.
- Record current provider/conversation context where applicable.
- On startup, compare the saved manifest with actual output files before deciding what remains to do.
- Resume only items that are safe to resume. Uncertain in-flight generations should enter review instead of being blindly resubmitted.
- Keep history of attempts and state transitions.

### Suggested project files

```text
project-data/
  project.json        # Project configuration
  run-state.json      # Current resumable run state
  manifest.json       # Prompt IDs, final states, output files and metadata
  events.jsonl        # Append-only chronological run events
```

The final file names may change, but the responsibilities should remain separate. The original prompt bundle should be preserved unchanged for the run.

## 16. Output Folder and File Naming

The user chooses the output folder at project setup. Before starting, the app verifies that the path is valid and writable.

Suggested organization:

```text
My-Image-Project/
  input/
    prompt-bundle.json
  output/
    images/
      IMG-001.png
      IMG-002.png
      IMG-003.webp
    reports/
      run-report.html
    logs/
      run.log
  project-data/
    project.json
    run-state.json
    manifest.json
    events.jsonl
```

The user's chosen output root remains authoritative. The app may create the subfolders above within that root, but must clearly show the final location before the run begins.

Naming rules:

- Use the stable prompt ID as the filename base.
- Preserve a suitable real extension instead of assuming every output is PNG.
- Never silently overwrite an existing image.
- Keep review-needed prompts identifiable even when no image file exists.
- Make the output folder easy to open from the UI.

## 17. HTML Run Report

Every run should produce or update a self-contained HTML report saved under the project output folder. It should be readable in Chrome without requiring a separate server or external resources.

### Report summary

Include:
- Project name and run identifier.
- Start time and end time.
- Overall wall-clock duration.
- Active processing duration, excluding paused time if tracked.
- Total prompts expected.
- Total prompts processed.
- Number of images saved.
- Number of items marked `NEEDS_REVIEW`.
- Number of failed, skipped, or cancelled items.
- Number of pauses and the reasons for them.

### Per-prompt table

Recommended columns:

| Column | Meaning |
|---|---|
| Sequence | Queue order |
| Prompt ID | Stable identifier such as `IMG-014` |
| Prompt preview | Short, readable part of the prompt |
| Status | `SAVED`, `NEEDS_REVIEW`, `FAILED`, etc. |
| Generation started | Timestamp when submission/generation began |
| Generation duration | Time spent waiting for generation, when measurable |
| Download duration | Time from download initiation to saved file |
| Total item duration | Time spent processing the item, clearly defined |
| Output filename/path | Saved file location, when available |
| References | Reference IDs used for the item |
| Review/error reason | Explanation and next action when needed |
| Conversation/session | Conversation used for that attempt, when available |

### Report details

- Use clear visual labels for success, failure, pause, and review-needed items.
- Make output paths easy to copy or open.
- Show any image that was not generated or saved and explicitly tell the user to review its prompt ID.
- Distinguish unavailable timing data from a duration of zero.
- Do not state that the whole project succeeded merely because the queue reached the end. Overall status must reflect saved and unresolved items.
- Include a timestamped run summary and useful errors without exposing passwords or other secrets.

## 18. Logging and Diagnostics

The application should maintain a chronological log of meaningful events.

Examples:

- Project opened and bundle validated.
- Run started, paused, resumed, or stopped.
- Prompt entered each state.
- Reference attachment attempted and outcome.
- Generation detected as started or completed.
- Download started, completed, or failed.
- New conversation opened for a permitted continuation.
- Provider limit, authentication issue, timeout, or unexpected UI state detected.
- Item sent to review and queue advanced.
- Report generated.

Each event should include a timestamp, run ID, prompt ID when relevant, severity, event code, and concise message. Logs should avoid storing credentials. Full prompt text and sensitive file contents should not be copied into logs by default.

Where useful and safe, diagnostics may include screenshots of the visible browser UI and a short description of the observed state. Diagnostics should help the user troubleshoot without attempting hidden-content extraction.

## 19. Timing and Progress Metrics

Track these durations separately:

- Prompt preparation/submission time.
- Generation wait time, when it can be measured.
- Download duration.
- Per-item active processing time.
- Total active run time.
- Total wall-clock time including pauses.

For a queue of `N` prompts:

`Progress % = processed queue items / total queue items × 100`

The dashboard must also show separate counts for `SAVED`, `NEEDS_REVIEW`, and failed items. Progress is a measure of queue processing, not a guarantee that every image was generated successfully.

## 20. Provider Adapter Design

Browser interfaces differ and may change. Provider-specific behavior should live behind an adapter interface instead of being scattered throughout the queue code.

Each adapter should define how to:

- Validate the target conversation URL.
- Check whether the expected page is open and ready.
- Find the visible message input.
- Attach the supported reference files.
- Submit the prompt.
- Detect generation progress, completion, limits, and errors.
- Locate and activate the visible Download control.
- Open a new conversation when appropriate and permitted.
- Recognize when user intervention is required.

The queue orchestrator should not contain provider-specific CSS selectors or UI text rules. If the provider's UI changes, the adapter can be inspected and fixed independently.

Support for ChatGPT, Gemini, or another provider must be verified individually. The application must not claim full compatibility until the complete user-visible workflow has been tested for that provider.

## 21. Development Phases

Use three substantial phases rather than many small phases. Each phase should end with a focused acceptance check. Run targeted tests while developing, then run the consolidated regression suite at phase boundaries instead of repeating every manual check after each small change.

### Phase 1 — Foundation, Data Contract, and Complete UI Shell

Build:
- Node.js project structure and `npm run dev` entry point.
- Local web server and main UI navigation.
- Home, Project Setup, How to Use, Prompt Bundle Manager, Reference Manager, Run Monitor, Review Center, Reports/History, and Settings screens.
- Canonical JSON schema and bundle validator.
- Project/output-folder configuration and path validation.
- Reference metadata and assignment rules.
- Master-prompt template and beginner guide.
- Project state, manifest, and log data models.
- A simulated queue mode so that the UI, progress counters, states, and report layout can be tested without real generations.

**Exit criteria:** A project can be created, a valid bundle imported, invalid data rejected with useful messages, references assigned, a simulated run completed, state persisted, and an initial HTML report generated.

### Phase 2 — Browser Automation and Reliable Queue Lifecycle

Build:
- The first verified provider UI adapter using Playwright.
- Opening the configured conversation and checking page readiness.
- Prompt submission and supported reference attachment through visible controls.
- Visible generation-completion detection.
- Visible Download action and local save handling.
- Sequential processing and real-time progress events.
- Per-item timestamps and persistence after each state transition.
- Timeout handling, `NEEDS_REVIEW` behavior, and automatic advance to the next eligible prompt.
- Pause/Stop behavior and safe handling of authentication errors or provider limits.
- Permitted new-conversation continuation for conversation-specific issues, with context restored from project state.
- Checkpoint-based resume and duplicate-file protection.
- Initial complete HTML report with per-prompt timing and results.

**Exit criteria:** One real prompt can complete the full UI-driven lifecycle and save a file correctly; a multi-prompt test can continue after a review-needed item; a provider limit stops the queue; and a restart recovers state without blindly resubmitting uncertain work.

### Phase 3 — Hardening, Full Reports, and Release Readiness

Build and verify:
- Full run report styling, totals, item timing, event history, output paths, and review guidance.
- Robust reconciliation between saved files and the manifest.
- Testing for UI changes, timeouts, failed downloads, incomplete outputs, duplicate filenames, and browser disconnects.
- Project/run history and useful diagnostics.
- Clear user-facing messages for all known states.
- README/help instructions and setup requirements.
- Final manual end-to-end test of the supported provider and a consolidated regression run.

**Exit criteria:** The application reliably completes a representative multi-image run, preserves state after interruption, reports all unresolved items honestly, avoids silent overwrites, and provides an understandable HTML report.

## 22. Testing Strategy and Acceptance Criteria

### Offline tests

- Valid and invalid JSON bundles.
- Duplicate/missing prompt IDs.
- Empty prompts and invalid sequence values.
- Invalid time ranges and image-count calculations.
- Unknown or missing reference IDs.
- Reference assignment to all and selected prompts.
- Queue state transitions and progress calculations.
- Resume and file/manifest reconciliation.
- Duplicate filename protection.
- HTML report totals and row status.

### Browser integration tests

- Open the configured conversation in the expected browser session.
- Submit one prompt through the visible UI.
- Attach a supported reference.
- Observe completion and use the visible Download action.
- Save and verify the file.
- Confirm a review-needed item advances to the next queue item without automatic regeneration.
- Confirm an explicit provider limit pauses the whole queue.
- Confirm user intervention is requested for expired login/session or a security challenge.
- Confirm a permitted conversation transition does not repeat completed prompt IDs.

### End-to-end acceptance scenario

Use a small test bundle first, such as three prompts:

1. One prompt completes and its image is saved.
2. One prompt produces an ambiguous or failed result and becomes `NEEDS_REVIEW` without an automatic regeneration.
3. The next eligible prompt is processed.
4. The application is stopped/restarted and resumes from persisted state.
5. The final HTML report shows all three rows, file paths, statuses, timings where available, and the unresolved review item.

After this scenario succeeds, run a larger batch. Do not use a large 24-image run as the first integration test.

## 23. Reliability, Security, and User-Control Rules

- Keep the local server bound to localhost by default.
- Use the user's existing authenticated browser session; do not store passwords or automate login.
- Do not bypass usage limits, rate limits, access restrictions, CAPTCHA, or provider security protections.
- Pause on provider-level usage limits and preserve the pending queue.
- Open a new conversation only when it is an appropriate, permitted continuation—not to evade a service/account limit.
- Require user confirmation for destructive actions such as deleting outputs or overwriting saved files.
- Never delete successful output images when a run is stopped or fails.
- Keep prompt bundle input separate from mutable run state.
- Mark uncertain outcomes for review rather than guessing success or automatically regenerating.
- Show when a value, timing, or status could not be reliably determined.
- Treat provider compatibility as verified only after a real end-to-end test.

## 24. Final Product Definition

The first release is complete when the user can:

1. Start the local app from VS Code with `npm run dev` and open its URL in Chrome.
2. Follow the built-in guide to prepare a script and request an image-prompt bundle from an AI.
3. Import and validate the resulting JSON bundle.
4. Choose an output folder and a supported AI conversation URL.
5. Add references and assign them to all prompts or selected prompt IDs.
6. Review the queue before starting.
7. Run prompts sequentially through the supported visible browser workflow.
8. Save successful downloads using prompt-ID-based filenames.
9. See live progress and meaningful item states.
10. Continue to the next eligible prompt when an item needs review, without blindly regenerating it.
11. Pause on provider limits or authentication problems and resume when permitted.
12. Continue in a new conversation when appropriate and permitted, using saved project context and without repeating completed items.
13. Recover safely after an interruption.
14. Open an HTML report showing per-prompt results, image filenames, timings, errors, review-needed items, and overall run duration.

The central design goal is a dependable workflow rather than a fragile sequence of clicks: structured prompts, visible browser actions, clear state transitions, safe recovery, and complete run reporting must work together as one product.
