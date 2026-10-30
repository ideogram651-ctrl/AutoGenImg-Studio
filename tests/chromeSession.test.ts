import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'path';
import os from 'os';
import { ChromeSessionManager } from '../src/server/browser/chromeSessionManager.ts';
import { SettingsManager } from '../src/server/settingsManager.ts';
import { ChatGPTAdapter } from '../src/server/adapters/chatgptAdapter.ts';
import { GeminiAdapter } from '../src/server/adapters/geminiAdapter.ts';
import { SimulationAdapter } from '../src/server/adapters/simulationAdapter.ts';
import { QueueOrchestrator } from '../src/server/queueOrchestrator.ts';
import { ProjectManager } from '../src/server/projectManager.ts';
import { ProjectConfig, PromptBundle } from '../src/types/index.ts';

describe('ChromeSessionManager & Settings Persistence', () => {
  let tempDir: string;
  let originalEnvChromePath: string | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autogenimg-test-'));
    originalEnvChromePath = process.env.CHROME_PATH;
  });

  afterEach(() => {
    if (originalEnvChromePath !== undefined) {
      process.env.CHROME_PATH = originalEnvChromePath;
    } else {
      delete process.env.CHROME_PATH;
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  test('locates Chrome when explicit configured path exists', () => {
    const fakeChromePath = path.join(tempDir, 'fake-chrome.exe');
    fs.writeFileSync(fakeChromePath, 'fake binary');

    const manager = new ChromeSessionManager(tempDir);
    const result = manager.detectChrome(fakeChromePath);

    assert.strictEqual(result.found, true);
    assert.strictEqual(result.source, 'settings');
    assert.strictEqual(path.normalize(result.executablePath!), path.normalize(fakeChromePath));
  });

  test('locates Chrome when CHROME_PATH environment variable is set', () => {
    const fakeChromePath = path.join(tempDir, 'env-chrome.exe');
    fs.writeFileSync(fakeChromePath, 'fake binary');
    process.env.CHROME_PATH = fakeChromePath;

    const manager = new ChromeSessionManager(tempDir);
    const result = manager.detectChrome();

    assert.strictEqual(result.found, true);
    assert.strictEqual(result.source, 'env');
    assert.strictEqual(path.normalize(result.executablePath!), path.normalize(fakeChromePath));
  });

  test('handles missing Chrome installation with clear actionable error', () => {
    delete process.env.CHROME_PATH;
    const nonExistentPath = path.join(tempDir, 'nonexistent', 'chrome.exe');

    const manager = new ChromeSessionManager(tempDir);
    const result = manager.detectChrome(nonExistentPath);

    assert.strictEqual(result.found, false);
    assert.strictEqual(result.source, 'settings');
    assert.ok(result.error?.includes('Configured Google Chrome executable does not exist'));
  });

  test('resolves relative profile paths against defined app root directory', () => {
    const manager = new ChromeSessionManager(tempDir);
    const relativeProfile = './custom-browser-profile';
    const validation = manager.resolveAndValidateProfileDir(relativeProfile);

    assert.strictEqual(validation.valid, true);
    const expected = path.normalize(path.resolve(tempDir, relativeProfile));
    assert.strictEqual(path.normalize(validation.resolvedPath), expected);
    assert.strictEqual(fs.existsSync(validation.resolvedPath), true);
  });

  test('rejects default Chrome user data directory due to security restriction', () => {
    const manager = new ChromeSessionManager(tempDir);
    const settingsManager = new SettingsManager(tempDir, tempDir);

    const localAppData = process.env.LOCALAPPDATA || 'C:\\Users\\Default\\AppData\\Local';
    const defaultProfilePath = path.join(localAppData, 'Google', 'Chrome', 'User Data');

    const validation = manager.resolveAndValidateProfileDir(defaultProfilePath);
    assert.strictEqual(validation.valid, false);
    assert.ok(validation.error?.includes('Security restriction'));

    const settingsUpdate = settingsManager.updateSettings({ profileDir: defaultProfilePath });
    assert.strictEqual(settingsUpdate.success, false);
    assert.ok(settingsUpdate.error?.includes('Security Restriction'));
  });

  test('SettingsManager persists settings and validates port and timeouts', () => {
    const settingsManager = new SettingsManager(tempDir, tempDir);

    const initial = settingsManager.getSettings();
    assert.strictEqual(initial.debugPort, 9222);

    // Update with valid settings
    const updateResult = settingsManager.updateSettings({
      debugPort: 9333,
      genTimeoutSeconds: 90,
      profileDir: './dedicated-test-profile',
    });

    assert.strictEqual(updateResult.success, true);
    assert.strictEqual(updateResult.settings?.debugPort, 9333);
    assert.strictEqual(updateResult.settings?.genTimeoutSeconds, 90);

    // Verify persistence across new instance reading from same directory
    const reloaded = new SettingsManager(tempDir, tempDir);
    assert.strictEqual(reloaded.getSettings().debugPort, 9333);
    assert.strictEqual(reloaded.getSettings().genTimeoutSeconds, 90);

    // Invalid port should fail
    const invalidPort = settingsManager.updateSettings({ debugPort: 999999 });
    assert.strictEqual(invalidPort.success, false);
    assert.ok(invalidPort.error?.includes('port'));
  });

  test('SettingsManager prevents modifying profile directory while queue is running', () => {
    const settingsManager = new SettingsManager(tempDir, tempDir);

    const blocked = settingsManager.updateSettings(
      { profileDir: './new-profile-location' },
      true // isQueueRunning = true
    );

    assert.strictEqual(blocked.success, false);
    assert.ok(blocked.error?.includes('while a queue run is active'));
  });

  test('checkCdpEndpoint reports unreachable when port is closed', async () => {
    const manager = new ChromeSessionManager(tempDir);
    // Port 64999 is highly unlikely to have anything running
    const result = await manager.checkCdpEndpoint(64999);
    assert.strictEqual(result.reachable, false);
    assert.strictEqual(result.isChromeCdp, false);
  });

  test('safe disconnect behavior does not throw when no session is active', async () => {
    const manager = new ChromeSessionManager(tempDir);
    // Should safely complete without error
    await assert.doesNotReject(async () => {
      await manager.disconnect();
    });
  });

  test('checkCdpEndpoint detects when port is occupied by unrelated HTTP server', async () => {
    const http = await import('node:http');
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ service: 'other-app' }));
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as any).port;

    try {
      const manager = new ChromeSessionManager(tempDir);
      const result = await manager.checkCdpEndpoint(port);

      assert.strictEqual(result.reachable, true);
      assert.strictEqual(result.isChromeCdp, false);
      assert.ok(result.error?.includes('not a recognized Chrome DevTools Protocol server'));

      // If fake chrome binary exists, launchChrome checks port and detects the conflict
      const fakeChrome = path.join(tempDir, 'fake-chrome.exe');
      fs.writeFileSync(fakeChrome, '');
      const launch = await manager.launchChrome({ debugPort: port, chromePath: fakeChrome });
      assert.strictEqual(launch.success, false);
      assert.ok(launch.error?.includes('occupied by an unrelated service'));
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  test('launchChrome fails gracefully if Chrome executable is missing', async () => {
    delete process.env.CHROME_PATH;
    const manager = new ChromeSessionManager(tempDir);
    const result = await manager.launchChrome({
      chromePath: path.join(tempDir, 'no-such-chrome.exe'),
    });
    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes('Google Chrome'));
  });
});

describe('Provider Adapters & Shared Session Architecture', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autogenimg-adapter-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  test('SimulationAdapter remains functional and reports demo mode', async () => {
    const sim = new SimulationAdapter();
    assert.strictEqual(sim.isDemo, true);
    const avail = await sim.isAvailable();
    assert.strictEqual(avail.available, true);
    assert.strictEqual(sim.validateConversationUrl('https://demo.local').valid, true);

    await assert.doesNotReject(async () => {
      await sim.initializeSession({ conversationUrl: 'https://demo.local' });
    });
  });

  test('ChatGPTAdapter and GeminiAdapter validate URLs correctly', () => {
    const chatgpt = new ChatGPTAdapter();
    const gemini = new GeminiAdapter();

    assert.strictEqual(chatgpt.validateConversationUrl('https://chatgpt.com/c/123').valid, true);
    assert.strictEqual(chatgpt.validateConversationUrl('https://chat.openai.com/c/123').valid, true);
    assert.strictEqual(chatgpt.validateConversationUrl('https://google.com').valid, false);

    assert.strictEqual(gemini.validateConversationUrl('https://gemini.google.com/app/123').valid, true);
    assert.strictEqual(gemini.validateConversationUrl('https://chatgpt.com').valid, false);
  });

  test('Adapter isAvailable checks Playwright and Chrome presence with structured details', async () => {
    const manager = new ChromeSessionManager(tempDir);
    const chatgpt = new ChatGPTAdapter(manager);
    const gemini = new GeminiAdapter(manager);

    const chatgptAvail = await chatgpt.isAvailable();
    const geminiAvail = await gemini.isAvailable();

    // Availability returns a boolean and does NOT throw
    assert.strictEqual(typeof chatgptAvail.available, 'boolean');
    assert.strictEqual(typeof geminiAvail.available, 'boolean');
    assert.strictEqual(chatgptAvail.available, geminiAvail.available);
  });
});

describe('Queue Behavior on Browser Initialization Failure & Auth Requirement', () => {
  let tempDir: string;
  let projectManager: ProjectManager;
  let settingsManager: SettingsManager;
  let sampleProject: ProjectConfig;
  let sampleBundle: PromptBundle;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autogenimg-queue-test-'));
    projectManager = new ProjectManager(tempDir);
    settingsManager = new SettingsManager(tempDir, tempDir);

    sampleProject = {
      id: 'test-proj-01',
      name: 'Test Project',
      outputPath: path.join(tempDir, 'output-proj'),
      provider: 'chatgpt',
      conversationUrl: 'https://chatgpt.com/c/test-chat',
      imageIntervalSeconds: 5,
      targetDurationSeconds: 10,
      aspectRatio: '16:9',
      styleDescription: 'Test style',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    sampleBundle = {
      schemaVersion: '1.0',
      project: { name: 'Test' },
      prompts: [
        { id: 'IMG-001', sequence: 1, prompt: 'Prompt 1', referenceIds: [] },
        { id: 'IMG-002', sequence: 2, prompt: 'Prompt 2', referenceIds: [] },
      ],
    };
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  test('queue does not enter running state when session initialization fails', async () => {
    const orchestrator = new QueueOrchestrator(projectManager, settingsManager);
    orchestrator.setProject(sampleProject, sampleBundle);

    // Mock an adapter that fails initialization
    const failingAdapter: any = {
      id: 'failing',
      name: 'Failing Adapter',
      isDemo: false,
      validateConversationUrl: () => ({ valid: true }),
      isAvailable: async () => ({ available: true }),
      initializeSession: async () => {
        throw new Error('Chrome failed to attach on port 9222: connection refused');
      },
      closeSession: async () => {},
    };

    (orchestrator as any).adapter = failingAdapter;

    const result = await orchestrator.startRun();

    // Must NOT report false success
    assert.strictEqual(result.success, false);
    assert.ok(result.message.includes('Failed to initialize browser session'));

    // Overall status must be ERROR, not RUNNING
    const state = orchestrator.getProgressState();
    assert.strictEqual(state.overallStatus, 'ERROR');
  });

  test('queue enters BLOCKED_AUTH state when authentication is required', async () => {
    const orchestrator = new QueueOrchestrator(projectManager, settingsManager);
    orchestrator.setProject(sampleProject, sampleBundle);

    // Mock an adapter that detects authentication is required
    const authAdapter: any = {
      id: 'auth-needed',
      name: 'Auth Needed Adapter',
      isDemo: false,
      validateConversationUrl: () => ({ valid: true }),
      isAvailable: async () => ({ available: true }),
      initializeSession: async () => {
        throw new Error('Authentication required: ChatGPT login screen detected. Please log in manually.');
      },
      submitPrompt: async () => ({ success: true }),
      waitForGeneration: async () => ({ ready: true, outcome: 'SUCCESS' }),
      downloadResult: async () => ({ success: true, filePath: 'test.png', fileSize: 10 }),
      closeSession: async () => {},
    };

    (orchestrator as any).adapter = authAdapter;

    const result = await orchestrator.startRun();

    assert.strictEqual(result.success, false);
    assert.ok(result.message.includes('Authentication required'));

    // State must be BLOCKED_AUTH, preserving all prompt items
    const state = orchestrator.getProgressState();
    assert.strictEqual(state.overallStatus, 'BLOCKED_AUTH');
    assert.strictEqual(state.processedCount, 0);

    // Resume should be permitted from BLOCKED_AUTH
    const resumeResult = orchestrator.resumeRun();
    assert.strictEqual(resumeResult.success, true);
  });

  test('browser settings correctly propagate to initializeSession call', async () => {
    settingsManager.updateSettings({
      debugPort: 9444,
      profileDir: './propagated-profile',
      chromePath: 'C:\\Custom\\chrome.exe',
      startupTimeoutMs: 12000,
      connectionTimeoutMs: 8000,
    });

    const orchestrator = new QueueOrchestrator(projectManager, settingsManager);
    orchestrator.setProject(sampleProject, sampleBundle);

    let receivedOptions: any = null;
    const capturingAdapter: any = {
      id: 'capturing',
      name: 'Capturing Adapter',
      isDemo: false,
      validateConversationUrl: () => ({ valid: true }),
      isAvailable: async () => ({ available: true }),
      initializeSession: async (options: any) => {
        receivedOptions = options;
      },
      submitPrompt: async () => ({ success: true }),
      waitForGeneration: async () => ({ ready: true, outcome: 'SUCCESS' }),
      downloadResult: async (id: string, dir: string) => {
        const filePath = path.join(dir, `${id}.png`);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filePath, 'fake image data');
        return { success: true, filePath, fileSize: 15 };
      },
      closeSession: async () => {},
    };

    (orchestrator as any).adapter = capturingAdapter;

    const result = await orchestrator.startRun();
    assert.strictEqual(result.success, true);

    // Verify options passed
    assert.ok(receivedOptions);
    assert.strictEqual(receivedOptions.conversationUrl, sampleProject.conversationUrl);
    assert.strictEqual(receivedOptions.debugPort, 9444);
    assert.strictEqual(receivedOptions.chromePath, 'C:\\Custom\\chrome.exe');
    assert.strictEqual(receivedOptions.startupTimeoutMs, 12000);
    assert.strictEqual(receivedOptions.connectionTimeoutMs, 8000);
    assert.ok(receivedOptions.profileDir.includes('propagated-profile'));
  });
});

describe('API Router Settings & Browser Endpoints', () => {
  let tempDir: string;
  let server: any;
  let baseUrl: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autogenimg-api-test-'));
    const express = (await import('express')).default;
    const { createApiRouter } = await import('../src/server/apiRouter.ts');

    const projectManager = new ProjectManager(tempDir);
    const settingsManager = new SettingsManager(tempDir, tempDir);
    const sessionManager = new ChromeSessionManager(tempDir);
    const orchestrator = new QueueOrchestrator(projectManager, settingsManager);

    const app = express();
    app.use(express.json());
    app.use('/api', createApiRouter(orchestrator, projectManager, sessionManager, settingsManager));

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const port = (server.address() as any).port;
        baseUrl = `http://127.0.0.1:${port}/api`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  test('GET and POST /settings endpoint persists configuration correctly', async () => {
    const getRes = await fetch(`${baseUrl}/settings`);
    assert.strictEqual(getRes.status, 200);
    const initial = await getRes.json();
    assert.strictEqual(initial.debugPort, 9222);

    const postRes = await fetch(`${baseUrl}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ debugPort: 9555, genTimeoutSeconds: 75 }),
    });
    assert.strictEqual(postRes.status, 200);
    const updated = await postRes.json();
    assert.strictEqual(updated.debugPort, 9555);
    assert.strictEqual(updated.genTimeoutSeconds, 75);
  });

  test('browser detect and status endpoints respond with structured information', async () => {
    const statusRes = await fetch(`${baseUrl}/browser/status`);
    assert.strictEqual(statusRes.status, 200);
    const status = await statusRes.json();
    assert.strictEqual(typeof status.playwrightAvailable, 'boolean');
    assert.strictEqual(typeof status.chromeFound, 'boolean');
    assert.strictEqual(typeof status.cdpReachable, 'boolean');

    const detectRes = await fetch(`${baseUrl}/browser/detect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chromePath: path.join(tempDir, 'fake.exe') }),
    });
    assert.strictEqual(detectRes.status, 200);
    const detect = await detectRes.json();
    assert.strictEqual(detect.found, false);
    assert.strictEqual(detect.source, 'settings');

    const disconnectRes = await fetch(`${baseUrl}/browser/disconnect`, { method: 'POST' });
    assert.strictEqual(disconnectRes.status, 200);
    const disconnect = await disconnectRes.json();
    assert.strictEqual(disconnect.success, true);
  });
});

