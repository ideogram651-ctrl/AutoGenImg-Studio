export type PromptStatus =
  | 'PENDING'
  | 'PREPARING'
  | 'SUBMITTING'
  | 'GENERATING'
  | 'RESULT_READY'
  | 'DOWNLOADING'
  | 'SAVED'
  | 'NEEDS_REVIEW'
  | 'FAILED'
  | 'SKIPPED'
  | 'PAUSED'
  | 'PAUSED_PROVIDER_LIMIT'
  | 'BLOCKED_AUTH'
  | 'CANCELLED';

export type QueueOverallStatus =
  | 'IDLE'
  | 'RUNNING'
  | 'PAUSED'
  | 'PAUSED_PROVIDER_LIMIT'
  | 'BLOCKED_AUTH'
  | 'COMPLETED'
  | 'STOPPED'
  | 'ERROR';

export type ProviderType = 'chatgpt' | 'gemini' | 'simulation';

export type ReferenceType = 'text' | 'media' | 'json' | 'video';

export type ReferenceCategory =
  | 'style'
  | 'character'
  | 'environment'
  | 'object'
  | 'custom';

export interface ReferenceFile {
  id: string; // e.g. REF-STYLE-01
  name: string;
  category: ReferenceCategory;
  label: string;
  size: number;
  type: string; // mime type, e.g. image/png, application/pdf, text/plain
  refType?: ReferenceType; // 'text' | 'media'
  assetId?: string;
  path?: string;
  dataUrl?: string; // for image preview in browser
  textContent?: string; // optional text reference content
  checksum?: string; // sha256 checksum
  assignedMode: 'all' | 'selected';
  assignedPromptIds: string[]; // e.g. ['IMG-001', 'IMG-003']
  uploadedAt?: string;
}

export interface PromptItem {
  id: string; // e.g. IMG-001
  sequence: number;
  startSeconds?: number;
  endSeconds?: number;
  prompt: string;
  referenceIds: string[];
  status?: PromptStatus;
  outputFile?: string;
  fileSize?: number;
  attemptCount?: number;
  generationStartTime?: string;
  generationDurationMs?: number;
  downloadDurationMs?: number;
  totalDurationMs?: number;
  reviewReason?: string;
  suggestedAction?: string;
  errorDetails?: string;
  history?: Array<{
    attempt: number;
    timestamp: string;
    status: PromptStatus;
    reason?: string;
  }>;
}

export interface PromptBundle {
  schemaVersion: string;
  project: {
    name: string;
    durationSeconds?: number;
    imageIntervalSeconds?: number;
    aspectRatio?: string;
    styleDescription?: string;
    instructions?: string;
  };
  prompts: PromptItem[];
}

export interface ProjectConfig {
  id: string;
  name: string;
  outputPath: string;
  provider: ProviderType;
  conversationUrl: string;
  imageIntervalSeconds: number;
  targetDurationSeconds: number;
  aspectRatio: string;
  styleDescription: string;
  instructions?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ManifestItem {
  id: string;
  runId?: string;
  sequence: number;
  prompt: string;
  status: PromptStatus;
  outputFile: string | null;
  fileSize: number | null;
  sha256?: string;
  artifactType?: 'genuine_image' | 'simulation_artifact';
  referenceIds: string[];
  generationStartTime?: string;
  completedAt?: string;
  generationDurationMs?: number;
  downloadDurationMs?: number;
  totalDurationMs?: number;
  reviewReason?: string;
  suggestedAction?: string;
  errorCode?: string;
  errorDetails?: string;
  attempts: number;
}

export interface RunManifest {
  runId: string;
  projectId: string;
  projectName: string;
  provider: ProviderType;
  conversationUrl: string;
  outputPath: string;
  imagesDir?: string;
  artifactType?: 'genuine_image' | 'simulation_artifact';
  startTime: string;
  endTime?: string;
  overallStatus: QueueOverallStatus;
  totalPrompts: number;
  processedCount: number;
  savedCount: number;
  reviewCount: number;
  failedCount: number;
  skippedCount: number;
  cancelledCount: number;
  pauseCount: number;
  wallClockDurationMs: number;
  activeProcessingDurationMs: number;
  items: ManifestItem[];
}

export interface ProjectSummary {
  id: string;
  name: string;
  outputPath: string;
  provider: ProviderType;
  createdAt: string;
  updatedAt: string;
  promptCount: number;
  referenceCount: number;
  lastRunStatus?: QueueOverallStatus;
  lastRunId?: string;
  savedCount?: number;
}

export interface RecentSuggestions {
  conversationUrls: string[];
  outputPaths: string[];
  styleDescriptions: string[];
  instructions: string[];
}

export interface ProjectArchiveMetadata {
  schemaVersion: number;
  version: string;
  projectId: string;
  projectName: string;
  exportedAt: string;
  checksums: Record<string, string>;
}

export interface LogEvent {
  id: string;
  timestamp: string;
  runId?: string;
  promptId?: string;
  type: string;
  severity: 'info' | 'warn' | 'error' | 'success';
  message: string;
  durationMs?: number;
  outputPath?: string;
}

export interface QueueProgressState {
  runId: string;
  projectId: string;
  overallStatus: QueueOverallStatus;
  currentPromptId: string | null;
  currentSequence: number;
  currentStage: string;
  totalPrompts: number;
  processedCount: number;
  savedCount: number;
  reviewCount: number;
  failedCount: number;
  skippedCount: number;
  percentage: number;
  elapsedMs: number;
  currentItemElapsedMs: number;
  isPaused: boolean;
  pauseReason?: string;
  isDemoMode: boolean;
}

export interface ValidationError {
  promptId?: string;
  field?: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  promptCount: number;
  calculatedImageCount?: number;
}
