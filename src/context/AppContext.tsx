import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  ProjectConfig,
  PromptBundle,
  ReferenceFile,
  QueueProgressState,
  RunManifest,
  LogEvent,
  ProjectSummary,
  RecentSuggestions,
  ReferenceCategory,
} from '../types/index.ts';
import { SAMPLE_REFERENCES } from '../utils/sampleData.ts';

export type PageId =
  | 'dashboard'
  | 'settings_project'
  | 'how_to_use'
  | 'bundle'
  | 'references'
  | 'monitor'
  | 'review'
  | 'reports'
  | 'gallery'
  | 'settings';

export type ThemeMode =
  | 'dark'
  | 'light'
  | 'aurora-violet'
  | 'arctic-blue'
  | 'lavender-mist'
  | 'midnight-orchid'
  | 'obsidian-amethyst'
  | 'carbon-graphite'
  | 'midnight-sapphire'
  | 'dark-titanium';

interface RuntimeStatus {
  platform: string;
  nodeVersion: string;
  browserAutomationAvailable: boolean;
  adapterReason?: string;
  activeAdapterId: string;
  activeAdapterName: string;
  isDemoMode: boolean;
  hasActiveProject: boolean;
  activeProject?: ProjectConfig | null;
  chromeStatus?: {
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
    statusMessage: string;
    provider?: string;
  };
}

interface AppContextValue {
  activePage: PageId;
  setActivePage: (page: PageId) => void;
  theme: ThemeMode;
  toggleTheme: () => void;
  setTheme: (theme: ThemeMode) => void;
  currentProject: ProjectConfig | null;
  currentBundle: PromptBundle | null;
  currentReferences: ReferenceFile[];
  referenceCount: { count: number; max: number; remaining: number; atLimit: boolean } | null;
  uploadProgress: { fileName: string; progress: number; status: 'uploading' | 'verifying' | 'complete' | 'error' } | null;
  queueState: QueueProgressState;
  manifest: RunManifest | null;
  logs: LogEvent[];
  runtimeStatus: RuntimeStatus | null;
  projectsList: ProjectSummary[];
  suggestions: RecentSuggestions | null;
  runsList: RunManifest[];
  initProject: (project: ProjectConfig, bundle?: PromptBundle, refs?: ReferenceFile[]) => Promise<boolean>;
  openProject: (projectId: string) => Promise<boolean>;
  duplicateProject: (projectId: string, newName?: string) => Promise<boolean>;
  deleteProject: (projectId: string) => Promise<boolean>;
  exportProject: (projectId: string) => void;
  importProject: (archiveBase64: string, name?: string) => Promise<{ success: boolean; error?: string }>;
  uploadReferenceMedia: (
    file: File,
    meta: {
      category: ReferenceCategory;
      label: string;
      mode: 'all' | 'selected';
      assignedPromptIds: string[];
      refId?: string;
    }
  ) => Promise<{ success: boolean; error?: string }>;
  loadSampleReferences: () => Promise<void>;
  updateBundle: (bundle: PromptBundle) => Promise<void>;
  updateReferences: (refs: ReferenceFile[]) => Promise<void>;
  startRun: (regenerateAll?: boolean | unknown) => Promise<{ success: boolean; message: string }>;
  regenerateAll: () => Promise<{ success: boolean; message: string }>;
  loadSampleProject?: () => Promise<void>;
  pauseRun: (reason?: string) => Promise<boolean>;
  resumeRun: () => Promise<boolean>;
  stopRun: () => Promise<boolean>;
  regeneratePrompt: (promptId: string) => Promise<boolean>;
  retryDownload: (promptId: string) => Promise<boolean>;
  markReviewed: (promptId: string) => Promise<boolean>;
  skipItem: (promptId: string) => Promise<boolean>;
  deleteRunArtifacts: (runId: string) => Promise<{ success: boolean; deletedFilesCount?: number; error?: string }>;
  refreshState: () => Promise<void>;
  saveProject: () => Promise<boolean>;
  scheduleAutoSave: () => void;
  saveStatus: { kind: 'idle' | 'saving' | 'saved' | 'failed'; message?: string };
}

const defaultQueueState: QueueProgressState = {
  runId: '',
  projectId: '',
  overallStatus: 'IDLE',
  currentPromptId: null,
  currentSequence: 0,
  currentStage: 'IDLE',
  totalPrompts: 0,
  processedCount: 0,
  savedCount: 0,
  reviewCount: 0,
  failedCount: 0,
  skippedCount: 0,
  percentage: 0,
  elapsedMs: 0,
  currentItemElapsedMs: 0,
  isPaused: false,
  isDemoMode: false,
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [activePage, setActivePage] = useState<PageId>('dashboard');
  const [theme, setTheme] = useState<ThemeMode>(() => {
    return (localStorage.getItem('autogenimg_theme') as ThemeMode) || 'dark';
  });

  // Persist active page to sessionStorage so it survives reloads.
  const setActivePageWithPersistence = (page: PageId) => {
    setActivePage(page);
    try {
      sessionStorage.setItem('autogenimg_active_page', page);
    } catch {}
  };

  const VALID_PAGE_IDS: PageId[] = [
    'dashboard',
    'settings_project',
    'how_to_use',
    'bundle',
    'references',
    'monitor',
    'review',
    'reports',
    'gallery',
    'settings',
  ];
  const [currentProject, setCurrentProject] = useState<ProjectConfig | null>(null);
  const [currentBundle, setCurrentBundle] = useState<PromptBundle | null>(null);
  const [currentReferences, setCurrentReferences] = useState<ReferenceFile[]>([]);
  const [referenceCount, setReferenceCount] = useState<{ count: number; max: number; remaining: number; atLimit: boolean } | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ fileName: string; progress: number; status: 'uploading' | 'verifying' | 'complete' | 'error' } | null>(null);
  const [queueState, setQueueState] = useState<QueueProgressState>(defaultQueueState);
  const [manifest, setManifest] = useState<RunManifest | null>(null);
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus | null>(null);
  const [projectsList, setProjectsList] = useState<ProjectSummary[]>([]);
  const [suggestions, setSuggestions] = useState<RecentSuggestions | null>(null);
  const [runsList, setRunsList] = useState<RunManifest[]>([]);
  const [saveStatus, setSaveStatus] = useState<{ kind: 'idle' | 'saving' | 'saved' | 'failed'; message?: string }>({
    kind: 'idle',
  });

  let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  const clearSaveStatus = () => {
    setSaveStatus({ kind: 'idle' });
  };

const PREMIUM_THEMES = new Set([
  'aurora-violet', 'arctic-blue', 'lavender-mist', 'midnight-orchid',
  'obsidian-amethyst', 'carbon-graphite', 'midnight-sapphire', 'dark-titanium',
]);

  // Apply theme via data-theme attribute (reference uses :root[data-theme="..."])
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    if (PREMIUM_THEMES.has(theme)) {
      root.setAttribute('data-premium-theme', '');
    } else {
      root.removeAttribute('data-premium-theme');
    }
    localStorage.setItem('autogenimg_theme', theme);
  }, [theme]);

  const setThemeMode = (newTheme: ThemeMode) => {
    setTheme(newTheme);
  };

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  /**
   * Persist the active project configuration durably to disk via the server.
   * Used for auto-save and explicit save actions. Returns true on success.
   */
  const saveProject = async (): Promise<boolean> => {
    if (!currentProject) return false;
    setSaveStatus({ kind: 'saving' });
    try {
      const res = await fetch('/api/projects/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: currentProject,
          bundle: currentBundle || undefined,
          references: currentReferences,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSaveStatus({ kind: 'saved' });
        setTimeout(clearSaveStatus, 1500);
        return true;
      }
      setSaveStatus({ kind: 'failed', message: data.error || 'Save failed.' });
      setTimeout(clearSaveStatus, 3000);
      return false;
    } catch (err: any) {
      setSaveStatus({ kind: 'failed', message: err.message || 'Save failed.' });
      setTimeout(clearSaveStatus, 3000);
      return false;
    }
  };

  /**
   * Debounced auto-save: coalesces rapid edits into a single durable write.
   * Avoids stale requests overwriting newer edits by cancelling previous timers.
   */
  const scheduleAutoSave = () => {
    if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(() => {
      saveDebounceTimer = null;
      void saveProject();
    }, 1000);
  };

  const refreshState = async () => {
    try {
      const [
        statusRes,
        queueRes,
        manifestRes,
        logsRes,
        projectsRes,
        suggestionsRes,
        activeRes,
        runsRes,
        refCountRes,
      ] = await Promise.all([
        fetch('/api/status').then((r) => r.json()).catch(() => null),
        fetch('/api/queue/state').then((r) => r.json()).catch(() => null),
        fetch('/api/queue/manifest').then((r) => r.json()).catch(() => null),
        fetch('/api/queue/logs').then((r) => r.json()).catch(() => []),
        fetch('/api/projects').then((r) => r.json()).catch(() => []),
        fetch('/api/suggestions').then((r) => r.json()).catch(() => null),
        fetch('/api/projects/active').then((r) => r.json()).catch(() => null),
        fetch('/api/runs').then((r) => r.json()).catch(() => []),
        fetch('/api/references/count').then((r) => r.json()).catch(() => null),
      ]);

      if (statusRes) setRuntimeStatus(statusRes);
      if (queueRes) setQueueState(queueRes);
      if (manifestRes) setManifest(manifestRes);
      if (Array.isArray(logsRes)) setLogs(logsRes);
      if (Array.isArray(projectsRes)) setProjectsList(projectsRes);
      if (suggestionsRes?.suggestions) setSuggestions(suggestionsRes.suggestions);
      if (Array.isArray(runsRes)) setRunsList(runsRes);
      if (refCountRes && typeof refCountRes.count === 'number') setReferenceCount(refCountRes);

      // Hydrate active project from server if local state is null
      if (activeRes && activeRes.active) {
        if (!currentProject || currentProject.id !== activeRes.project.id) {
          setCurrentProject(activeRes.project);
          if (activeRes.bundle) setCurrentBundle(activeRes.bundle);
          if (activeRes.references) setCurrentReferences(activeRes.references);
          if (activeRes.manifest) setManifest(activeRes.manifest);
        }
      }
    } catch (e) {
      console.error('Error refreshing state:', e);
    }
  };

  // Restore active page from sessionStorage on mount, if still valid.
  useEffect(() => {
    try {
      const savedPage = sessionStorage.getItem('autogenimg_active_page') as PageId | null;
      if (savedPage && VALID_PAGE_IDS.includes(savedPage)) {
        setActivePage(savedPage);
      }
    } catch {}
  }, []);

  // Setup SSE and initial state hydration on mount
  useEffect(() => {
    refreshState();

    const eventSource = new EventSource('/api/events');

    // Throttle SSE state updates to prevent excessive re-renders during automation.
    // Queue state changes frequently (every item status change, every poll).
    // Throttling to at most once per 300ms prevents UI flickering while still
    // providing responsive progress updates.
    let lastStateUpdate = 0;
    const STATE_THROTTLE_MS = 300;
    let pendingStateData: QueueProgressState | null = null;
    let stateThrottleTimer: ReturnType<typeof setTimeout> | null = null;

    eventSource.addEventListener('state', (e) => {
      try {
        const stateData: QueueProgressState = JSON.parse(e.data);
        const now = Date.now();
        if (now - lastStateUpdate >= STATE_THROTTLE_MS) {
          lastStateUpdate = now;
          setQueueState(stateData);
        } else {
          // Store the latest data and schedule a deferred update
          pendingStateData = stateData;
          if (!stateThrottleTimer) {
            stateThrottleTimer = setTimeout(() => {
              stateThrottleTimer = null;
              lastStateUpdate = Date.now();
              if (pendingStateData) {
                setQueueState(pendingStateData);
                pendingStateData = null;
              }
            }, STATE_THROTTLE_MS - (now - lastStateUpdate));
          }
        }
      } catch {}
    });

    eventSource.addEventListener('log', (e) => {
      try {
        const logData: LogEvent = JSON.parse(e.data);
        setLogs((prev) => [...prev.slice(-200), logData]);
      } catch {}
    });

    eventSource.addEventListener('item_update', () => {
      fetch('/api/queue/manifest')
        .then((r) => r.json())
        .then((data) => {
          if (data) setManifest(data);
        })
        .catch(() => {});
    });

    return () => {
      if (stateThrottleTimer) {
        clearTimeout(stateThrottleTimer);
        stateThrottleTimer = null;
      }
      eventSource.close();
    };
  }, []);

  const initProject = async (
    project: ProjectConfig,
    bundle?: PromptBundle,
    refs?: ReferenceFile[]
  ): Promise<boolean> => {
    try {
      const res = await fetch('/api/projects/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project, bundle, references: refs }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCurrentProject(data.project);
        if (bundle) setCurrentBundle(bundle);
        if (refs) setCurrentReferences(refs);
        if (data.manifest) setManifest(data.manifest);
        await refreshState();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const openProject = async (projectId: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/projects/active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCurrentProject(data.project);
        setCurrentBundle(data.bundle || null);
        setCurrentReferences(data.references || []);
        setManifest(data.manifest || null);
        await refreshState();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const duplicateProject = async (projectId: string, newName?: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/projects/duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, newName }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await refreshState();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const deleteProject = async (projectId: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok && data.success) {
        if (currentProject && currentProject.id === projectId) {
          setCurrentProject(null);
          setCurrentBundle(null);
          setCurrentReferences([]);
          setManifest(null);
          // Active project was deleted: navigate to dashboard since
          // project-dependent views are no longer valid.
          setActivePageWithPersistence('dashboard');
        }
        await refreshState();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const exportProject = async (projectId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/export`, {
        method: 'GET',
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `Export failed (${res.status}).`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // Suggest a useful filename; fall back if the server did not send one.
      const disposition = res.headers.get('Content-Disposition') || '';
      const filenameMatch = disposition.match(/filename\*?=('')?([^;]+)/i);
      const suggestedName = filenameMatch
        ? decodeURIComponent(filenameMatch[2].replace(/^"|"$/g, ''))
        : `${projectId}_export.zip`;
      a.download = suggestedName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      // Surface a real error instead of silently navigating to an invalid response.
      setSaveStatus({ kind: 'failed', message: err.message || 'Export failed.' });
      setTimeout(clearSaveStatus, 3000);
      throw err;
    }
  };

  const importProject = async (
    archiveBase64: string,
    name?: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/projects/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archiveBase64, name }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCurrentProject(data.project);
        setCurrentBundle(data.bundle || null);
        setCurrentReferences(data.references || []);
        await refreshState();
        return { success: true };
      }
      return { success: false, error: data.error || 'Import failed.' };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const uploadReferenceMedia = async (
    file: File,
    meta: {
      category: ReferenceCategory;
      label: string;
      mode: 'all' | 'selected';
      assignedPromptIds: string[];
      refId?: string;
    }
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const base64 = (reader.result as string).split(',')[1];
            const res = await fetch('/api/references/upload', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                fileName: file.name,
                fileBase64: base64,
                category: meta.category,
                label: meta.label,
                mode: meta.mode,
                assignedPromptIds: meta.assignedPromptIds,
                refId: meta.refId,
              }),
            });

            // Defensive: handle empty / non-JSON responses (e.g. "Unexpected end of JSON input")
            const contentType = res.headers.get('content-type') || '';
            let data: any = null;
            if (contentType.includes('application/json')) {
              try {
                data = await res.json();
              } catch {
                data = null;
              }
            }
            if (!data) {
              const text = await res.text().catch(() => '');
              resolve({
                success: false,
                error: `Upload failed (${res.status})${text ? ': ' + text.slice(0, 200) : ''}.`,
              });
              return;
            }

            if (res.ok && data.success) {
              await refreshState();
              void scheduleAutoSave();
              resolve({ success: true });
            } else {
              resolve({ success: false, error: data.error || 'Upload failed.' });
            }
          } catch (e: any) {
            resolve({ success: false, error: e.message });
          }
        };
        reader.onerror = () => resolve({ success: false, error: 'File read error.' });
        reader.readAsDataURL(file);
      });
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const loadSampleReferences = async () => {
    await updateReferences(SAMPLE_REFERENCES);
  };

  const updateBundle = async (bundle: PromptBundle) => {
    setCurrentBundle(bundle);
    try {
      await fetch('/api/bundle/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundle }),
      });
    } catch {}
    void scheduleAutoSave();
  };

  const updateReferences = async (refs: ReferenceFile[]) => {
    setCurrentReferences(refs);
    try {
      await fetch('/api/references/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ references: refs }),
      });
    } catch {}

    // Reconcile Prompt Bundle referenceIds with current Reference Manager assignments.
    // This ensures the canonical JSON, Bundle Manager UI, and Reference Manager all
    // show the same assignments.
    if (currentBundle) {
      const reconcileBundle = { ...currentBundle };
      reconcileBundle.prompts = currentBundle.prompts.map((p) => {
        const effectiveRefIds = refs
          .filter((r) => {
            if (r.assignedMode === 'all') return true;
            if (r.assignedMode === 'selected') {
              return r.assignedPromptIds && r.assignedPromptIds.includes(p.id);
            }
            return false;
          })
          .map((r) => r.id);
        return { ...p, referenceIds: effectiveRefIds };
      });
      try {
        await fetch('/api/bundle/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bundle: reconcileBundle }),
        });
        setCurrentBundle(reconcileBundle);
      } catch {}
    }

    void scheduleAutoSave();
  };

  const loadSampleProject = async () => {
    const { SAMPLE_PROJECT, SAMPLE_BUNDLE } = await import('../utils/sampleData.ts');
    await initProject(SAMPLE_PROJECT, SAMPLE_BUNDLE, SAMPLE_REFERENCES);
  };

  const startRun = async (regenerateAll?: boolean | unknown) => {
    const isRegen = typeof regenerateAll === 'boolean' ? regenerateAll : false;
    try {
      const res = await fetch('/api/queue/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regenerateAll: isRegen }),
      });
      const data = await res.json();
      await refreshState();
      return data;
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  };

  const regenerateAll = async () => {
    try {
      const res = await fetch('/api/queue/regenerate-all', { method: 'POST' });
      const data = await res.json();
      await refreshState();
      return data;
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  };

  const pauseRun = async (reason?: string) => {
    try {
      const res = await fetch('/api/queue/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      await refreshState();
      return Boolean(data.success);
    } catch {
      return false;
    }
  };

  const resumeRun = async () => {
    try {
      const res = await fetch('/api/queue/resume', { method: 'POST' });
      const data = await res.json();
      await refreshState();
      return Boolean(data.success);
    } catch {
      return false;
    }
  };

  const stopRun = async () => {
    try {
      const res = await fetch('/api/queue/stop', { method: 'POST' });
      const data = await res.json();
      await refreshState();
      return Boolean(data.success);
    } catch {
      return false;
    }
  };

  const regeneratePrompt = async (promptId: string) => {
    try {
      const res = await fetch('/api/queue/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promptId }),
      });
      const data = await res.json();
      await refreshState();
      return Boolean(data.success);
    } catch {
      return false;
    }
  };

  const retryDownload = async (promptId: string) => {
    try {
      const res = await fetch('/api/queue/retry-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promptId }),
      });
      const data = await res.json();
      await refreshState();
      return Boolean(data.success);
    } catch {
      return false;
    }
  };

  const markReviewed = async (promptId: string) => {
    try {
      const res = await fetch('/api/queue/mark-reviewed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promptId }),
      });
      const data = await res.json();
      await refreshState();
      return Boolean(data.success);
    } catch {
      return false;
    }
  };

  const skipItem = async (promptId: string) => {
    try {
      const res = await fetch('/api/queue/skip-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promptId }),
      });
      const data = await res.json();
      await refreshState();
      return Boolean(data.success);
    } catch {
      return false;
    }
  };

  const deleteRunArtifacts = async (
    runId: string
  ): Promise<{ success: boolean; deletedFilesCount?: number; error?: string }> => {
    try {
      const res = await fetch(`/api/runs/${runId}`, { method: 'DELETE' });
      const data = await res.json();
      await refreshState();
      return data;
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  return (
    <AppContext.Provider
      value={{
        activePage,
        setActivePage: setActivePageWithPersistence,
        theme,
        toggleTheme,
        setTheme: setThemeMode,
        currentProject,
        currentBundle,
        currentReferences,
        referenceCount,
        uploadProgress,
        queueState,
        manifest,
        logs,
        runtimeStatus,
        projectsList,
        suggestions,
        runsList,
        initProject,
        openProject,
        duplicateProject,
        deleteProject,
        exportProject,
        importProject,
        uploadReferenceMedia,
        loadSampleReferences,
        loadSampleProject,
        updateBundle,
        updateReferences,
        saveProject,
        scheduleAutoSave,
        saveStatus,
        startRun,
        regenerateAll,
        pauseRun,
        resumeRun,
        stopRun,
        regeneratePrompt,
        retryDownload,
        markReviewed,
        skipItem,
        deleteRunArtifacts,
        refreshState,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
}
