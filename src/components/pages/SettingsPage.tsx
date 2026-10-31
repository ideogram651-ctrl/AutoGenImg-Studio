import React, { useState, useEffect } from 'react';
import {
  Settings,
  Sun,
  Moon,
  Folder,
  Shield,
  CheckCircle2,
  Lock,
  Cpu,
  Monitor,
  Save,
  Globe,
  Play,
  RefreshCw,
  ExternalLink,
  PowerOff,
  AlertTriangle,
  Info,
  Terminal,
} from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';

interface ChromeStatusData {
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
  readinessState?: string;
  statusMessage: string;
  provider?: string;
}

export function SettingsPage() {
  const { theme, toggleTheme, setTheme, runtimeStatus, currentProject, refreshState } = useApp();

  // Settings State
  const [defaultOutput, setDefaultOutput] = useState('./project-data');
  const [profileDir, setProfileDir] = useState('./browser-profile');
  const [resolvedProfileDir, setResolvedProfileDir] = useState('');
  const [chromePath, setChromePath] = useState('');
  const [debugPort, setDebugPort] = useState(9222);
  const [genTimeout, setGenTimeout] = useState(60);
  const [downloadTimeout, setDownloadTimeout] = useState(15);
  const [startupTimeout, setStartupTimeout] = useState(30000);
  const [connectionTimeout, setConnectionTimeout] = useState(15000);

  // Chrome Session State
  const [chromeStatus, setChromeStatus] = useState<ChromeStatusData | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // Load Settings from Backend on mount
  useEffect(() => {
    fetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        if (data && !data.error) {
          setDefaultOutput(data.defaultOutputPath || './project-data');
          setProfileDir(data.profileDir || './browser-profile');
          setResolvedProfileDir(data.resolvedProfileDir || '');
          setChromePath(data.chromePath || '');
          setDebugPort(data.debugPort || 9222);
          setGenTimeout(data.genTimeoutSeconds || 60);
          setDownloadTimeout(data.downloadTimeoutSeconds || 15);
          setStartupTimeout(data.startupTimeoutMs || 30000);
          setConnectionTimeout(data.connectionTimeoutMs || 15000);
        }
      })
      .catch((err) => console.error('Error fetching settings:', err));

    fetchBrowserStatus();
  }, []);

  const fetchBrowserStatus = async () => {
    try {
      const provider = currentProject?.provider || 'chatgpt';
      const res = await fetch(`/api/browser/status?provider=${provider}`);
      const data = await res.json();
      if (data && !data.error) {
        setChromeStatus(data);
        if (data.profileDir && !resolvedProfileDir) {
          setResolvedProfileDir(data.profileDir);
        }
      }
    } catch (err) {
      console.error('Error fetching browser status:', err);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsError(null);
    setSavedNotice(false);

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          defaultOutputPath: defaultOutput,
          profileDir,
          chromePath,
          debugPort: Number(debugPort),
          genTimeoutSeconds: Number(genTimeout),
          downloadTimeoutSeconds: Number(downloadTimeout),
          startupTimeoutMs: Number(startupTimeout),
          connectionTimeoutMs: Number(connectionTimeout),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setSettingsError(data.error || 'Failed to update settings.');
        return;
      }

      setResolvedProfileDir(data.resolvedProfileDir || '');
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 3000);

      // Refresh status with new settings
      await fetchBrowserStatus();
      await refreshState();
    } catch (err: any) {
      setSettingsError(err.message || 'Network error updating settings.');
    }
  };

  // Action A: Detect Chrome
  const handleDetectChrome = async () => {
    setActionLoading('detect');
    setActionFeedback(null);
    try {
      const res = await fetch('/api/browser/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chromePath }),
      });
      const data = await res.json();

      if (data.found && data.executablePath) {
        setActionFeedback({
          type: 'success',
          message: `Chrome found via ${data.source}: ${data.executablePath}`,
        });
      } else {
        setActionFeedback({
          type: 'error',
          message:
            data.error ||
            'Chrome executable not found. Please set CHROME_PATH environment variable or specify the path above.',
        });
      }
      await fetchBrowserStatus();
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: `Detection failed: ${err.message}` });
    } finally {
      setActionLoading(null);
    }
  };

  // Action B: Open Chrome for Login
  const handleOpenChromeForLogin = async () => {
    setActionLoading('launch');
    setActionFeedback(null);
    try {
      const provider = currentProject?.provider || 'chatgpt';
      const conversationUrl =
        currentProject?.conversationUrl ||
        (provider === 'gemini' ? 'https://gemini.google.com' : 'https://chatgpt.com');

      const res = await fetch('/api/browser/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationUrl, provider }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setActionFeedback({
          type: 'error',
          message: data.error || 'Failed to launch Google Chrome.',
        });
      } else {
        setActionFeedback({
          type: 'success',
          message:
            'Google Chrome opened with dedicated persistent profile! Please log in manually inside the opened Chrome window.',
        });
      }
      await fetchBrowserStatus();
      await refreshState();
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: `Launch error: ${err.message}` });
    } finally {
      setActionLoading(null);
    }
  };

  // Action C: Check Connection & Readiness
  const handleCheckConnection = async () => {
    setActionLoading('check');
    setActionFeedback(null);
    try {
      const provider = currentProject?.provider || 'chatgpt';
      const res = await fetch('/api/browser/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      const data = await res.json();

      if (data.status) {
        setChromeStatus(data.status);
      }

      if (data.readiness?.ready) {
        setActionFeedback({
          type: 'success',
          message: `Connection verified! ${data.readiness.reason}`,
        });
      } else {
        setActionFeedback({
          type: 'info',
          message: data.readiness?.reason || data.status?.statusMessage || 'Checked connection.',
        });
      }
      await refreshState();
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: `Connection check failed: ${err.message}` });
    } finally {
      setActionLoading(null);
    }
  };

  // Action D: Open Login Page / Conversation
  const handleOpenConversation = async () => {
    setActionLoading('navigate');
    setActionFeedback(null);
    try {
      const provider = currentProject?.provider || 'chatgpt';
      const url =
        currentProject?.conversationUrl ||
        (provider === 'gemini' ? 'https://gemini.google.com' : 'https://chatgpt.com');

      const res = await fetch('/api/browser/navigate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setActionFeedback({
          type: 'error',
          message: data.error || 'Failed to navigate to target URL.',
        });
      } else {
        setActionFeedback({
          type: 'success',
          message: `Navigated Chrome session to ${url}.`,
        });
      }
      await fetchBrowserStatus();
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: `Navigation error: ${err.message}` });
    } finally {
      setActionLoading(null);
    }
  };

  // Action E: Disconnect
  const handleDisconnect = async () => {
    setActionLoading('disconnect');
    setActionFeedback(null);
    try {
      const res = await fetch('/api/browser/disconnect', { method: 'POST' });
      const data = await res.json();
      setActionFeedback({
        type: 'info',
        message: data.message || 'Controller disconnected safely. Chrome window remains open.',
      });
      await fetchBrowserStatus();
      await refreshState();
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: `Disconnect failed: ${err.message}` });
    } finally {
      setActionLoading(null);
    }
  };

  const getReadinessBadge = () => {
    const state = chromeStatus?.readinessState;
    if (state === 'CONVERSATION_READY' || (chromeStatus?.isAuthenticated && chromeStatus?.inputReady)) {
      return {
        label: 'YES (READY)',
        colorClass: 'text-emerald-400',
        dotClass: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]',
      };
    }
    if (state === 'LOGIN_REQUIRED') {
      return {
        label: 'NO (LOGIN REQUIRED)',
        colorClass: 'text-amber-400',
        dotClass: 'bg-amber-400',
      };
    }
    if (state === 'SECURITY_CHALLENGE') {
      return {
        label: 'NO (SECURITY CHALLENGE / CAPTCHA)',
        colorClass: 'text-rose-400',
        dotClass: 'bg-rose-400',
      };
    }
    if (state === 'PROVIDER_LIMIT') {
      return {
        label: 'NO (PROVIDER LIMIT REACHED)',
        colorClass: 'text-amber-400',
        dotClass: 'bg-amber-400',
      };
    }
    if (state === 'NAVIGATING') {
      return {
        label: 'LOADING / NAVIGATING...',
        colorClass: 'text-sky-400',
        dotClass: 'bg-sky-400 animate-pulse',
      };
    }
    if (state === 'INPUT_NOT_READY') {
      return {
        label: 'WAITING (INPUT NOT READY)',
        colorClass: 'text-amber-400',
        dotClass: 'bg-amber-400',
      };
    }
    if (state === 'PROBE_ERROR') {
      return {
        label: 'PROBE ERROR',
        colorClass: 'text-rose-400',
        dotClass: 'bg-rose-400',
      };
    }
    if (chromeStatus?.connected) {
      return {
        label: 'NO (NOT READY)',
        colorClass: 'text-amber-400',
        dotClass: 'bg-amber-400',
      };
    }
    return {
      label: 'NOT CONNECTED',
      colorClass: 'text-zinc-500',
      dotClass: 'bg-zinc-500',
    };
  };

  const readinessBadge = getReadinessBadge();

  return (
    <div className="max-w-4xl space-y-6">
      <div className="p-6 rounded-xl glass-panel space-y-6" style={{ borderColor: 'var(--surface-border)' }}>
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Settings className="w-5 h-5 text-indigo-400" />
            <h2 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              Application Settings & Installed Chrome Architecture
            </h2>
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            Configure visual appearance, installed Google Chrome CDP connection, dedicated persistent profile, and execution timeouts.
          </p>
        </div>

        {savedNotice && (
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Settings saved successfully and synchronized with backend server.</span>
          </div>
        )}

        {settingsError && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{settingsError}</span>
          </div>
        )}

        {actionFeedback && (
          <div
            className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
              actionFeedback.type === 'success'
                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                : actionFeedback.type === 'error'
                ? 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
                : 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-300'
            }`}
          >
            {actionFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : actionFeedback.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            ) : (
              <Info className="w-4 h-4 shrink-0" />
            )}
            <span>{actionFeedback.message}</span>
          </div>
        )}

        {/* Section: Installed Google Chrome Session & CDP Controls */}
        <div className="p-5 rounded-xl border space-y-4" style={{ borderColor: 'var(--surface-border)', backgroundColor: 'var(--surface-elevated)' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Globe className="w-5 h-5 text-indigo-400" />
              <div>
                <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                  Installed Google Chrome Session (CDP)
                </h3>
                <p className="text-[11px] text-[var(--text-secondary)]">
                  Controls your local Google Chrome browser with Playwright via Chrome DevTools Protocol on loopback (127.0.0.1).
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  chromeStatus?.connected
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : chromeStatus?.processRunning
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'bg-zinc-500/20 text-zinc-400 border border-zinc-500/30'
                }`}
              >
                {chromeStatus?.connected
                  ? 'CDP ATTACHED'
                  : chromeStatus?.processRunning
                  ? 'CHROME RUNNING (UNATTACHED)'
                  : 'CHROME IDLE'}
              </span>
            </div>
          </div>

          {/* Session Attributes Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-black/20 border border-white/5 space-y-1">
              <span className="text-[10px] uppercase font-bold text-indigo-400">Browser Type & Target</span>
              <div className="font-semibold text-white">Installed Google Chrome (via CDP)</div>
              <div className="text-[11px] text-[var(--text-secondary)]">
                Target Provider: <span className="font-medium text-amber-300 uppercase">{currentProject?.provider || 'chatgpt'}</span>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-black/20 border border-white/5 space-y-1">
              <span className="text-[10px] uppercase font-bold text-indigo-400">CDP Remote Port & Endpoint</span>
              <div className="font-mono text-white">http://127.0.0.1:{debugPort}</div>
              <div className="text-[11px] text-[var(--text-secondary)]">
                Loopback-only remote debugging connection
              </div>
            </div>

            <div className="p-3 rounded-lg bg-black/20 border border-white/5 space-y-1 md:col-span-2">
              <span className="text-[10px] uppercase font-bold text-indigo-400">Resolved Chrome Executable</span>
              <div className="font-mono text-[11px] text-emerald-400 truncate" title={chromeStatus?.chromePath || chromePath || 'Auto-detection'}>
                {chromeStatus?.chromePath || (chromePath ? chromePath : 'Checking standard installation paths...')}
              </div>
              <div className="text-[10px] text-[var(--text-secondary)]">
                {chromeStatus?.chromeFound
                  ? '✓ Executable verified on host computer.'
                  : '⚠ Executable not yet verified. Click "Detect Chrome" to scan standard Windows paths.'}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-black/20 border border-white/5 space-y-1 md:col-span-2">
              <span className="text-[10px] uppercase font-bold text-indigo-400">Dedicated Persistent Profile</span>
              <div className="font-mono text-[11px] text-indigo-300 truncate" title={resolvedProfileDir || profileDir}>
                {resolvedProfileDir || profileDir}
              </div>
              <div className="text-[10px] text-[var(--text-secondary)]">
                Stores your authenticated manual login session so you remain logged in across runs.
              </div>
            </div>
          </div>

          {/* Real-time Status Banner */}
          <div className="p-3 rounded-lg bg-black/30 border border-white/10 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <div
                className={`w-2.5 h-2.5 rounded-full shrink-0 ${readinessBadge.dotClass}`}
              />
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                {chromeStatus?.statusMessage || 'Session is idle.'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="text-[var(--text-secondary)]">Ready for Automation:</span>
              <span
                className={`font-bold ${readinessBadge.colorClass}`}
              >
                {readinessBadge.label}
              </span>
            </div>
          </div>

          {/* Working Action Buttons */}
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              onClick={handleDetectChrome}
              disabled={Boolean(actionLoading)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-zinc-700/60 hover:bg-zinc-700 text-white transition-all disabled:opacity-50"
            >
              <Terminal className="w-3.5 h-3.5 text-indigo-400" />
              <span>{actionLoading === 'detect' ? 'Detecting...' : 'Detect Chrome'}</span>
            </button>

            <button
              type="button"
              onClick={handleOpenChromeForLogin}
              disabled={Boolean(actionLoading)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all disabled:opacity-50 shadow-sm"
            >
              <Play className="w-3.5 h-3.5 text-white" />
              <span>{actionLoading === 'launch' ? 'Opening...' : 'Open Chrome for Login'}</span>
            </button>

            <button
              type="button"
              onClick={handleCheckConnection}
              disabled={Boolean(actionLoading)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-zinc-700/60 hover:bg-zinc-700 text-white transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${actionLoading === 'check' ? 'animate-spin' : ''}`} />
              <span>{actionLoading === 'check' ? 'Checking...' : 'Check Connection / Readiness'}</span>
            </button>

            <button
              type="button"
              onClick={handleOpenConversation}
              disabled={Boolean(actionLoading) || !chromeStatus?.processRunning}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-zinc-700/60 hover:bg-zinc-700 text-white transition-all disabled:opacity-40"
              title={chromeStatus?.processRunning ? 'Navigate Chrome to project target URL' : 'Chrome must be running first'}
            >
              <ExternalLink className="w-3.5 h-3.5 text-sky-400" />
              <span>{actionLoading === 'navigate' ? 'Navigating...' : 'Open Target Conversation'}</span>
            </button>

            <button
              type="button"
              onClick={handleDisconnect}
              disabled={Boolean(actionLoading) || !chromeStatus?.connected}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 transition-all disabled:opacity-40"
              title="Safely detaches automation controller without terminating Chrome window"
            >
              <PowerOff className="w-3.5 h-3.5 text-rose-400" />
              <span>{actionLoading === 'disconnect' ? 'Disconnecting...' : 'Disconnect Controller'}</span>
            </button>
          </div>
        </div>

        {/* Form Settings */}
        <form onSubmit={handleSaveSettings} className="space-y-6 text-xs">
          {/* Theme Preference */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400">
              1. Theme Appearance
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 max-w-3xl">
              {[
                { id: 'dark', label: 'Dark', desc: 'Default deep charcoal' },
                { id: 'light', label: 'Light', desc: 'Clean contrast styling' },
                { id: 'aurora-violet', label: 'Aurora Violet', desc: 'Violet glass' },
                { id: 'arctic-blue', label: 'Arctic Blue', desc: 'Cool blue glass' },
                { id: 'lavender-mist', label: 'Lavender Mist', desc: 'Soft lavender' },
                { id: 'midnight-orchid', label: 'Midnight Orchid', desc: 'Deep orchid' },
                { id: 'obsidian-amethyst', label: 'Obsidian Amethyst', desc: 'Dark amethyst' },
                { id: 'carbon-graphite', label: 'Carbon Graphite', desc: 'Graphite neutral' },
                { id: 'midnight-sapphire', label: 'Midnight Sapphire', desc: 'Sapphire blue' },
                { id: 'dark-titanium', label: 'Dark Titanium', desc: 'Titanium metal' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTheme(t.id as any)}
                  className={`p-3 rounded-xl border flex flex-col items-start gap-1 transition-all ${
                    theme === t.id
                      ? 'border-indigo-500 bg-indigo-500/15'
                      : 'border-white/10 hover:border-white/20'
                  }`}
                  style={{ backgroundColor: theme === t.id ? undefined : 'var(--surface-elevated)' }}
                >
                  <div className="font-bold text-xs" style={{ color: 'var(--text-primary)' }}>{t.label}</div>
                  <div className="text-[10px] text-[var(--text-secondary)]">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Browser Configuration Details */}
          <div className="space-y-4 pt-4 border-t" style={{ borderColor: 'var(--surface-border)' }}>
            <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400">
              2. Browser Paths & Remote Debugging Configuration
            </h3>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>
                Installed Google Chrome Executable Path (Optional Override)
              </label>
              <input
                type="text"
                placeholder="Leave blank to auto-detect from standard Windows paths or CHROME_PATH"
                value={chromePath}
                onChange={(e) => setChromePath(e.target.value)}
                className="w-full px-3 py-2 rounded-lg font-mono glass-card outline-none"
                style={{ color: 'var(--text-primary)' }}
              />
              <p className="text-[11px] text-[var(--text-secondary)] mt-1">
                Standard Windows paths are checked automatically (Program Files, Program Files (x86), LocalAppData).
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>
                Dedicated Browser Profile Directory
              </label>
              <input
                type="text"
                value={profileDir}
                onChange={(e) => setProfileDir(e.target.value)}
                className="w-full px-3 py-2 rounded-lg font-mono glass-card outline-none"
                style={{ color: 'var(--text-primary)' }}
              />
              <p className="text-[11px] text-[var(--text-secondary)] mt-1">
                A dedicated profile preserves your manual login session between runs.
                <span className="text-amber-400 font-medium"> Note: </span>
                If you change to a new directory, you must perform a fresh manual login in that profile.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>
                  CDP Debugging Port
                </label>
                <input
                  type="number"
                  value={debugPort}
                  onChange={(e) => setDebugPort(parseInt(e.target.value, 10) || 9222)}
                  className="w-full px-3 py-2 rounded-lg glass-card outline-none"
                  style={{ color: 'var(--text-primary)' }}
                />
                <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">Default: 9222</p>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>
                  Startup Timeout (ms)
                </label>
                <input
                  type="number"
                  value={startupTimeout}
                  onChange={(e) => setStartupTimeout(parseInt(e.target.value, 10) || 30000)}
                  className="w-full px-3 py-2 rounded-lg glass-card outline-none"
                  style={{ color: 'var(--text-primary)' }}
                />
                <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">Default: 30000ms</p>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>
                  Connection Timeout (ms)
                </label>
                <input
                  type="number"
                  value={connectionTimeout}
                  onChange={(e) => setConnectionTimeout(parseInt(e.target.value, 10) || 15000)}
                  className="w-full px-3 py-2 rounded-lg glass-card outline-none"
                  style={{ color: 'var(--text-primary)' }}
                />
                <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">Default: 15000ms</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>
                  Generation Timeout (Seconds)
                </label>
                <input
                  type="number"
                  value={genTimeout}
                  onChange={(e) => setGenTimeout(parseInt(e.target.value, 10) || 60)}
                  className="w-full px-3 py-2 rounded-lg glass-card outline-none"
                  style={{ color: 'var(--text-primary)' }}
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>
                  Download Timeout (Seconds)
                </label>
                <input
                  type="number"
                  value={downloadTimeout}
                  onChange={(e) => setDownloadTimeout(parseInt(e.target.value, 10) || 15)}
                  className="w-full px-3 py-2 rounded-lg glass-card outline-none"
                  style={{ color: 'var(--text-primary)' }}
                />
              </div>
            </div>
          </div>

          {/* Runtime Environment Capabilities */}
          <div className="space-y-3 pt-4 border-t" style={{ borderColor: 'var(--surface-border)' }}>
            <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400">
              3. Runtime Capabilities & Architecture Status
            </h3>

            <div className="p-4 rounded-xl bg-black/25 border border-white/5 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-secondary)]">Platform / OS:</span>
                <span className="font-mono text-indigo-400">{runtimeStatus?.platform || process.platform || 'win32'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-secondary)]">Node.js Runtime:</span>
                <span className="font-mono" style={{ color: 'var(--text-primary)' }}>{runtimeStatus?.nodeVersion || 'v22.x'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-secondary)]">Browser Automation Architecture:</span>
                <span className="font-semibold text-emerald-400">Installed Google Chrome via Chrome DevTools Protocol (CDP)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-secondary)]">Installed Chrome Detection:</span>
                <span className="font-medium text-emerald-300">
                  {chromeStatus?.chromeFound ? 'Installed Chrome Found' : 'Chrome Path Pending Verification'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-secondary)]">Active Provider Mode:</span>
                <span className="font-medium text-emerald-400 uppercase">{currentProject?.provider || runtimeStatus?.activeAdapterName || 'ChatGPT (DALL-E 3) via Chrome CDP'}</span>
              </div>
            </div>
          </div>

          {/* Security & Local Safeguards Guarantee */}
          <div className="p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/20 space-y-2">
            <div className="flex items-center gap-2 text-indigo-400 font-bold">
              <Shield className="w-4 h-4" />
              <span>Security & Profile Integrity Guarantee</span>
            </div>
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
              AutoGenImg Studio binds exclusively to loopback <code>127.0.0.1</code> and uses a dedicated persistent profile (<code>./browser-profile/</code>). It never manipulates your personal default Chrome profile, does not copy stored credentials or cookies, and never transmits tokens over external networks. You authenticate directly and manually inside the visible Google Chrome window.
            </p>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm"
            >
              <Save className="w-4 h-4" />
              <span>Save Preferences</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
