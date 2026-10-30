# Error codes

| Code | Status | Recovery |
| --- | --- | --- |
| `login_required` | `login_required` | Sign in in visible Chrome, then resume. |
| `human_challenge` | `human_action_required` | Resolve CAPTCHA/risk check manually, then resume. |
| `browser_connection_required` | `human_action_required` | Open Chrome and approve/fix the Playwright Bridge connection. |
| `browser_extension_not_installed` | `human_action_required` | Install the official Playwright Bridge extension manually, then reconnect. |
| `submission_uncertain` | `human_action_required` | Inspect the conversation. Do not resubmit blindly. |
| `generation_timeout` | `timed_out` | Resume the existing task later. |
| `content_blocked` | `content_blocked` | Report the webpage refusal/error text. |
| `page_error` | `failed` | Report the ChatGPT page error text and resume after the page is healthy. |
| `upload_not_confirmed` | `failed` | Check that every reference image is supported and visible, then resume. The prompt was not submitted. |
| `upload_failed` | `failed` | Report the upload error text, correct the file/page issue, then resume. The prompt was not submitted. |
| `download_failed` | `download_failed` | Keep the URL/resource metadata and resume after fixing the issue. |
| `ui_changed` | `ui_changed` | Update the semantic browser adapter. |
| `task_id_conflict` | `failed` | Use the original input or assign a new task ID. |
| `invalid_request` | `failed` | Correct the JSON request. |
