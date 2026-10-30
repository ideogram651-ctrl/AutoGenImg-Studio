import { PromptItem, ReferenceFile } from '../../types/index.ts';

export type GenerationOutcome =
  | 'SUCCESS'
  | 'AMBIGUOUS'
  | 'LIMIT'
  | 'AUTH'
  | 'ERROR'
  | 'COMPARISON_UNRESOLVED';

export interface AdapterGenerationResult {
  ready: boolean;
  outcome: GenerationOutcome;
  reason?: string;
  stillGenerating?: boolean;
}

export interface AdapterDownloadResult {
  success: boolean;
  filePath?: string;
  fileSize?: number;
  sha256?: string;
  artifactType?: 'genuine_image' | 'simulation_artifact';
  error?: string;
  errorDetails?: string;
}

export interface SessionInitOptions {
  conversationUrl: string;
  profileDir?: string;
  chromePath?: string;
  debugPort?: number;
  startupTimeoutMs?: number;
  connectionTimeoutMs?: number;
}

export interface IProviderAdapter {
  readonly id: string;
  readonly name: string;
  readonly isDemo: boolean;

  validateConversationUrl(url: string): { valid: boolean; reason?: string };
  isAvailable(): Promise<{ available: boolean; reason?: string; details?: any }>;
  initializeSession(options: SessionInitOptions): Promise<void>;
  submitPrompt(
    item: PromptItem,
    references: ReferenceFile[],
    onProgress?: (stage: string, msg: string) => void
  ): Promise<{ success: boolean; error?: string }>;
  waitForGeneration(
    timeoutMs: number,
    onProgress?: (elapsedMs: number) => void,
    isAbortRequested?: () => boolean
  ): Promise<AdapterGenerationResult>;
  downloadResult(
    promptId: string,
    outputImagesDir: string
  ): Promise<AdapterDownloadResult>;
  setInitialObservationDelayMs?(delayMs: number): void;
  closeSession(): Promise<void>;
}
