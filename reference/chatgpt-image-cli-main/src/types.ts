export type RequestMode = "new" | "continue";

export type ConnectionMode = "extension" | "cdp";

export interface BrowserOptions {
  connection: ConnectionMode;
  channel: string;
  session_name: string;
}

export interface ImageRequest {
  task_id: string;
  mode: RequestMode;
  prompt: string;
  reference_images: string[];
  output_dir: string;
  title?: string;
  thread_id?: string;
  thread_url?: string;
  timeout_seconds: number;
  force_resubmit: boolean;
  browser: BrowserOptions;
}

export type ResultStatus =
  | "completed"
  | "login_required"
  | "human_action_required"
  | "content_blocked"
  | "timed_out"
  | "download_failed"
  | "ui_changed"
  | "failed";

export interface ImageResult {
  path: string;
  width: number;
  height: number;
  format?: string;
  bytes: number;
  source_url?: string;
}

export interface ErrorDetails {
  code: string;
  message: string;
  page_text?: string;
}

export interface ToolResult {
  status: ResultStatus;
  task_id: string;
  thread_id?: string;
  thread_url?: string;
  prompt_sent: string;
  reference_images: string[];
  elapsed_seconds: number;
  worked_for_text?: string;
  images: ImageResult[];
  assistant_text: string;
  requested_title?: string;
  actual_title?: string;
  stage?: TaskStage;
  can_resume?: boolean;
  prompt_submitted?: boolean;
  screenshot_path?: string;
  image_resources?: PageImage[];
  error?: ErrorDetails;
}

export type TaskStage =
  | "created"
  | "connecting"
  | "thread_opened"
  | "preparing"
  | "submitting"
  | "prompt_submitted"
  | "waiting_for_image"
  | "downloading"
  | "completed"
  | "needs_human"
  | "timed_out"
  | "failed";

export interface PageImage {
  src: string;
  alt: string;
  complete: boolean;
  naturalWidth: number;
  naturalHeight: number;
}

export interface PageTurn {
  id: string;
  turn: "user" | "assistant" | string;
  writing: boolean;
  text: string;
  workedForText?: string;
  images: PageImage[];
}

export interface PageState {
  url: string;
  title: string;
  threadId?: string;
  loginRequired: boolean;
  humanChallenge: boolean;
  generating: boolean;
  alerts: string[];
  turns: PageTurn[];
}

export interface TaskRecord {
  version: 1;
  taskId: string;
  request: ImageRequest;
  promptHash: string;
  status: ResultStatus | "running";
  stage: TaskStage;
  createdAt: string;
  updatedAt: string;
  startedAt: string;
  promptSubmitted: boolean;
  baselineTurnIds: string[];
  threadId?: string;
  threadUrl?: string;
  actualTitle?: string;
  downloadedImages: ImageResult[];
  latestPageState?: PageState;
  result?: ToolResult;
  error?: ErrorDetails;
  conversationDeletedAt?: string;
}

export interface CliExecutionResult<T = unknown> {
  exitCode: number;
  stdout: string;
  stderr: string;
  json?: T;
}
