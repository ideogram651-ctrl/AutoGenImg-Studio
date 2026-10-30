# chatgpt-image

`chatgpt-image` is an agent-agnostic CLI for creating and iterating images through the ChatGPT website in the user's existing Chrome session. It uses the official Playwright CLI and Playwright Bridge extension; it is not a Codex plugin, MCP server, or skill.

## What it does

- `mode: "new"` reuses or opens one blank ChatGPT tab and starts a clean image conversation.
- `mode: "continue"` reopens the supplied ChatGPT conversation and appends the edit request.
- Forces Chat mode and refuses to submit into a conversation marked as Work.
- Uploads reference images in array order.
- Records the baseline conversation turns before submission.
- Uses `task_id` to prevent accidental duplicate submissions.
- Waits for a new assistant turn, loaded image resources, stopped generation, and a stable page state.
- Downloads every new image through ChatGPT's image viewer Save action.
- Verifies image dimensions and format with Sharp.
- Saves timeout and error state so the task can be resumed without submitting again.
- Lists and deletes only conversations tracked by local task records.
- Closes surplus blank ChatGPT tabs without touching conversation tabs.

## Prerequisites

- Node.js 22 or newer.
- Google Chrome with an active ChatGPT login.
- The official [Playwright MCP Bridge extension](https://chromewebstore.google.com/detail/playwright-mcp-bridge/mmlmfjhmonkocbjadbfplnigmagldckm).

Despite the extension's name, this project uses it only as the transport for the standalone Playwright CLI. No MCP client is required.

For unattended connections, open the extension status page, copy its unique token, and store it locally:

```powershell
$env:PLAYWRIGHT_MCP_EXTENSION_TOKEN = "your-local-extension-token"
```

Treat this token as a browser-control credential. Do not put it in request JSON, logs, source control, or agent prompts.

## Install

```powershell
npm install
npm run build
npm link
```

Verify the installation:

```powershell
chatgpt-image doctor
chatgpt-image connect
```

Without a configured token, the extension may ask the user to select or approve a Chrome tab during `connect`.

## Run a new image request

```powershell
chatgpt-image run --input examples/new.json
```

Or pipe JSON through standard input:

```powershell
Get-Content examples/new.json -Raw | chatgpt-image run
```

## Continue an image conversation

```powershell
chatgpt-image run --input examples/continue.json
```

`continue` accepts either `thread_id` or a complete `https://chatgpt.com/c/...` URL.

## Resume without resubmitting

```powershell
chatgpt-image resume --task-id atk1-keyframe-v1
```

Use `resume` after `timed_out`, `login_required`, `human_action_required`, or `download_failed`. It reopens the recorded conversation and checks the existing response before taking further action.

Do not create a new task or use `force_resubmit` merely because image generation is slow.

## Inspect state

```powershell
chatgpt-image status --task-id atk1-keyframe-v1
```

Task data is stored under `%LOCALAPPDATA%\chatgpt-image` on Windows. Override it with `CHATGPT_IMAGE_HOME` when needed.

## Manage tracked conversations and blank tabs

List only conversations that have a thread recorded by this CLI:

```powershell
chatgpt-image conversations
```

Delete one tracked ChatGPT conversation while retaining its local task record and deletion timestamp:

```powershell
chatgpt-image delete --task-id atk1-keyframe-v1
```

The delete command does not accept arbitrary conversation URLs. It resolves the thread exclusively from the task store, opens that exact thread, uses ChatGPT's delete confirmation UI, and records `conversationDeletedAt` for audit and idempotence.

Close surplus blank ChatGPT tabs while preserving every `/c/...` conversation tab:

```powershell
chatgpt-image prune-tabs --connection cdp --channel chrome --keep 1
```

## Browser connection modes

The default is the extension bridge:

```json
{
  "browser": {
    "connection": "extension",
    "channel": "chrome",
    "session_name": "chatgpt-image"
  }
}
```

Newer Chrome versions can also expose the currently running browser after the user enables `chrome://inspect/#remote-debugging`:

```powershell
chatgpt-image connect --connection cdp --channel chrome
```

Use CDP when local reference-image uploads are required. Some Chrome/extension configurations reject `DOM.setFileInputFiles`; the CLI fails closed when it cannot confirm every attachment and does not submit an image-less prompt. Extension mode remains available where file uploads are permitted.

## Statuses and exit codes

| Status | Exit code | Meaning |
| --- | ---: | --- |
| `completed` | 0 | All new images were downloaded and validated. |
| `failed` | 1 | Unclassified failure or invalid request. |
| `login_required` | 10 | Sign in using the visible Chrome window, then resume. |
| `human_action_required` | 11 | CAPTCHA, risk check, extension approval, or uncertain submission. |
| `content_blocked` | 12 | ChatGPT returned a policy refusal or content block. |
| `timed_out` | 13 | The prompt was preserved; resume later without resubmitting. |
| `download_failed` | 14 | Generated resources were retained and a screenshot was attempted. |
| `ui_changed` | 15 | A required semantic control could not be identified. |

## Title behavior

`title` is retained as the requested task/conversation title and returned as `requested_title`. ChatGPT currently does not expose a stable rename action in the conversation options menu, so version 0.1 does not force a webpage rename. `actual_title` reports the page title assigned by ChatGPT.

## Security boundaries

- Navigation is restricted to `https://chatgpt.com`.
- The wrapper never calls Playwright CLI cookie, local-storage, password, or history commands.
- Request JSON cannot inject arbitrary Playwright code.
- Conversation deletion is restricted to thread IDs already persisted by this CLI; arbitrary URLs cannot be deleted.
- Blank-tab pruning matches only the exact `https://chatgpt.com/` home URL and never closes `/c/...` conversation tabs.
- The extension token is inherited from the local process environment and is never returned.
- Persisted page state is limited to turns created by the current task. Signed URL query strings and inline image payloads are stripped before task state is written.
- A global browser lock serializes tasks. This also guarantees that two edits cannot write to the same conversation concurrently.

## Development

```powershell
npm run build
npm test
npm run check
```

The browser workflow relies primarily on stable semantic signals observed in the current ChatGPT UI:

- `section[data-turn][data-turn-id]` for user/assistant turns
- `#prompt-textarea` for the composer
- `data-testid="upload-photos-input"` for ordered reference uploads
- assistant-turn image resources for result detection
- the image viewer's accessible Save button for original downloads

CSS classes are not used as the primary contract.

## License

[MIT](LICENSE)
