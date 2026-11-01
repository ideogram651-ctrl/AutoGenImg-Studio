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
    const settings = {
      defaultOutputPath: defaultOutput,
      profileDir: profileDir,
      chromePath: chromePath,
      debugPort: debugPort,
      genTimeoutSeconds: genTimeout,
      downloadTimeoutSeconds: downloadTimeout,
      startupTimeoutMs: startupTimeout,
      connectionTimeoutMs: connectionTimeout,
    };
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (res.ok && !data.error) {
        setSavedNotice(true);
        setSettingsError(null);
        setTimeout(() => setSavedNotice(false), 3000);
        refreshState();
      } else {
        setSettingsError(data.error || 'Failed to save settings.');
      }
    } catch (err: any) {
      setSettingsError(err.message || 'Failed to save settings.');
    }
  };

  const handleDetectChrome = async () => {
    setActionLoading('detect');
    try {
      const res = await fetch('/api/browser/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chromePath: chromePath || undefined }),
      });
      const data = await res.json();
      if (data.chromePath) {
        setChromePath(data.chromePath);
        setActionFeedback({ type: 'success', message: 'Chrome detected successfully.' });
      } else {
        setActionFeedback({ type: 'error', message: 'Chrome not found.' });
      }
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: err.message || 'Detection failed.' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleOpenChromeForLogin = async () => {
    setActionLoading('launch');
    try {
      const res = await fetch('/api/browser/launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) {
        setActionFeedback({ type: 'success', message: 'Chrome launched for login.' });
      } else {
        setActionFeedback({ type: 'error', message: data.error || 'Launch failed.' });
      }
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: err.message || 'Launch failed.' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleCheckConnection = async () => {
    setActionLoading('check');
    try {
      const provider = currentProject?.provider || 'chatgpt';
      const res = await fetch(`/api/browser/status?provider=${provider}`);
      const data = await res.json();
      setActionFeedback({
        type: data.error ? 'error' : 'success',
        message: data.error || 'Chrome connection verified.',
      });
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: err.message || 'Check failed.' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleOpenConversation = async () => {
    setActionLoading('navigate');
    try {
      const provider = currentProject?.provider || 'chatgpt';
      const res = await fetch('/api/browser/open-conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setActionFeedback({ type: 'error', message: data.error || 'Open conversation failed.' });
      }
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: err.message || 'Open conversation failed.' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDisconnect = async () => {
    setActionLoading('disconnect');
    try {
      const res = await fetch('/api/browser/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActionFeedback({ type: 'success', message: 'Disconnected from Chrome.' });
      } else {
        setActionFeedback({ type: 'error', message: data.error || 'Disconnect failed.' });
      }
    } catch (err: any) {
      setActionFeedback({ type: 'error', message: err.message || 'Disconnect failed.' });
    } finally {
      setActionLoading(null);
    }
  };

  const readinessBadge = {
    connected: chromeStatus?.connected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-500/20 text-zinc-400',
    running: chromeStatus?.processRunning ? 'bg-amber-500/20 text-amber-400' : 'bg-zinc-500/20 text-zinc-400',
    label: chromeStatus?.connected ? 'CONNECTED' : chromeStatus?.processRunning ? 'RUNNING (UNATTACHED)' : 'IDLE',
    dotClass: chromeStatus?.connected ? 'bg-emerald-400' : 'bg-zinc-500',
  };

  return (
    <div className="stack">
      <div className="panel">
        <div className="heading">
          <div>
            <div className="row between">
              <div>
                <Settings className="icon" />
                <h2 className="title">Application Settings & Installed Chrome Architecture</h2>
              </div>
            </div>
            <p className="muted">
              Configure visual appearance, installed Google Chrome CDP connection, dedicated persistent profile, and execution timeouts.
            </p>
          </div>
        </div>

        {savedNotice && (
          <div className="notice green">
            <CheckCircle2 className="icon" />
            <span>Settings saved successfully and synchronized with backend server.</span>
          </div>
        )}

        {settingsError && (
          <div className="notice red">
            <AlertTriangle className="icon" />
            <span>{settingsError}</span>
          </div>
        )}

        {actionFeedback && (
          <div className={`notice ${actionFeedback.type === 'success' ? 'green' : actionFeedback.type === 'error' ? 'red' : 'indigo'}`}>
            {actionFeedback.type === 'success' ? (
              <CheckCircle2 className="icon" />
            ) : actionFeedback.type === 'error' ? (
              <AlertTriangle className="icon" />
            ) : (
              <Info className="icon" />
            )}
            <span>{actionFeedback.message}</span>
          </div>
        )}

        {/* Section: Installed Google Chrome Session & CDP Controls */}
        <div className="panel" style={{ borderColor: 'var(--surface-border)' }}>
          <div className="row between">
            <div className="row">
              <Globe className="icon" />
              <div>
                <h3 className="section-title">Installed Google Chrome Session (CDP)</h3>
                <p className="muted">
                  Controls your local Google Chrome browser with Playwright via Chrome DevTools Protocol on loopback (127.0.0.1).
                </p>
              </div>
            </div>
            <div className="actions">
              <span className={`badge ${chromeStatus?.connected ? 'green' : chromeStatus?.processRunning ? 'amber' : 'gray'}`}>
                {chromeStatus?.connected ? 'CDP ATTACHED' : chromeStatus?.processRunning ? 'CHROME RUNNING (UNATTACHED)' : 'CHROME IDLE'}
              </span>
            </div>
          </div>

          {/* Session Attributes Grid */}
          <div className="two">
            <div className="value-block">
              <small className="muted">Browser Type & Target</small>
              <div className="font-semibold">Installed Google Chrome (via CDP)</div>
              <div className="muted small">Target Provider: {currentProject?.provider || 'chatgpt'}</div>
            </div>
            <div className="value-block">
              <small className="muted">CDP Remote Port & Endpoint</small>
              <div className="font-mono">http://127.0.0.1:{debugPort}</div>
              <div className="muted small">Loopback-only remote debugging connection</div>
            </div>
            <div className="value-block" style={{ gridColumn: '1 / -1' }}>
              <small className="muted">Resolved Chrome Executable</small>
              <div className="font-mono muted truncated" title={chromeStatus?.chromePath || chromePath || 'Auto-detection'}>
                {chromeStatus?.chromePath || (chromePath ? chromePath : 'Checking standard installation paths...')}
              </div>
              <div className="muted small">
                {chromeStatus?.chromeFound ? '✓ Executable verified on host computer.' : '⚠ Executable not yet verified. Click "Detect Chrome" to scan standard Windows paths.'}
              </div>
            </div>
            <div className="value-block" style={{ gridColumn: '1 / -1' }}>
              <small className="muted">Dedicated Persistent Profile</small>
              <div className="font-mono muted truncated" title={resolvedProfileDir || profileDir}>
                {resolvedProfileDir || profileDir}
              </div>
              <div className="muted small">
                Stores your authenticated manual login session so you remain logged in across runs.
              </div>
            </div>
          </div>

          {/* Real-time Status Banner */}
          <div className="row between">
            <div className="row">
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${readinessBadge.dotClass}`} />
              <span className="font-semibold">{chromeStatus?.statusMessage || 'Session is idle.'}</span>
            </div>
            <div className="muted">
              Ready for Automation: <span className={`font-semibold ${readinessBadge.connected}`}>{readinessBadge.label}</span>
            </div>
          </div>

          {/* Working Action Buttons */}
          <div className="actions">
            <button type="button" onClick={handleDetectChrome} disabled={Boolean(actionLoading)} className="btn">
              <Terminal className="icon" />
              <span>{actionLoading === 'detect' ? 'Detecting...' : 'Detect Chrome'}</span>
            </button>
            <button type="button" onClick={handleOpenChromeForLogin} disabled={Boolean(actionLoading)} className="btn primary">
              <Play className="icon" />
              <span>{actionLoading === 'launch' ? 'Opening...' : 'Open Chrome for Login'}</span>
            </button>
            <button type="button" onClick={handleCheckConnection} disabled={Boolean(actionLoading)} className="btn">
              <RefreshCw className={`icon ${actionLoading === 'check' ? '' : ''}`} />
              <span>{actionLoading === 'check' ? 'Checking...' : 'Check Connection / Readiness'}</span>
            </button>
            <button type="button" onClick={handleOpenConversation} disabled={Boolean(actionLoading) || !chromeStatus?.processRunning} className="btn">
              <ExternalLink className="icon" />
              <span>{actionLoading === 'navigate' ? 'Navigating...' : 'Open Target Conversation'}</span>
            </button>
            <button type="button" onClick={handleDisconnect} disabled={Boolean(actionLoading) || !chromeStatus?.connected} className="btn danger">
              <PowerOff className="icon" />
              <span>{actionLoading === 'disconnect' ? 'Disconnecting...' : 'Disconnect Controller'}</span>
            </button>
          </div>
        </div>

        {/* Form Settings */}
        <form onSubmit={handleSaveSettings} className="stack">
          {/* Theme Preference */}
          <div className="space-y-4">
            <h3 className="section-title">1. Theme Appearance</h3>
            <div className="theme-options">
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
                <button key={t.id} type="button" onClick={() => setTheme(t.id as any)} className={`theme-option ${theme === t.id ? 'active' : ''}`}>
                  <div className="swatch" style={{ backgroundColor: theme === t.id ? 'var(--color-primary)' : undefined }} />
                  <div className="font-semibold text-xs">{t.label}</div>
                  <div className="text-[10px] muted">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Browser Configuration Details */}
          <div className="rule" />
          <div className="space-y-4">
            <h3 className="section-title">2. Browser Paths & Remote Debugging Configuration</h3>

            <div className="field">
              <div className="label">Installed Google Chrome Executable Path (Optional Override)</div>
              <input
                type="text"
                className="input"
                placeholder="Leave blank to auto-detect from standard Windows paths or CHROME_PATH"
                value={chromePath}
                onChange={(e) => setChromePath(e.target.value)}
              />
              <p className="hint">Standard Windows paths are checked automatically (Program Files, Program Files (x86), LocalAppData).</p>
            </div>

            <div className="field">
              <div className="label">Dedicated Browser Profile Directory</div>
              <input
                type="text"
                className="input"
                value={profileDir}
                onChange={(e) => setProfileDir(e.target.value)}
              />
              <p className="hint">
                A dedicated profile preserves your manual login session between runs.
                <span className="muted">Note:</span> If you change to a new directory, you must perform a fresh manual login in that profile.
              </p>
            </div>

            <div className="three">
              <div className="field">
                <div className="label">CDP Debugging Port</div>
                <input type="number" className="input" value={debugPort} onChange={(e) => setDebugPort(Number(e.target.value) || 9222)} />
              </div>
              <div className="field">
                <div className="label">Startup Timeout (ms)</div>
                <input type="number" className="input" value={startupTimeout} onChange={(e) => setStartupTimeout(Number(e.target.value) || 30000)} />
              </div>
              <div className="field">
                <div className="label">Connection Timeout (ms)</div>
                <input type="number" className="input" value={connectionTimeout} onChange={(e) => setConnectionTimeout(Number(e.target.value) || 15000)} />
              </div>
            </div>

            <div className="two">
              <div className="field">
                <div className="label">Generation Timeout (Seconds)</div>
                <input type="number" className="input" value={genTimeout} onChange={(e) => setGenTimeout(Number(e.target.value) || 60)} />
              </div>
              <div className="field">
                <div className="label">Download Timeout (Seconds)</div>
                <input type="number" className="input" value={downloadTimeout} onChange={(e) => setDownloadTimeout(Number(e.target.value) || 15)} />
              </div>
            </div>
          </div>

          {/* Runtime Environment Capabilities */}
          <div className="rule" />
          <div className="space-y-4">
            <h3 className="section-title">3. Runtime Capabilities & Architecture Status</h3>
            <div className="two">
              <div className="value-block">
                <small className="muted">Platform / OS:</small>
                <div className="font-mono">{runtimeStatus?.platform || process.platform || 'win32'}</div>
              </div>
              <div className="value-block">
                <small className="muted">Node.js Runtime:</small>
                <div className="font-mono">{runtimeStatus?.nodeVersion || 'v22.x'}</div>
              </div>
              <div className="value-block">
                <small className="muted">Browser Automation Architecture:</small>
                <div className="font-semibold muted green-text">Installed Google Chrome via Chrome DevTools Protocol (CDP)</div>
              </div>
              <div className="value-block">
                <small className="muted">Installed Chrome Detection:</small>
                <div className="font-semibold muted">{chromeStatus?.chromeFound ? 'Installed Chrome Found' : 'Chrome Path Pending Verification'}</div>
              </div>
              <div className="value-block">
                <small className="muted">Active Provider Mode:</small>
                <div className="font-semibold">{currentProject?.provider || runtimeStatus?.activeAdapterName || 'ChatGPT (DALL-E 3) via Chrome CDP'}</div>
              </div>
            </div>
          </div>

          {/* Security & Local Safeguards Guarantee */}
          <div className="notice green">
            <Shield className="icon" />
            <div>
              <span className="font-semibold">Security & Profile Integrity Guarantee</span>
              <p className="hint">
                AutoGenImg Studio binds exclusively to loopback <code>127.0.0.1</code> and uses a dedicated persistent profile ({'./browser-profile/'}).
                It never manipulates your personal default Chrome profile, does not copy stored credentials or cookies, and never transmits tokens
                over external networks. You authenticate directly and manually inside the visible Google Chrome window.
              </p>
            </div>
          </div>

          <div className="actions">
            <button type="submit" className="btn primary">
              <Save className="icon" />
              <span>Save Preferences</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
