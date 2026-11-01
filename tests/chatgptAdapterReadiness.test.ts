import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'path';
import os from 'os';
import { ChatGPTAdapter } from '../src/server/adapters/chatgptAdapter.ts';
import { ChromeSessionManager } from '../src/server/browser/chromeSessionManager.ts';
import { PromptItem, ReferenceFile } from '../src/types/index.ts';

class MockPage {
  public urlValue = 'https://chatgpt.com/c/test-thread';
  public closed = false;
  public turnElements: Array<{
    id: string;
    role: string;
    innerText: string;
    images: Array<{ src: string; complete: boolean; naturalWidth: number; naturalHeight: number }>;
  }> = [];
  public stopButtonVisible = false;
  public pageLevelErrorVisible = false;
  public pageLevelErrorText = 'Generation error';
  public evaluateThrows = false;

  isClosed(): boolean { return this.closed; }
  async url(): Promise<string> { return this.urlValue; }

  async $(_selector: string): Promise<any | null> {
    if (_selector.includes('stop-button') || _selector.includes('aria-label*="Stop"')) {
      return this.stopButtonVisible ? { isVisible: async () => true } : null;
    }
    if (_selector.includes('text-red') || _selector.includes('role="alert"')) {
      return this.pageLevelErrorVisible
        ? { isVisible: async () => true, innerText: async () => this.pageLevelErrorText }
        : null;
    }
    return null;
  }

  async $$(_selector: string): Promise<any[]> {
    if (_selector === '[data-turn-key]') {
      const elements: any[] = [];
      for (const te of this.turnElements) {
        elements.push({
          getAttribute: async (attr: string) => {
            if (attr === 'data-turn-key') return te.id;
            if (attr === 'data-turn') return te.role;
            return null;
          },
          evaluate: async (_func: string | Function, _arg?: any) => {
            if (this.evaluateThrows) throw new Error('eval failed');
            return te.role === 'assistant';
          },
        });
      }
      return elements;
    }
    return [];
  }

  async evaluate<R>(func: string | Function, _arg?: any): Promise<R> {
    if (this.evaluateThrows) throw new Error('eval failed');
    const funcStr = typeof func === 'function' ? func.toString() : func;

    if (funcStr.includes('window.scrollTo')) {
      return undefined as unknown as R;
    }

    if (funcStr.includes('prompt-textarea') || funcStr.includes('contenteditable')) {
      // Composer-enabled check for idle-state detection: return true (composer is enabled)
      return true as unknown as R;
    }


    if (funcStr.includes('generated-image-preview')) {
      // Detailed image detection: return array of { src, turnKey, ready } objects
      if (funcStr.includes('turnKey') || funcStr.includes('naturalWidth')) {
        const results: any[] = [];
        for (const te of this.turnElements) {
          if (te.role === 'assistant') {
            for (const img of te.images) {
              const ready =
                img.complete &&
                img.naturalWidth > 0 &&
                img.naturalHeight > 0 &&
                img.src &&
                !img.src.includes('data:image');
              results.push({
                src: img.src,
                turnKey: te.id,
                ready,
              });
            }
          }
        }
        return (results as unknown) as R;
      }

      // Simple count: return total image count
      let count = 0;
      for (const te of this.turnElements) {
        count += te.images.length;
      }
      return (count as unknown) as R;
    }

    if (funcStr.includes('data-turn-key=')) {
      // _arg is the turnId passed by the adapter as the second argument
      const turnId = typeof _arg === 'string' ? _arg : '';
      const turn = this.turnElements.find((t) => t.id === turnId);
      if (!turn) return ([] as unknown) as R;

      // If the function asks for innerText, return the turn's text
      if (funcStr.includes('innerText')) {
        return ((turn.innerText || '').slice(0, 120000) as unknown) as R;
      }

      // Otherwise return images
      return (turn.images.map((img) => ({
        src: img.src,
        complete: img.complete,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
      })) as unknown) as R;
    }

    if (funcStr.includes('document.body') || funcStr.includes('innerText')) {
      const allText = this.turnElements.map((t) => t.innerText).join('\n');
      return (allText as unknown) as R;
    }

    try {
      const f = typeof func === 'function' ? func : new Function('return ' + func) as Function;
      return (await f()) as unknown as R;
    } catch {
      return null as unknown as R;
    }
  }

  async waitForTimeout(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  async waitForSelector(_selector: string, _options?: any): Promise<any | null> {
    return null;
  }

  async waitForEvent(_event: string, _options?: any): Promise<any> {
    return null;
  }

  async screenshot(_options?: any): Promise<Buffer> {
    return Buffer.from('mock-screenshot');
  }

  async $eval(_selector: string, _func: any): Promise<any> {
    return false;
  }

  async click(_selector: string): Promise<void> { /* no-op */ }

  async fill(_selector: string, _value: string): Promise<void> { /* no-op */ }

  async keyboard(): Promise<{ press: (key: string) => Promise<void> }> {
    return { press: async () => {} };
  }
}

function makeAdapter(page: MockPage): ChatGPTAdapter {
  const manager = new ChromeSessionManager();
  (manager as any).page = page;
  (manager as any).context = {};
  const adapter = new ChatGPTAdapter(manager);
  // Skip observation delay in unit tests for fast execution.
  adapter.setInitialObservationDelayMs(0);
  return adapter;
}

/**
 * Simulates what submitPrompt does: captures baseline turn IDs and
 * pre-submission image srcs so that waitForGeneration can correctly
 * attribute new images to the current prompt.
 */
function setupBaseline(adapter: ChatGPTAdapter, page: MockPage): void {
  const assistantTurnIds = new Set<string>();
  const preSubmissionSrcs: string[] = [];
  for (const te of page.turnElements) {
    if (te.role === 'assistant') {
      assistantTurnIds.add(te.id);
      for (const img of te.images) {
        if (img.src && !img.src.includes('data:image')) {
          preSubmissionSrcs.push(img.src);
        }
      }
    }
  }
  (adapter as any).baselineAssistantTurnIds = assistantTurnIds;
  (adapter as any).preSubmissionImageSrcs = preSubmissionSrcs;
  (adapter as any).seenImageSrcs = new Set(preSubmissionSrcs);
  (adapter as any).currentPromptId = 'IMG-TEST';
  (adapter as any).currentPromptSequence = 1;
}

function makePromptItem(id: string, prompt: string): PromptItem {
  return { id, sequence: 1, prompt, referenceIds: [] };
}

function makeReferenceFile(id: string): ReferenceFile {
  return {
    id, name: `ref-${id}`, category: 'style', label: `Reference ${id}`,
    size: 100, type: 'image/png', refType: 'media',
    assignedMode: 'all', assignedPromptIds: [],
  };
}

describe('ChatGPTAdapter readiness detection', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autogenimg-readiness-test-'));
  });

  afterEach(() => {
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  });

  it('detects a newly generated loaded image in a new assistant turn', async () => {
    const page = new MockPage();
    page.turnElements = [
      { id: 'turn-old-1', role: 'assistant', innerText: 'Old response', images: [{ src: 'https://chatgpt.com/image/old.png', complete: true, naturalWidth: 512, naturalHeight: 512 }] },
    ];
    const adapter = makeAdapter(page);
    setupBaseline(adapter, page);

    page.turnElements = [
      { id: 'turn-old-1', role: 'assistant', innerText: 'Old response', images: [{ src: 'https://chatgpt.com/image/old.png', complete: true, naturalWidth: 512, naturalHeight: 512 }] },
      { id: 'turn-new-1', role: 'assistant', innerText: 'Here is your image', images: [{ src: 'https://chatgpt.com/image/new.png', complete: true, naturalWidth: 1024, naturalHeight: 1024 }] },
    ];
    page.stopButtonVisible = false;

    const result = await adapter.waitForGeneration(5000);
    assert.strictEqual(result.ready, true, 'Should detect ready image');
    assert.strictEqual(result.outcome, 'SUCCESS');
  });

  it('does not mistake an old baseline image for the new result', async () => {
    const page = new MockPage();
    page.turnElements = [
      { id: 'turn-old-1', role: 'assistant', innerText: 'Old response', images: [{ src: 'https://chatgpt.com/image/old.png', complete: true, naturalWidth: 512, naturalHeight: 512 }] },
    ];
    const adapter = makeAdapter(page);
    setupBaseline(adapter, page);

    page.turnElements = [
      { id: 'turn-old-1', role: 'assistant', innerText: 'Old response', images: [{ src: 'https://chatgpt.com/image/old.png', complete: true, naturalWidth: 512, naturalHeight: 512 }] },
    ];
    page.stopButtonVisible = false;

    const result = await adapter.waitForGeneration(2000);
    assert.strictEqual(result.ready, false, 'Should not treat old image as new result');
    assert.strictEqual(result.outcome, 'AMBIGUOUS');
  });

  it('excludes data:image URLs from readiness', async () => {
    const page = new MockPage();
    page.turnElements = [
      { id: 'turn-old-1', role: 'assistant', innerText: 'Old response', images: [] },
    ];
    const adapter = makeAdapter(page);
    setupBaseline(adapter, page);

    page.turnElements = [
      { id: 'turn-old-1', role: 'assistant', innerText: 'Old response', images: [] },
      { id: 'turn-new-1', role: 'assistant', innerText: 'Here is your image', images: [
        { src: 'data:image/png;base64,iVBORw0', complete: true, naturalWidth: 32, naturalHeight: 32 },
      ] },
    ];
    page.stopButtonVisible = false;

    const result = await adapter.waitForGeneration(2000);
    assert.strictEqual(result.ready, false, 'Should not treat data:image as ready');
    assert.strictEqual(result.outcome, 'AMBIGUOUS');
  });

  it('rejects an image that is not yet loaded (naturalWidth = 0)', async () => {
    const page = new MockPage();
    page.turnElements = [
      { id: 'turn-old-1', role: 'assistant', innerText: 'Old response', images: [] },
    ];
    const adapter = makeAdapter(page);
    setupBaseline(adapter, page);

    page.turnElements = [
      { id: 'turn-old-1', role: 'assistant', innerText: 'Old response', images: [] },
      { id: 'turn-new-1', role: 'assistant', innerText: 'Generating...', images: [
        { src: 'https://chatgpt.com/image/loading.png', complete: false, naturalWidth: 0, naturalHeight: 0 },
      ] },
    ];
    page.stopButtonVisible = true;

    const result = await adapter.waitForGeneration(2000);
    assert.strictEqual(result.ready, false, 'Should not accept unloaded image');
    assert.strictEqual(result.outcome, 'AMBIGUOUS');
  });

  it('detects an image that finishes loading after a delay', async () => {
    const page = new MockPage();
    page.turnElements = [
      { id: 'turn-old-1', role: 'assistant', innerText: 'Old response', images: [] },
    ];
    const adapter = makeAdapter(page);
    setupBaseline(adapter, page);

    page.turnElements = [
      { id: 'turn-old-1', role: 'assistant', innerText: 'Old response', images: [] },
      { id: 'turn-new-1', role: 'assistant', innerText: 'Generating...', images: [
        { src: 'https://chatgpt.com/image/new.png', complete: false, naturalWidth: 0, naturalHeight: 0 },
      ] },
    ];
    page.stopButtonVisible = true;

    setTimeout(() => {
      page.turnElements = [
        { id: 'turn-old-1', role: 'assistant', innerText: 'Old response', images: [] },
        { id: 'turn-new-1', role: 'assistant', innerText: 'Here is your image', images: [
          { src: 'https://chatgpt.com/image/new.png', complete: true, naturalWidth: 1024, naturalHeight: 1024 },
        ] },
      ];
      page.stopButtonVisible = false;
    }, 150);

    const result = await adapter.waitForGeneration(5000);
    assert.strictEqual(result.ready, true, 'Should detect image after it loads');
    assert.strictEqual(result.outcome, 'SUCCESS');
  });

  it('continues observing when generation is still active and no image is ready', async () => {
    const page = new MockPage();
    page.turnElements = [
      { id: 'turn-old-1', role: 'assistant', innerText: 'Old response', images: [] },
    ];
    const adapter = makeAdapter(page);
    setupBaseline(adapter, page);

    page.turnElements = [
      { id: 'turn-old-1', role: 'assistant', innerText: 'Old response', images: [] },
      { id: 'turn-new-1', role: 'assistant', innerText: 'Generating your image...', images: [] },
    ];
    page.stopButtonVisible = true;

    const result = await adapter.waitForGeneration(1500);
    assert.strictEqual(result.ready, false, 'Should not report ready while still generating');
    assert.strictEqual(result.outcome, 'AMBIGUOUS');
    assert.ok(result.stillGenerating, 'Should report stillGenerating');
  });

  it('distinguishes rate limit from silent detection failure', async () => {
    const page = new MockPage();
    page.turnElements = [
      { id: 'turn-old-1', role: 'assistant', innerText: 'Old response', images: [] },
    ];
    const adapter = makeAdapter(page);
    setupBaseline(adapter, page);

    page.turnElements = [
      { id: 'turn-old-1', role: 'assistant', innerText: 'Old response', images: [] },
      { id: 'turn-new-1', role: 'assistant', innerText: "You've reached your limit for image generation.", images: [] },
    ];
    page.stopButtonVisible = false;

    const result = await adapter.waitForGeneration(2000);
    assert.strictEqual(result.ready, false);
    assert.strictEqual(result.outcome, 'LIMIT');
    assert.ok(result.reason?.includes('limit'), 'Reason should mention limit');
  });

  it('detects content policy refusal in new assistant turn', async () => {
    const page = new MockPage();
    page.turnElements = [
      { id: 'turn-old-1', role: 'assistant', innerText: 'Old response', images: [] },
    ];
    const adapter = makeAdapter(page);
    setupBaseline(adapter, page);

    page.turnElements = [
      { id: 'turn-old-1', role: 'assistant', innerText: 'Old response', images: [] },
      { id: 'turn-new-1', role: 'assistant', innerText: "I can't help with generating that image. It violates our content policy.", images: [] },
    ];
    page.stopButtonVisible = false;

    const result = await adapter.waitForGeneration(2000);
    assert.strictEqual(result.ready, false);
    assert.strictEqual(result.outcome, 'AMBIGUOUS');
    const reason = result.reason || '';
    assert.ok(
      reason.includes('refused') || reason.includes('blocked') || reason.includes('policy'),
      'Reason should mention refusal'
    );
  });

  it('detects authentication challenge in new assistant turn', async () => {
    const page = new MockPage();
    page.turnElements = [
      { id: 'turn-old-1', role: 'assistant', innerText: 'Old response', images: [] },
    ];
    const adapter = makeAdapter(page);
    setupBaseline(adapter, page);

    page.turnElements = [
      { id: 'turn-old-1', role: 'assistant', innerText: 'Old response', images: [] },
      { id: 'turn-new-1', role: 'assistant', innerText: 'Log in to continue using image generation.', images: [] },
    ];
    page.stopButtonVisible = false;

    const result = await adapter.waitForGeneration(2000);
    assert.strictEqual(result.ready, false);
    assert.strictEqual(result.outcome, 'AUTH');
  });

  it('provides useful timeout diagnostics when no image is detected', async () => {
    const page = new MockPage();
    page.turnElements = [
      { id: 'turn-old-1', role: 'assistant', innerText: 'Old response', images: [] },
    ];
    const adapter = makeAdapter(page);
    setupBaseline(adapter, page);

    page.turnElements = [
      { id: 'turn-old-1', role: 'assistant', innerText: 'Old response', images: [] },
    ];
    page.stopButtonVisible = false;

    const result = await adapter.waitForGeneration(1500);
    assert.strictEqual(result.ready, false);
    assert.strictEqual(result.outcome, 'AMBIGUOUS');
    assert.ok(result.reason?.includes('timed out'), 'Reason should mention timeout');
    assert.ok(result.reason!.includes('without observable result'), 'Reason should include "without observable result"');
    assert.strictEqual(result.stillGenerating, false);
  });

  it('regression: image ready while stop button still visible should be detected', async () => {
    const page = new MockPage();
    page.turnElements = [
      { id: 'turn-old-1', role: 'assistant', innerText: 'Old response', images: [] },
    ];
    const adapter = makeAdapter(page);
    setupBaseline(adapter, page);

    page.turnElements = [
      { id: 'turn-old-1', role: 'assistant', innerText: 'Old response', images: [] },
      { id: 'turn-new-1', role: 'assistant', innerText: 'Here is your generated image.', images: [
        { src: 'https://chatgpt.com/image/new.png', complete: true, naturalWidth: 1024, naturalHeight: 1024 },
      ] },
    ];
    page.stopButtonVisible = true;

    const result = await adapter.waitForGeneration(5000);
    assert.strictEqual(result.ready, true, 'Should detect ready image even while stop button is visible (regression test)');
    assert.strictEqual(result.outcome, 'SUCCESS');
    assert.strictEqual(result.stillGenerating, false);
  });

  it('readiness success reaches downloadResult', async () => {
    const page = new MockPage();
    page.turnElements = [
      { id: 'turn-old-1', role: 'assistant', innerText: 'Old response', images: [] },
    ];
    const adapter = makeAdapter(page);
    setupBaseline(adapter, page);

    page.turnElements = [
      { id: 'turn-old-1', role: 'assistant', innerText: 'Old response', images: [] },
      { id: 'turn-new-1', role: 'assistant', innerText: 'Here is your image', images: [
        { src: 'https://chatgpt.com/image/new.png', complete: true, naturalWidth: 1024, naturalHeight: 1024 },
      ] },
    ];
    page.stopButtonVisible = false;

    const genResult = await adapter.waitForGeneration(5000);
    assert.strictEqual(genResult.ready, true);

    const imagesDir = path.join(tempDir, 'images');
    fs.mkdirSync(imagesDir, { recursive: true });

    const dlResult = await adapter.downloadResult('IMG-001', imagesDir);
    assert.ok(dlResult, 'downloadResult should return a result object');
  });

  it('downloadResult does not call submitPrompt', async () => {
    const page = new MockPage();
    page.turnElements = [
      { id: 'turn-old-1', role: 'assistant', innerText: 'Old response', images: [] },
    ];
    const adapter = makeAdapter(page);
    setupBaseline(adapter, page);

    let submitCalled = false;
    const origSubmit = adapter.submitPrompt.bind(adapter);
    (adapter as any).submitPrompt = async () => {
      submitCalled = true;
      return { success: true };
    };

    const imagesDir = path.join(tempDir, 'images');
    fs.mkdirSync(imagesDir, { recursive: true });

    await adapter.downloadResult('IMG-001', imagesDir);
    assert.strictEqual(submitCalled, false, 'downloadResult must not call submitPrompt');
  });

  it('only considers images in new assistant turns, not old ones', async () => {
    const page = new MockPage();
    page.turnElements = [
      { id: 'turn-old-1', role: 'assistant', innerText: 'Old response', images: [{ src: 'https://chatgpt.com/image/old.png', complete: true, naturalWidth: 512, naturalHeight: 512 }] },
      { id: 'turn-old-2', role: 'user', innerText: 'Old user prompt', images: [] },
    ];
    const adapter = makeAdapter(page);
    setupBaseline(adapter, page);

    page.turnElements = [
      { id: 'turn-old-1', role: 'assistant', innerText: 'Old response', images: [{ src: 'https://chatgpt.com/image/old.png', complete: true, naturalWidth: 512, naturalHeight: 512 }] },
      { id: 'turn-old-2', role: 'user', innerText: 'Old user prompt', images: [] },
      { id: 'turn-new-1', role: 'assistant', innerText: 'New response', images: [{ src: 'https://chatgpt.com/image/new.png', complete: true, naturalWidth: 1024, naturalHeight: 1024 }] },
    ];
    page.stopButtonVisible = false;

    const result = await adapter.waitForGeneration(5000);
    assert.strictEqual(result.ready, true, 'Should detect new image in new turn');
    assert.strictEqual(result.outcome, 'SUCCESS');
  });

  // Regression test for the button-wrapper DOM structure found in real ChatGPT.
  // The data-testid="generated-image-preview" attribute is on BUTTON elements,
  // not on img elements directly. The selector must find img children of those buttons.
  it('regression: detects images inside [data-testid="generated-image-preview"] buttons', async () => {
    class ButtonWrapperPage extends MockPage {
      async evaluate<R>(func: string | Function, _arg?: any): Promise<R> {
        const funcStr = typeof func === 'function' ? func.toString() : func;

        if (funcStr.includes('window.scrollTo')) {
          return undefined as unknown as R;
        }

        if (funcStr.includes('generated-image-preview')) {
          // Simulate real DOM: [data-testid="generated-image-preview"] is on BUTTON
          // elements containing img children. The fixed selector finds img children.
          if (funcStr.includes('turnKey') || funcStr.includes('naturalWidth')) {
            const results: any[] = [];
            for (const te of this.turnElements) {
              if (te.role === 'assistant') {
                for (const img of te.images) {
                  const ready =
                    img.complete &&
                    img.naturalWidth > 0 &&
                    img.naturalHeight > 0 &&
                    img.src &&
                    !img.src.includes('data:image');
                  results.push({
                    src: img.src,
                    turnKey: te.id,
                    ready,
                  });
                }
              }
            }
            return (results as unknown) as R;
          }

          // Count buttons (each has one img child)
          let count = 0;
          for (const te of this.turnElements) {
            if (te.role === 'assistant') {
              count += te.images.length;
            }
          }
          return (count as unknown) as R;
        }

        return super.evaluate(func, _arg);
      }
    }

    const page = new ButtonWrapperPage();
    page.turnElements = [
      { id: 'turn-old-1', role: 'assistant', innerText: 'Old response', images: [] },
    ];
    const adapter = makeAdapter(page);
    setupBaseline(adapter, page);

    page.turnElements = [
      { id: 'turn-old-1', role: 'assistant', innerText: 'Old response', images: [] },
      { id: 'turn-new-1', role: 'assistant', innerText: 'Here is your generated image.', images: [
        { src: 'https://chatgpt.com/image/new.png', complete: true, naturalWidth: 1024, naturalHeight: 1024 },
      ] },
    ];
    page.stopButtonVisible = false;

    const result = await adapter.waitForGeneration(5000);
    assert.strictEqual(result.ready, true, 'Should detect ready image inside button wrapper');
    assert.strictEqual(result.outcome, 'SUCCESS');
    assert.strictEqual(result.stillGenerating, false);
  });

  // Regression test: prefers images in the responding turn over other new-turn images.
  it('regression: prefers images in the responding turn over other new-turn images', async () => {
    class RespondingTurnPage extends MockPage {
      async evaluate<R>(func: string | Function, _arg?: any): Promise<R> {
        const funcStr = typeof func === 'function' ? func.toString() : func;

        if (funcStr.includes('window.scrollTo')) {
          return undefined as unknown as R;
        }

        if (funcStr.includes('generated-image-preview')) {
          if (funcStr.includes('turnKey') || funcStr.includes('naturalWidth')) {
            const results: any[] = [];
            for (const te of this.turnElements) {
              if (te.role === 'assistant') {
                for (const img of te.images) {
                  const ready =
                    img.complete &&
                    img.naturalWidth > 0 &&
                    img.naturalHeight > 0 &&
                    img.src &&
                    !img.src.includes('data:image');
                  results.push({
                    src: img.src,
                    turnKey: te.id,
                    ready,
                  });
                }
              }
            }
            return (results as unknown) as R;
          }

          let count = 0;
          for (const te of this.turnElements) {
            if (te.role === 'assistant') {
              count += te.images.length;
            }
          }
          return (count as unknown) as R;
        }

        return super.evaluate(func, _arg);
      }
    }

    const page = new RespondingTurnPage();
    page.turnElements = [
      { id: 'turn-old-1', role: 'assistant', innerText: 'Old response', images: [] },
      { id: 'turn-user-1', role: 'user', innerText: 'My prompt', images: [] },
    ];
    const adapter = makeAdapter(page);
    setupBaseline(adapter, page);

    page.turnElements = [
      { id: 'turn-old-1', role: 'assistant', innerText: 'Old response', images: [] },
      { id: 'turn-user-1', role: 'user', innerText: 'My prompt', images: [] },
      { id: 'turn-old-2', role: 'assistant', innerText: 'Old scrolled image', images: [
        { src: 'https://chatgpt.com/image/old-scrolled.png', complete: true, naturalWidth: 512, naturalHeight: 512 },
      ] },
      { id: 'turn-respond-1', role: 'assistant', innerText: 'Here is your image', images: [
        { src: 'https://chatgpt.com/image/respond.png', complete: true, naturalWidth: 1024, naturalHeight: 1024 },
      ] },
    ];
    page.stopButtonVisible = false;

    (adapter as any).submissionTurnKey = 'turn-user-1';

    const result = await adapter.waitForGeneration(5000);
    assert.strictEqual(result.ready, true, 'Should detect image in responding turn');
    assert.strictEqual(result.outcome, 'SUCCESS');
  });

  // Regression test: rejects lazy-loaded old image after submission.
  it('regression: rejects lazy-loaded old image after submission', async () => {
    class LazyLoadPage extends MockPage {
      async evaluate<R>(func: string | Function, _arg?: any): Promise<R> {
        const funcStr = typeof func === 'function' ? func.toString() : func;

        if (funcStr.includes('window.scrollTo')) {
          return undefined as unknown as R;
        }

        if (funcStr.includes('generated-image-preview')) {
          if (funcStr.includes('turnKey') || funcStr.includes('naturalWidth')) {
            const results: any[] = [];
            for (const te of this.turnElements) {
              if (te.role === 'assistant') {
                for (const img of te.images) {
                  const ready =
                    img.complete &&
                    img.naturalWidth > 0 &&
                    img.naturalHeight > 0 &&
                    img.src &&
                    !img.src.includes('data:image');
                  results.push({
                    src: img.src,
                    turnKey: te.id,
                    ready,
                  });
                }
              }
            }
            return (results as unknown) as R;
          }

          let count = 0;
          for (const te of this.turnElements) {
            if (te.role === 'assistant') {
              count += te.images.length;
            }
          }
          return (count as unknown) as R;
        }

        return super.evaluate(func, _arg);
      }
    }

    const page = new LazyLoadPage();
    page.turnElements = [
      { id: 'turn-old-1', role: 'assistant', innerText: 'Old response', images: [
        { src: 'https://chatgpt.com/image/old.png', complete: true, naturalWidth: 512, naturalHeight: 512 },
      ] },
    ];
    const adapter = makeAdapter(page);
    setupBaseline(adapter, page);

    page.turnElements = [
      { id: 'turn-old-1', role: 'assistant', innerText: 'Old response', images: [
        { src: 'https://chatgpt.com/image/old.png', complete: true, naturalWidth: 512, naturalHeight: 512 },
      ] },
      { id: 'turn-respond-1', role: 'assistant', innerText: 'Here is your new image', images: [
        { src: 'https://chatgpt.com/image/new.png', complete: true, naturalWidth: 1024, naturalHeight: 1024 },
      ] },
    ];
    page.stopButtonVisible = false;

    (adapter as any).submissionTurnKey = 'turn-user-1';

    const result = await adapter.waitForGeneration(5000);
    assert.strictEqual(result.ready, true, 'Should detect new image, not old lazy-loaded one');
    assert.strictEqual(result.outcome, 'SUCCESS');
  });

  // Regression test: handles missing turn-key gracefully.
  it('regression: handles missing turn-key gracefully', async () => {
    class NoTurnKeyPage extends MockPage {
      async evaluate<R>(func: string | Function, _arg?: any): Promise<R> {
        const funcStr = typeof func === 'function' ? func.toString() : func;

        if (funcStr.includes('window.scrollTo')) {
          return undefined as unknown as R;
        }

        if (funcStr.includes('generated-image-preview')) {
          if (funcStr.includes('turnKey') || funcStr.includes('naturalWidth')) {
            const results: any[] = [];
            for (const te of this.turnElements) {
              if (te.role === 'assistant') {
                for (const img of te.images) {
                  const ready =
                    img.complete &&
                    img.naturalWidth > 0 &&
                    img.naturalHeight > 0 &&
                    img.src &&
                    !img.src.includes('data:image');
                  results.push({
                    src: img.src,
                    turnKey: null,
                    ready,
                  });
                }
              }
            }
            return (results as unknown) as R;
          }

          let count = 0;
          for (const te of this.turnElements) {
            if (te.role === 'assistant') {
              count += te.images.length;
            }
          }
          return (count as unknown) as R;
        }

        return super.evaluate(func, _arg);
      }
    }

    const page = new NoTurnKeyPage();
    page.turnElements = [
      { id: 'turn-old-1', role: 'assistant', innerText: 'Old response', images: [
        { src: 'https://chatgpt.com/image/old.png', complete: true, naturalWidth: 512, naturalHeight: 512 },
      ] },
    ];
    const adapter = makeAdapter(page);
    setupBaseline(adapter, page);

    page.turnElements = [
      { id: 'turn-old-1', role: 'assistant', innerText: 'Old response', images: [
        { src: 'https://chatgpt.com/image/old.png', complete: true, naturalWidth: 512, naturalHeight: 512 },
      ] },
      { id: 'turn-new-1', role: 'assistant', innerText: 'New image', images: [
        { src: 'https://chatgpt.com/image/new.png', complete: true, naturalWidth: 1024, naturalHeight: 1024 },
      ] },
    ];
    page.stopButtonVisible = false;

    const result = await adapter.waitForGeneration(5000);
    assert.strictEqual(result.ready, false, 'Should not match image without turnKey');
    assert.strictEqual(result.outcome, 'AMBIGUOUS');
  });
});