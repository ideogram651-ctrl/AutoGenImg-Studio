import React from 'react';
import { Menu, Play, RefreshCw, FolderPlus, Sparkles, ExternalLink, Globe } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';

interface HeaderProps {
  onOpenMobileMenu: () => void;
  onOpenNewProjectModal: () => void;
}

export function Header({ onOpenMobileMenu, onOpenNewProjectModal }: HeaderProps) {
  const { activePage, currentProject, queueState, runtimeStatus, startRun, setActivePage } = useApp();

  const pageTitles: Record<string, { title: string; subtitle: string }> = {
    dashboard: {
      title: 'Dashboard',
      subtitle: 'Overview of project library, active run progress, and execution status.',
    },
    settings_project: {
      title: 'Project Settings',
      subtitle: 'Configure local output folder, target AI provider, and video interval parameters.',
    },
    how_to_use: {
      title: 'How to Use / Guided Workflow',
      subtitle: 'Step-by-step master prompt builder, script preparation, and workflow instructions.',
    },
    bundle: {
      title: 'Prompt Bundle Manager',
      subtitle: 'Inspect, validate, and sequence structured JSON prompt bundles.',
    },
    references: {
      title: 'Reference Manager',
      subtitle: 'Organize character, style, and environment references and assign them to prompt IDs.',
    },
    monitor: {
      title: 'Run Monitor',
      subtitle: 'Live visible queue progress, item stages, timestamps, and real-time event logs.',
    },
    review: {
      title: 'Review Center',
      subtitle: 'Resolve ambiguous generations, download exceptions, and deliberate user regenerations.',
    },
    reports: {
      title: 'Reports & History',
      subtitle: 'Inspect self-contained offline HTML reports, wall-clock timings, and manifests.',
    },
    settings: {
      title: 'Application Settings',
      subtitle: 'Theme preferences, default output locations, browser profiles, and diagnostic options.',
    },
  };

  const currentMeta = pageTitles[activePage] || {
    title: 'AutoGenImg Studio',
    subtitle: 'AI Image Workflow Studio',
  };

  const isBrowserConnected = Boolean(runtimeStatus?.chromeStatus?.connected);
  const activeProvider = currentProject?.provider || runtimeStatus?.activeAdapterId || 'chatgpt';
  const providerLabel = activeProvider === 'gemini' ? 'Gemini' : activeProvider === 'chatgpt' ? 'ChatGPT' : 'Simulation';

  return (
    <header
      className="p-4 lg:px-8 border-b flex flex-wrap items-center justify-between gap-4 glass-panel sticky top-0 z-30"
      style={{ borderColor: 'var(--surface-border)' }}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 rounded-lg hover:bg-white/10"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              {currentMeta.title}
            </h1>
            {currentProject && (
              <span
                className="hidden sm:inline-block px-2 py-0.5 rounded text-[11px] font-medium"
                style={{
                  backgroundColor: 'var(--accent-light)',
                  color: 'var(--accent)',
                  border: '1px solid rgba(99, 102, 241, 0.25)',
                }}
              >
                {currentProject.name}
              </span>
            )}
            {queueState.overallStatus === 'RUNNING' && (
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Queue Running ({queueState.percentage}%)
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5 hidden sm:block">
            {currentMeta.subtitle}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        {/* Truthful Runtime Status Pill */}
        <div
          className="hidden md:flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs border"
          style={{
            backgroundColor: 'var(--surface-elevated)',
            borderColor: 'var(--surface-border)',
          }}
          title={runtimeStatus?.chromeStatus?.statusMessage || 'Browser session status'}
        >
          <div
            className={`w-2 h-2 rounded-full ${
              isBrowserConnected ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]' : 'bg-zinc-500'
            }`}
          />
          <span className="text-[11px] text-[var(--text-secondary)]">Provider:</span>
          <span className="font-semibold text-[11px]" style={{ color: 'var(--text-primary)' }}>
            {providerLabel} via Chrome
          </span>
          <span className="text-[10px] text-[var(--text-secondary)] border-l pl-2 ml-0.5" style={{ borderColor: 'var(--surface-border)' }}>
            {isBrowserConnected ? 'Connected' : 'Not Connected'}
          </span>
        </div>

        <button
          onClick={onOpenNewProjectModal}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-white/10 transition-colors"
          style={{
            backgroundColor: 'var(--surface-elevated)',
            border: '1px solid var(--surface-border)',
            color: 'var(--text-primary)',
          }}
        >
          <FolderPlus className="w-3.5 h-3.5" />
          <span>New Project</span>
        </button>

        {currentProject && queueState.overallStatus !== 'RUNNING' && (
          <button
            onClick={() => {
              setActivePage('monitor');
              startRun();
            }}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-all"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Start Queue</span>
          </button>
        )}
      </div>
    </header>
  );
}
