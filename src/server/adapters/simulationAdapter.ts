import fs from 'node:fs';
import path from 'path';
import { IProviderAdapter, AdapterGenerationResult, AdapterDownloadResult } from './baseAdapter.ts';
import { PromptItem, ReferenceFile } from '../../types/index.ts';

export class SimulationAdapter implements IProviderAdapter {
  public readonly id = 'simulation';
  public readonly name = 'Demo Simulation Mode (Safe UI Evaluation)';
  public readonly isDemo = true;

  private currentItem: PromptItem | null = null;
  private conversationUrl = '';

  public validateConversationUrl(url: string): { valid: boolean; reason?: string } {
    if (!url || typeof url !== 'string' || !url.trim()) {
      return { valid: false, reason: 'A conversation URL or simulation identifier is required.' };
    }
    return { valid: true };
  }

  public async isAvailable(): Promise<{ available: boolean; reason?: string }> {
    return { available: true };
  }

  public async initializeSession(options: { conversationUrl: string; profileDir?: string }): Promise<void> {
    this.conversationUrl = options.conversationUrl;
  }

  public async submitPrompt(
    item: PromptItem,
    references: ReferenceFile[],
    onProgress?: (stage: string, msg: string) => void
  ): Promise<{ success: boolean; error?: string }> {
    this.currentItem = item;
    if (onProgress) {
      onProgress('PREPARING', `[DEMO MODE] Formatted prompt ${item.id} with ${references.length} reference(s).`);
      await new Promise((r) => setTimeout(r, 400));
      onProgress('SUBMITTING', `[DEMO MODE] Simulated submission to UI for ${item.id}.`);
      await new Promise((r) => setTimeout(r, 400));
    }
    return { success: true };
  }

  public async waitForGeneration(
    timeoutMs: number,
    onProgress?: (elapsedMs: number) => void,
    isAbortRequested?: () => boolean
  ): Promise<AdapterGenerationResult> {
    if (!this.currentItem) {
      return { ready: false, outcome: 'ERROR', reason: 'No active prompt in adapter session.' };
    }

    // Check for deliberate simulation conditions (e.g. for testing review or limit)
    const promptText = (this.currentItem.prompt || '').toLowerCase();
    if (promptText.includes('[simulate-limit]')) {
      return {
        ready: false,
        outcome: 'LIMIT',
        reason: 'Provider usage limit reached: "You have reached your daily image generation quota."',
      };
    }

    if (promptText.includes('[simulate-auth]')) {
      return {
        ready: false,
        outcome: 'AUTH',
        reason: 'Authentication challenge detected: Login session expired or Cloudflare turnstile active.',
      };
    }

    if (promptText.includes('[simulate-review]') || promptText.includes('ambiguous')) {
      return {
        ready: false,
        outcome: 'AMBIGUOUS',
        reason: 'Simulation test: Generation completed with visual artifact warning / ambiguous content policy notice.',
      };
    }

    // Normal generation simulation: takes ~1.5s
    const steps = 3;
    const stepDuration = 500;
    for (let i = 1; i <= steps; i++) {
      if (isAbortRequested && isAbortRequested()) {
        return {
          ready: false,
          outcome: 'AMBIGUOUS',
          reason: 'Simulation interrupted by user pause/stop request.',
          stillGenerating: false,
        };
      }
      await new Promise((r) => setTimeout(r, stepDuration));
      if (onProgress) {
        onProgress(i * stepDuration);
      }
    }

    return {
      ready: true,
      outcome: 'SUCCESS',
    };
  }

  public async downloadResult(
    promptId: string,
    outputImagesDir: string
  ): Promise<AdapterDownloadResult> {
    try {
      if (!fs.existsSync(outputImagesDir)) {
        fs.mkdirSync(outputImagesDir, { recursive: true });
      }

      const fileName = `${promptId}.svg`;
      const filePath = path.join(outputImagesDir, fileName);

      // Generate a high-contrast, informative SVG asset
      const item = this.currentItem;
      const promptText = item ? item.prompt.slice(0, 100) : 'AutoGenImg Generated Visual';
      const seq = item ? item.sequence : 1;
      const timestamp = new Date().toLocaleTimeString();

      const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" width="1280" height="720">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0F172A" />
      <stop offset="50%" stop-color="#1E1B4B" />
      <stop offset="100%" stop-color="#0B0D12" />
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#6366F1" />
      <stop offset="100%" stop-color="#8B5CF6" />
    </linearGradient>
  </defs>
  <rect width="1280" height="720" fill="url(#bg)" />
  <rect x="40" y="40" width="1200" height="640" rx="16" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.12)" stroke-width="2" />
  <rect x="80" y="80" width="220" height="42" rx="8" fill="url(#accent)" />
  <text x="190" y="107" font-family="system-ui, sans-serif" font-size="18" font-weight="bold" fill="#FFFFFF" text-anchor="middle">DEMO SIMULATION</text>
  <text x="80" y="180" font-family="system-ui, sans-serif" font-size="44" font-weight="bold" fill="#F8FAFC">${promptId}</text>
  <text x="80" y="225" font-family="system-ui, sans-serif" font-size="20" fill="#94A3B8">Sequence #${seq} &bull; Aspect Ratio 16:9 &bull; Saved ${timestamp}</text>
  <rect x="80" y="270" width="1120" height="320" rx="12" fill="rgba(0,0,0,0.4)" stroke="rgba(255,255,255,0.08)" />
  <text x="120" y="320" font-family="system-ui, sans-serif" font-size="16" font-weight="600" fill="#A5B4FC">PROMPT VISUAL SPECIFICATION:</text>
  <foreignObject x="120" y="340" width="1040" height="230">
    <div xmlns="http://www.w3.org/1999/xhtml" style="color: #E2E8F0; font-family: system-ui, sans-serif; font-size: 20px; line-height: 1.6;">
      ${escapeXml(promptText)}
    </div>
  </foreignObject>
  <text x="80" y="640" font-family="monospace" font-size="14" fill="#64748B">AutoGenImg Studio &bull; Local-first verifiable run artifact &bull; ${fileName}</text>
</svg>`;

      fs.writeFileSync(filePath, svgContent, 'utf-8');
      const stats = fs.statSync(filePath);
      const crypto = await import('node:crypto');
      const sha256 = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');

      return {
        success: true,
        filePath,
        fileSize: stats.size,
        sha256,
        artifactType: 'simulation_artifact',
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Failed to save simulated download: ${err.message}`,
      };
    }
  }

  public async closeSession(): Promise<void> {
    this.currentItem = null;
  }
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
