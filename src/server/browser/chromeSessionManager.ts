import { spawn, ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'path';

export interface ChromeDetectionResult {
  found: boolean;
  executablePath: string | null;
  source: 'env' | 'settings' | 'standard_path' | 'none';
  testedPaths: string[];
  error?: string;
}

export type ReadinessState =
  | 'BROWSER_DISCONNECTED'
  | 'NAVIGATING'
  | 'LOGIN_REQUIRED'
  | 'SECURITY_CHALLENGE'
  | 'PROVIDER_LIMIT'
  | 'CONVERSATION_READY'
  | 'INPUT_NOT_READY'
  | 'UNKNOWN_PAGE'
  | 'PROBE_ERROR';

export interface ProviderReadinessResult {
  state: ReadinessState;
  ready: boolean;
  authenticated: boolean;
  inputReady: boolean;
  currentUrl: string;
  reason: string;
}

export interface ChromeSessionStatus {
  playwrightAvailable: boolean;
  chromeFound: boolean;
  chromePath: string | null;
  profileDir: string;
  debugPort: number;
  processRunning: boolean;
  cdpReachable: boolean;
  connected: boolean;
  isOwner: boolean;
  targetUrl: string;
  pageLoaded: boolean;
  isAuthenticated: boolean;
  inputReady: boolean;
  readinessState?: ReadinessState;
  statusMessage: string;
  provider?: string;
}

export interface LaunchOptions {
  conversationUrl?: string;
  profileDir?: string;
  chromePath?: string;
  debugPort?: number;
  startupTimeoutMs?: number;
  connectionTimeoutMs?: number;
  provider?: 'chatgpt' | 'gemini' | string;
}

export interface SessionMarker {
  pid: number;
  port: number;
  profileDir: string;
  launchedAt: string;
  owner: string;
}

export class ChromeSessionManager {
  private launchedProcess: ChildProcess | null = null;
  private launchedPid: number | null = null;
  private isOwner = false;
  private currentPort = 9222;
  private activeProfileDir = '';
  private targetUrl = '';
  private currentProvider = '';

  private browser: any = null; // Playwright Browser instance
  private context: any = null; // Playwright BrowserContext instance
  private page: any = null; // Playwright Page instance

  private appRootDir: string;

  constructor(appRootDir?: string) {
    this.appRootDir = appRootDir ? path.resolve(appRootDir) : process.cwd();
  }

  /**
   * Locates Google Chrome executable on the host machine.
   * Priority:
   * 1. Explicit configured path (if provided and exists)
   * 2. CHROME_PATH environment variable (if set and exists)
   * 3. Standard OS installation paths (Windows, macOS, Linux)
   */
  public detectChrome(configuredPath?: string): ChromeDetectionResult {
    const testedPaths: string[] = [];

    // 1. Configured path
    if (configuredPath && configuredPath.trim()) {
      const trimmed = configuredPath.trim();
      testedPaths.push(trimmed);
      if (fs.existsSync(trimmed)) {
        return {
          found: true,
          executablePath: path.normalize(trimmed),
          source: 'settings',
          testedPaths,
        };
      }
      return {
        found: false,
        executablePath: null,
        source: 'settings',
        testedPaths,
        error: `Configured Google Chrome executable does not exist at path: ${trimmed}`,
      };
    }

    // 2. CHROME_PATH environment variable
    const envChromePath = process.env.CHROME_PATH;
    if (envChromePath && envChromePath.trim()) {
      const trimmedEnv = envChromePath.trim();
      testedPaths.push(trimmedEnv);
      if (fs.existsSync(trimmedEnv)) {
        return {
          found: true,
          executablePath: path.normalize(trimmedEnv),
          source: 'env',
          testedPaths,
        };
      }
      return {
        found: false,
        executablePath: null,
        source: 'env',
        testedPaths,
        error: `CHROME_PATH environment variable points to a non-existent Google Chrome executable: ${trimmedEnv}`,
      };
    }

    // 3. Platform standard locations
    const candidatePaths: string[] = [];

    if (process.platform === 'win32') {
      const progFiles = process.env.PROGRAMFILES || 'C:\\Program Files';
      const progFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
      const localAppData = process.env.LOCALAPPDATA || '';

      candidatePaths.push(
        path.join(progFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(progFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
      );

      if (localAppData) {
        candidatePaths.push(
          path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe')
        );
      }
    } else if (process.platform === 'darwin') {
      candidatePaths.push(
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        path.join(process.env.HOME || '', 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
      );
    } else {
      // Linux / Unix
      candidatePaths.push(
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium'
      );
    }

    for (const cand of candidatePaths) {
      if (cand && !testedPaths.includes(cand)) {
        testedPaths.push(cand);
        if (fs.existsSync(cand)) {
          return {
            found: true,
            executablePath: path.normalize(cand),
            source: 'standard_path',
            testedPaths,
          };
        }
      }
    }

    return {
      found: false,
      executablePath: null,
      source: 'none',
      testedPaths,
      error:
        'Installed Google Chrome executable was not found. Please verify Google Chrome is installed or set the CHROME_PATH environment variable.',
    };
  }

  /**
   * Resolves and validates dedicated profile directory.
   * Enforces Chrome security restriction: remote debugging cannot target default Chrome user profile.
   */
  public resolveAndValidateProfileDir(profileDirInput?: string): {
    valid: boolean;
    resolvedPath: string;
    error?: string;
  } {
    const rawDir = profileDirInput && profileDirInput.trim() ? profileDirInput.trim() : './browser-profile';
    const resolvedPath = path.isAbsolute(rawDir)
      ? path.normalize(rawDir)
      : path.normalize(path.resolve(this.appRootDir, rawDir));

    // Check modern Chrome security restriction against default user data dir
    if (this.isDefaultChromeProfile(resolvedPath)) {
      return {
        valid: false,
        resolvedPath,
        error:
          'Security restriction: Remote debugging cannot target the default Chrome user data directory. Please specify a dedicated profile directory (e.g. ./browser-profile).',
      };
    }

    // Ensure directory exists
    try {
      if (!fs.existsSync(resolvedPath)) {
        fs.mkdirSync(resolvedPath, { recursive: true });
      }
    } catch (err: any) {
      return {
        valid: false,
        resolvedPath,
        error: `Failed to create dedicated browser profile directory: ${err.message}`,
      };
    }

    return { valid: true, resolvedPath };
  }

  private isDefaultChromeProfile(candidatePath: string): boolean {
    const norm = path.normalize(candidatePath).toLowerCase();
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      const defaultWinPath = path.normalize(
        path.resolve(localAppData, 'Google', 'Chrome', 'User Data')
      ).toLowerCase();
      if (norm === defaultWinPath || norm.startsWith(defaultWinPath + path.sep)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Checks whether the CDP endpoint on the specified port is active and responding.
   */
  public async checkCdpEndpoint(
    port = 9222
  ): Promise<{ reachable: boolean; isChromeCdp: boolean; versionInfo?: any; error?: string }> {
    const endpoint = `http://127.0.0.1:${port}/json/version`;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);

      const res = await fetch(endpoint, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) {
        return {
          reachable: true,
          isChromeCdp: false,
          error: `Endpoint returned HTTP status ${res.status}`,
        };
      }

      const data = await res.json();
      if (data && typeof data === 'object' && (data.webSocketDebuggerUrl || data.Browser)) {
        return {
          reachable: true,
          isChromeCdp: true,
          versionInfo: data,
        };
      }

      return {
        reachable: true,
        isChromeCdp: false,
        error: 'Endpoint is not a recognized Chrome DevTools Protocol server.',
      };
    } catch {
      return { reachable: false, isChromeCdp: false };
    }
  }

  /**
   * Launches Chrome with remote debugging on the dedicated profile, or reuses
   * an application-owned session already running on the configured port.
   */
  public async launchChrome(options: LaunchOptions = {}): Promise<{
    success: boolean;
    port: number;
    profileDir: string;
    isOwner: boolean;
    error?: string;
  }> {
    const detection = this.detectChrome(options.chromePath);
    if (!detection.found || !detection.executablePath) {
      return {
        success: false,
        port: options.debugPort || 9222,
        profileDir: options.profileDir || './browser-profile',
        isOwner: false,
        error: detection.error || 'Google Chrome executable could not be found.',
      };
    }

    const profileCheck = this.resolveAndValidateProfileDir(options.profileDir);
    if (!profileCheck.valid) {
      return {
        success: false,
        port: options.debugPort || 9222,
        profileDir: profileCheck.resolvedPath,
        isOwner: false,
        error: profileCheck.error,
      };
    }

    const port = options.debugPort || 9222;
    const profileDir = profileCheck.resolvedPath;
    const startupTimeoutMs = options.startupTimeoutMs || 30000;
    const initialUrl = options.conversationUrl || 'about:blank';

    this.currentPort = port;
    this.activeProfileDir = profileDir;
    if (options.conversationUrl) this.targetUrl = options.conversationUrl;
    if (options.provider) this.currentProvider = options.provider;

    // Check if CDP endpoint is already reachable
    const cdpCheck = await this.checkCdpEndpoint(port);
    if (cdpCheck.reachable) {
      if (!cdpCheck.isChromeCdp) {
        return {
          success: false,
          port,
          profileDir,
          isOwner: false,
          error: `Port ${port} is occupied by an unrelated service or server. Please configure a different debugging port in Settings.`,
        };
      }

      // Check session marker to see if this is our application-owned profile session
      const marker = this.readSessionMarker(profileDir);
      const isOurSession = (this.isOwner && this.launchedPid) || (marker && marker.port === port);

      if (isOurSession) {
        // Safe to reuse application-owned session
        return {
          success: true,
          port,
          profileDir,
          isOwner: this.isOwner,
        };
      } else {
        return {
          success: false,
          port,
          profileDir,
          isOwner: false,
          error: `Port ${port} is already running a Chrome session not associated with profile "${profileDir}". To avoid interfering with other sessions, please close that Chrome window or configure a different CDP port.`,
        };
      }
    }

    // Launch Chrome process
    const args: string[] = [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
    ];

    if (initialUrl && initialUrl !== 'about:blank') {
      args.push(initialUrl);
    }

    try {
      const child = spawn(detection.executablePath, args, {
        windowsHide: false,
        stdio: 'ignore',
      });

      this.launchedProcess = child;
      this.launchedPid = child.pid || null;
      this.isOwner = true;

      child.on('exit', (code, signal) => {
        this.launchedProcess = null;
        this.isOwner = false;
        this.clearSessionMarker(profileDir);
      });

      child.on('error', (err) => {
        console.error('[ChromeSessionManager] Chrome process error:', err);
      });

      if (child.pid) {
        this.writeSessionMarker(profileDir, {
          pid: child.pid,
          port,
          profileDir,
          launchedAt: new Date().toISOString(),
          owner: 'AutoGenImg-Studio',
        });
      }

      // Poll CDP endpoint until ready or timeout
      const pollInterval = 300;
      const startTime = Date.now();
      let ready = false;

      while (Date.now() - startTime < startupTimeoutMs) {
        if (!this.launchedProcess) {
          return {
            success: false,
            port,
            profileDir,
            isOwner: false,
            error: 'Chrome process terminated unexpectedly during startup. Please verify profile directory write permissions.',
          };
        }

        const pollCheck = await this.checkCdpEndpoint(port);
        if (pollCheck.reachable && pollCheck.isChromeCdp) {
          ready = true;
          break;
        }

        await new Promise((r) => setTimeout(r, pollInterval));
      }

      if (!ready) {
        return {
          success: false,
          port,
          profileDir,
          isOwner: true,
          error: `Chrome started but remote debugging endpoint did not respond on port ${port} within ${Math.round(
            startupTimeoutMs / 1000
          )} seconds.`,
        };
      }

      return {
        success: true,
        port,
        profileDir,
        isOwner: true,
      };
    } catch (err: any) {
      return {
        success: false,
        port,
        profileDir,
        isOwner: false,
        error: `Failed to launch Google Chrome: ${err.message}`,
      };
    }
  }

  /**
   * Attaches Playwright to the running Chrome instance over CDP.
   */
  public async connectPlaywright(options: LaunchOptions = {}): Promise<{
    browser: any;
    context: any;
    page: any;
  }> {
    const port = options.debugPort || this.currentPort || 9222;
    const connectionTimeoutMs = options.connectionTimeoutMs || 15000;
    const targetUrl = options.conversationUrl || this.targetUrl;

    // Check if already connected and page is active
    if (this.browser && this.page && !this.page.isClosed()) {
      if (targetUrl && targetUrl !== 'about:blank' && this.page.url() !== targetUrl) {
        try {
          await this.page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        } catch {}
      }
      return { browser: this.browser, context: this.context, page: this.page };
    }

    const { chromium } = await import('playwright');
    const endpoint = `http://127.0.0.1:${port}`;

    try {
      this.browser = await chromium.connectOverCDP(endpoint, {
        timeout: connectionTimeoutMs,
      });

      const contexts = this.browser.contexts();
      this.context = contexts[0] || (await this.browser.newContext({ acceptDownloads: true }));

      const pages = this.context.pages();
      // Select an existing non-devtools page or create one
      this.page =
        pages.find((p: any) => !p.url().startsWith('devtools://')) ||
        pages[0] ||
        (await this.context.newPage());

      // P-011: Browser console logging - capture console messages and page errors
      this.page.on('console', (msg: any) => {
        const type = msg.type();
        const text = msg.text();
        console.log(`[Browser Console ${type}] ${text}`);
      });

      this.page.on('pageerror', (err: any) => {
        console.error('[Browser Page Error]', err.message);
      });

      if (targetUrl && targetUrl !== 'about:blank') {
        const currentUrl = this.page.url();
        if (currentUrl !== targetUrl && (currentUrl === 'about:blank' || !currentUrl.includes(new URL(targetUrl).hostname))) {
          await this.page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        }
      }

      return {
        browser: this.browser,
        context: this.context,
        page: this.page,
      };
    } catch (err: any) {
      throw new Error(`Failed to attach Playwright over CDP to ${endpoint}: ${err.message}`);
    }
  }

  /**
   * Orchestrates full launch and attachment workflow.
   */
  public async launchAndConnect(options: LaunchOptions = {}): Promise<{
    browser: any;
    context: any;
    page: any;
  }> {
    const launchResult = await this.launchChrome(options);
    if (!launchResult.success) {
      throw new Error(launchResult.error || 'Failed to initialize Google Chrome session.');
    }

    return await this.connectPlaywright(options);
  }

  /**
   * Navigates the attached Chrome session to a new URL.
   */
  public async navigateTo(url: string): Promise<{ success: boolean; url: string; error?: string }> {
    if (!url || typeof url !== 'string') {
      return { success: false, url: '', error: 'Target URL is required.' };
    }

    this.targetUrl = url;

    // Ensure session is connected
    try {
      if (!this.browser || !this.page || this.page.isClosed()) {
        await this.connectPlaywright({ conversationUrl: url });
      }

      await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      return { success: true, url: this.page.url() };
    } catch (err: any) {
      return { success: false, url, error: `Navigation failed: ${err.message}` };
    }
  }

  /**
   * Checks whether the target website is ready for automation or requires manual user login.
   * Uses safe, non-throwing DOM probing and classifies the page into explicit ReadinessState.
   */
  public async checkProviderReadiness(
    provider: string,
    targetUrl?: string
  ): Promise<ProviderReadinessResult> {
    if (!this.page || this.page.isClosed()) {
      return {
        state: 'BROWSER_DISCONNECTED',
        ready: false,
        authenticated: false,
        inputReady: false,
        currentUrl: '',
        reason: 'Browser page is not attached. Please open Chrome and connect first.',
      };
    }

    try {
      const currentUrl = this.page.url() || '';

      if (!currentUrl || currentUrl === 'about:blank') {
        return {
          state: 'NAVIGATING',
          ready: false,
          authenticated: false,
          inputReady: false,
          currentUrl,
          reason: 'Browser is currently on blank page or navigating.',
        };
      }

      // Safe DOM probe that never dereferences null body/documentElement
      let probe: { title: string; text: string; hasBody: boolean } = {
        title: '',
        text: '',
        hasBody: false,
      };

      try {
        probe = await this.page.evaluate(() => {
          try {
            const b = document.body;
            const text = b
              ? b.innerText || b.textContent || ''
              : document.documentElement
              ? document.documentElement.textContent || ''
              : '';
            return {
              title: document.title || '',
              text,
              hasBody: Boolean(document.body),
            };
          } catch {
            return { title: '', text: '', hasBody: false };
          }
        });
      } catch (evalErr: any) {
        const msg = String(evalErr?.message || evalErr);
        if (msg.includes('Execution context was destroyed') || msg.includes('navigating')) {
          return {
            state: 'NAVIGATING',
            ready: false,
            authenticated: false,
            inputReady: false,
            currentUrl,
            reason: 'Page is actively navigating. Awaiting document stabilization...',
          };
        }
        return {
          state: 'PROBE_ERROR',
          ready: false,
          authenticated: false,
          inputReady: false,
          currentUrl,
          reason: `DOM probe error during readiness evaluation: ${msg}`,
        };
      }

      const text = probe.text;
      const lowerUrl = currentUrl.toLowerCase();

      if (provider === 'chatgpt') {
        // 1. URL authentication detection
        if (
          lowerUrl.includes('/auth/login') ||
          lowerUrl.includes('auth.openai.com') ||
          lowerUrl.includes('accounts.google.com') ||
          lowerUrl.includes('login.live.com') ||
          lowerUrl.includes('appleid.apple.com')
        ) {
          return {
            state: 'LOGIN_REQUIRED',
            ready: false,
            authenticated: false,
            inputReady: false,
            currentUrl,
            reason: 'ChatGPT authentication sign-in screen detected. Please log in manually in the opened Chrome window.',
          };
        }

        // 2. Cloudflare / Security verification challenge
        if (
          text.includes('Verify you are human') ||
          text.includes('Cloudflare') ||
          text.includes('Just a moment...') ||
          probe.title.includes('Just a moment')
        ) {
          return {
            state: 'SECURITY_CHALLENGE',
            ready: false,
            authenticated: false,
            inputReady: false,
            currentUrl,
            reason: 'Cloudflare security verification challenge detected. Please solve the challenge manually in Chrome.',
          };
        }

        // 3. Provider rate / quota limit
        if (
          text.includes("You've reached your limit") ||
          text.includes('rate limit exceeded') ||
          text.includes('hourly limit')
        ) {
          return {
            state: 'PROVIDER_LIMIT',
            ready: false,
            authenticated: true,
            inputReady: false,
            currentUrl,
            reason: 'ChatGPT usage limit detected in conversation.',
          };
        }

        // 4. "Log in to continue" prompt
        if (text.includes('Log in to continue') || (text.includes('Welcome back') && text.includes('Log in'))) {
          return {
            state: 'LOGIN_REQUIRED',
            ready: false,
            authenticated: false,
            inputReady: false,
            currentUrl,
            reason: 'ChatGPT requires user authentication. Please log in manually.',
          };
        }

        // 5. Message input check
        const inputSelector = '#prompt-textarea, textarea[placeholder*="Message"], div[contenteditable="true"]';
        const inputEl = await this.page.$(inputSelector);
        if (inputEl) {
          const isVis = await inputEl.isVisible().catch(() => false);
          if (isVis) {
            // Check if stop button is currently visible (generation active)
            const stopBtn = await this.page.$('button[data-testid="stop-button"], button[aria-label*="Stop"]');
            const isGenerating = stopBtn ? await stopBtn.isVisible().catch(() => false) : false;

            return {
              state: 'CONVERSATION_READY',
              ready: !isGenerating,
              authenticated: true,
              inputReady: !isGenerating,
              currentUrl,
              reason: isGenerating
                ? 'ChatGPT is currently generating a response.'
                : 'ChatGPT conversation is authenticated and prompt input is ready.',
            };
          }
        }

        // 6. Check for visible login button
        const loginBtn = await this.page.$('button[data-testid="login-button"], a[href*="login"], a[data-testid="login-button"]');
        if (loginBtn && (await loginBtn.isVisible().catch(() => false))) {
          return {
            state: 'LOGIN_REQUIRED',
            ready: false,
            authenticated: false,
            inputReady: false,
            currentUrl,
            reason: 'ChatGPT login button is visible. Please log in to your account.',
          };
        }

        // 7. Check if domain is chatgpt.com
        if (lowerUrl.includes('chatgpt.com') || lowerUrl.includes('chat.openai.com')) {
          return {
            state: 'INPUT_NOT_READY',
            ready: false,
            authenticated: true,
            inputReady: false,
            currentUrl,
            reason: 'ChatGPT conversation interface is loading. Message input not yet accessible.',
          };
        }

        return {
          state: 'UNKNOWN_PAGE',
          ready: false,
          authenticated: false,
          inputReady: false,
          currentUrl,
          reason: `Chrome is currently at an unexpected URL (${currentUrl}). Expected ChatGPT conversation.`,
        };
      } else if (provider === 'gemini') {
        // 1. Google sign-in
        if (lowerUrl.includes('accounts.google.com')) {
          return {
            state: 'LOGIN_REQUIRED',
            ready: false,
            authenticated: false,
            inputReady: false,
            currentUrl,
            reason: 'Google Account sign-in page detected. Please complete login in Chrome.',
          };
        }

        if (text.includes('Sign in to continue') || text.includes('Choose an account')) {
          return {
            state: 'LOGIN_REQUIRED',
            ready: false,
            authenticated: false,
            inputReady: false,
            currentUrl,
            reason: 'Google sign-in required. Please authenticate manually in Chrome.',
          };
        }

        if (text.includes('quota exceeded') || text.includes('too many requests')) {
          return {
            state: 'PROVIDER_LIMIT',
            ready: false,
            authenticated: true,
            inputReady: false,
            currentUrl,
            reason: 'Gemini rate/quota limit reached.',
          };
        }

        const inputSelector =
          'rich-textarea div[contenteditable="true"], textarea[aria-label*="prompt"], div.ql-editor';
        const inputEl = await this.page.$(inputSelector);
        if (inputEl) {
          const isVis = await inputEl.isVisible().catch(() => false);
          if (isVis) {
            const stopBtn = await this.page.$('button[aria-label*="Stop response"], button.stop-button');
            const isGenerating = stopBtn ? await stopBtn.isVisible().catch(() => false) : false;

            return {
              state: 'CONVERSATION_READY',
              ready: !isGenerating,
              authenticated: true,
              inputReady: !isGenerating,
              currentUrl,
              reason: isGenerating
                ? 'Gemini is currently generating a response.'
                : 'Gemini conversation is authenticated and prompt input is ready.',
            };
          }
        }

        const signInBtn = await this.page.$('a[href*="accounts.google.com"], button[aria-label*="Sign in"]');
        if (signInBtn && (await signInBtn.isVisible().catch(() => false))) {
          return {
            state: 'LOGIN_REQUIRED',
            ready: false,
            authenticated: false,
            inputReady: false,
            currentUrl,
            reason: 'Gemini requires Google account sign-in.',
          };
        }

        if (lowerUrl.includes('gemini.google.com')) {
          return {
            state: 'INPUT_NOT_READY',
            ready: false,
            authenticated: true,
            inputReady: false,
            currentUrl,
            reason: 'Gemini interface is loading. Prompt input not yet accessible.',
          };
        }

        return {
          state: 'UNKNOWN_PAGE',
          ready: false,
          authenticated: false,
          inputReady: false,
          currentUrl,
          reason: `Chrome is currently at an unexpected URL (${currentUrl}). Expected Google Gemini.`,
        };
      } else {
        // Generic / Demo mode
        return {
          state: 'CONVERSATION_READY',
          ready: true,
          authenticated: true,
          inputReady: true,
          currentUrl,
          reason: 'Session ready.',
        };
      }
    } catch (err: any) {
      return {
        state: 'PROBE_ERROR',
        ready: false,
        authenticated: false,
        inputReady: false,
        currentUrl: '',
        reason: `Readiness check probe failure: ${err.message}`,
      };
    }
  }

  /**
   * Safely detaches Playwright CDP client without killing the Chrome browser window.
   */
  public async disconnect(): Promise<void> {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch {}
      this.browser = null;
      this.context = null;
      this.page = null;
    }
  }

  /**
   * Shuts down application-owned Chrome process if launched by us.
   * Never terminates unrelated Chrome processes.
   */
  public async stopLaunchedBrowser(): Promise<void> {
    await this.disconnect();

    if (this.isOwner && this.launchedProcess && this.launchedPid) {
      try {
        this.launchedProcess.kill();
      } catch {}
      this.launchedProcess = null;
      this.launchedPid = null;
      this.isOwner = false;
      this.clearSessionMarker(this.activeProfileDir);
    }
  }

  /**
   * Returns comprehensive structured status of the Chrome session.
   */
  public async getStatus(options: {
    configuredChromePath?: string;
    profileDir?: string;
    port?: number;
    provider?: string;
  } = {}): Promise<ChromeSessionStatus> {
    let playwrightAvailable = false;
    try {
      await import('playwright');
      playwrightAvailable = true;
    } catch {
      playwrightAvailable = false;
    }

    const detection = this.detectChrome(options.configuredChromePath);
    const port = options.port || this.currentPort || 9222;
    const profileRes = this.resolveAndValidateProfileDir(options.profileDir || this.activeProfileDir);
    const provider = options.provider || this.currentProvider || 'chatgpt';

    const cdpCheck = await this.checkCdpEndpoint(port);
    const isConnected = Boolean(this.browser && this.page && !this.page.isClosed());

    let pageLoaded = false;
    let isAuthenticated = false;
    let inputReady = false;
    let readinessState: ReadinessState | undefined = undefined;
    let statusMessage = 'Idle. Chrome session not started.';

    if (isConnected) {
      pageLoaded = true;
      const readiness = await this.checkProviderReadiness(provider);
      readinessState = readiness.state;
      isAuthenticated = readiness.authenticated;
      inputReady = readiness.inputReady;
      statusMessage = readiness.reason;
    } else if (cdpCheck.reachable && cdpCheck.isChromeCdp) {
      statusMessage = `Chrome is running on port ${port}. Automation controller not attached.`;
    } else if (!detection.found) {
      statusMessage = 'Google Chrome executable not detected on this machine.';
    } else {
      statusMessage = 'Chrome is closed. Ready to launch dedicated profile session.';
    }

    return {
      playwrightAvailable,
      chromeFound: detection.found,
      chromePath: detection.executablePath,
      profileDir: profileRes.resolvedPath,
      debugPort: port,
      processRunning: Boolean(this.launchedProcess || (cdpCheck.reachable && cdpCheck.isChromeCdp)),
      cdpReachable: cdpCheck.reachable && cdpCheck.isChromeCdp,
      connected: isConnected,
      isOwner: this.isOwner,
      targetUrl: this.targetUrl,
      pageLoaded,
      isAuthenticated,
      inputReady,
      readinessState,
      statusMessage,
      provider,
    };
  }

  public getPage(): any {
    return this.page;
  }

  public getContext(): any {
    return this.context;
  }

  public getBrowser(): any {
    return this.browser;
  }

  private writeSessionMarker(profileDir: string, marker: SessionMarker) {
    try {
      const markerPath = path.join(profileDir, '.autogenimg-session.json');
      fs.writeFileSync(markerPath, JSON.stringify(marker, null, 2), 'utf-8');
    } catch {}
  }

  private readSessionMarker(profileDir: string): SessionMarker | null {
    try {
      const markerPath = path.join(profileDir, '.autogenimg-session.json');
      if (fs.existsSync(markerPath)) {
        return JSON.parse(fs.readFileSync(markerPath, 'utf-8'));
      }
    } catch {}
    return null;
  }

  private clearSessionMarker(profileDir: string) {
    try {
      if (profileDir) {
        const markerPath = path.join(profileDir, '.autogenimg-session.json');
        if (fs.existsSync(markerPath)) {
          fs.unlinkSync(markerPath);
        }
      }
    } catch {}
  }
}

// Global shared singleton instance for the server application
export const defaultChromeSessionManager = new ChromeSessionManager();
