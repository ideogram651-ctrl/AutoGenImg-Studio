# Agent usage contract

This document is the complete calling contract for agents. The tool is a normal CLI; no skill or MCP configuration is required.

## 1. Check readiness

```powershell
chatgpt-image doctor
chatgpt-image connect
```

If `connect` needs browser approval, ask the user to approve the Playwright Bridge connection in Chrome. Never request, print, read, or export browser cookies.

## 2. Submit one request

Write a JSON file matching `schemas/request.schema.json`, then run:

```powershell
chatgpt-image run --input C:\absolute\path\request.json
```

Parse stdout as JSON. Diagnostic output is not part of the result contract.

Rules:

1. Use a unique `task_id` for each intended prompt submission.
2. Use `mode: "new"` for an independent image concept.
3. Use `mode: "continue"` with the prior `thread_id` for edits to the same image.
4. Keep `reference_images` in the intended upload order.
5. Always use absolute paths when possible.
6. Do not run two requests concurrently. The CLI also enforces a global lock.

## 3. Handle results

- `completed`: consume every entry in `images`; one response may contain multiple images.
- `login_required`: let the user sign in in the visible Chrome window, then run `resume`.
- `human_action_required`: show the returned error and screenshot to the user; after the user resolves the page, run `resume`.
- `timed_out`: run `resume` later. Do not call `run` with a new task ID for the same prompt.
- `download_failed`: keep the returned `thread_url` and `image_resources`, resolve the local/browser issue, then run `resume`.
- `content_blocked`: report the page text. Do not rewrite or resubmit unless the user supplies a new request.
- `failed` with `page_error`, `upload_failed`, or `upload_not_confirmed`: report the returned error, correct the page or reference-file issue, then run `resume`. Upload failures occur before prompt submission.
- `ui_changed`: stop. The browser adapter needs an update; blind clicks are prohibited.

## 4. Resume safely

```powershell
chatgpt-image resume --task-id <task-id>
```

Resume never intentionally resubmits a verified prompt. If the previous process stopped during the exact submission boundary and the CLI cannot verify whether the message was sent, it returns `submission_uncertain` instead of risking a duplicate generation.

`force_resubmit: true` is an emergency override. Use it only after a human has inspected the recorded `thread_url` and confirmed that the prompt is absent.

## 5. Read state without browser changes

```powershell
chatgpt-image status --task-id <task-id>
```

This command is read-only.
