import React, { useState } from 'react';
import {
  Activity,
  Play,
  Pause,
  RotateCcw,
  Square,
  FileText,
  FolderOpen,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ShieldAlert,
  Layers,
  Terminal,
  RefreshCw,
  Hash,
  ShieldCheck,
  Check,
  ChevronRight,
} from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';

export function RunMonitorPage() {
  const {
    currentProject,
    queueState,
    manifest,
    logs,
    runtimeStatus,
    startRun,
    pauseRun,
    resumeRun,
    stopRun,
    regenerateAll,
    setActivePage,
  } = useApp();

  const [showRegenConfirm, setShowRegenConfirm] = useState(false);

  const totalPrompts = manifest?.totalPrompts || queueState.totalPrompts || 0;
  const processedCount = manifest?.processedCount || queueState.processedCount || 0;
  const savedCount = manifest?.savedCount || queueState.savedCount || 0;
  const reviewCount = manifest?.reviewCount || queueState.reviewCount || 0;
  const failedCount = manifest?.failedCount || queueState.failedCount || 0;
  const percentage = queueState.percentage;

  const existingImageCount = manifest?.items?.filter(
    (i) => i.status === 'SAVED' && i.outputFile
  ).length || 0;

  const isRunning = queueState.overallStatus === 'RUNNING';
  const isPaused =
    queueState.overallStatus === 'PAUSED' ||
    queueState.overallStatus === 'PAUSED_PROVIDER_LIMIT' ||
    queueState.overallStatus === 'BLOCKED_AUTH';
  const isBlockedAuth = queueState.overallStatus === 'BLOCKED_AUTH';
  const isDemo = queueState.isDemoMode || currentProject?.provider === 'simulation';

  const formatElapsed = (ms: number) => {
    const totalSecs = Math.floor(ms / 1000);
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const STAGES = [
    { key: 'PREFLIGHT', label: 'Preflight' },
    { key: 'SUBMITTING', label: 'Submitting' },
    { key: 'GENERATING', label: 'Generating' },
    { key: 'COMPLETION_CHECK', label: 'Detect' },
    { key: 'DOWNLOADING', label: 'Download' },
    { key: 'VERIFYING', label: 'Verify' },
    { key: 'COMMITTING', label: 'Commit' },
  ];

  const getStageIndex = (stage: string) => {
    const norm = stage.toUpperCase();
    if (norm === 'PREPARING') return 0;
    if (norm === 'RESULT_READY') return 3;
    if (norm === 'SAVED') return 6;
    const idx = STAGES.findIndex((s) => s.key === norm);
    return idx >= 0 ? idx : -1;
  };

  const currentStageIndex = getStageIndex(queueState.currentStage);

  const stageDescriptions: Record<string, string> = {
    IDLE: 'Queue idle. Select Start Queue or Regenerate All to begin deterministic sequential execution.',
    PREFLIGHT: 'Preflight check: validating provider tab, CDP connection, references, and output paths...',
    PREPARING: 'Formatting prompt and resolving assigned reference media/text on disk...',
    SUBMITTING: 'Focusing input and dispatching prompt to browser UI (single-dispatch lock)...',
    GENERATING: 'Observing provider generation signals (strict sequential lock: Prompt N+1 held)...',
    COMPLETION_CHECK: 'Detecting completion indicators and locating downloadable artifact...',
    RESULT_READY: 'Genuine image output detected in target conversation.',
    DOWNLOADING: 'Downloading to temporary .part staging path and awaiting completion event...',
    VERIFYING: 'Validating image magic bytes, non-empty size, and computing SHA-256 hash...',
    COMMITTING: 'Atomically moving file to run directory and committing manifest record.',
    SAVED: 'Output verified, hashed, and committed. Ready for next prompt.',
    NEEDS_REVIEW: 'Item flagged for human inspection in Review Center.',
    PAUSED: 'Queue paused safely. Sequential state machine frozen.',
    PAUSED_PROVIDER_LIMIT: 'Paused: Provider usage quota reached. Resume when allowed.',
    BLOCKED_AUTH: 'Paused: Manual authentication or CAPTCHA verification required in Chrome.',
  };

  const lastSavedItem = manifest?.items
    ?.slice()
    ?.reverse()
    ?.find((i) => i.status === 'SAVED');

  const handleConfirmRegenerate = async () => {
    setShowRegenConfirm(false);
    await regenerateAll();
  };

  return (
    <div className="stack">
      {/* Blocked Auth Banner */}
      {isBlockedAuth && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-amber-400">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <span>
              <strong>ACTION REQUIRED IN CHROME:</strong> Please log in or complete verification directly in the automated Chrome browser, then click <strong>Resume Queue</strong>.
            </span>
          </div>
          <button
            onClick={resumeRun}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white shrink-0 shadow-sm"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Resume Queue</span>
          </button>
        </div>
      )}

      {/* Simulation Warning Banner if in Simulation Mode */}
      {isDemo && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-amber-300">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>
              <strong>SIMULATION MODE ACTIVE:</strong> Currently producing local test SVG artifacts. To generate genuine AI images, select <strong>ChatGPT</strong> or <strong>Gemini</strong> in Project Settings.
            </span>
          </div>
          <button
            onClick={() => setActivePage('settings')}
            className="text-xs text-amber-400 underline font-semibold shrink-0"
          >
            Change Provider
          </button>
        </div>
      )}

      {/* Main Execution Card */}
      <div className="panel" style={{ borderColor: 'var(--surface-border)' }}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-5 h-5 text-indigo-400" />
              <h2 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                Active Run Orchestrator
              </h2>
            </div>
            <div className="text-xs text-[var(--text-secondary)] flex flex-wrap items-center gap-x-3 gap-y-1">
              {currentProject ? (
                <>
                  <span>
                    Project: <strong className="text-white">{currentProject.name}</strong>
                  </span>
                  <span>&bull;</span>
                  <span>
                    Run ID: <code className="text-indigo-400 font-mono">{queueState.runId || manifest?.runId || 'run-pending'}</code>
                  </span>
                  <span>&bull;</span>
                  <span>
                    Provider: <strong className="text-white uppercase">{currentProject.provider}</strong>
                  </span>
                  <span>&bull;</span>
                  <span className="flex items-center gap-1">
                    Browser: {runtimeStatus?.browserAutomationAvailable ? (
                      <span className="text-emerald-400 font-semibold flex items-center gap-0.5">
                        <Check className="w-3 h-3" /> CDP Active
                      </span>
                    ) : (
                      <span className="text-[var(--text-secondary)]">Standby</span>
                    )}
                  </span>
                </>
              ) : (
                'No project loaded. Go to Dashboard or Project Settings to initialize.'
              )}
            </div>
          </div>

          {/* Run Control Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {!isRunning && !isPaused && (
              <>
                <button
                  onClick={startRun}
                  disabled={!currentProject || totalPrompts === 0}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition-all disabled:opacity-40"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>{savedCount > 0 && savedCount < totalPrompts ? 'Resume Incomplete' : 'Start Queue'}</span>
                </button>

                <button
                  onClick={() => {
                    if (savedCount > 0) {
                      setShowRegenConfirm(true);
                    } else {
                      regenerateAll();
                    }
                  }}
                  disabled={!currentProject || totalPrompts === 0}
                  className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition-all disabled:opacity-40"
                  title="Create fresh run ID and regenerate all prompts without skipping"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Regenerate All</span>
                </button>
              </>
            )}

            {isRunning && (
              <button
                onClick={() => pauseRun()}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white shadow-md transition-all"
              >
                <Pause className="w-4 h-4" />
                <span>Pause Queue</span>
              </button>
            )}

            {isPaused && (
              <>
                <button
                  onClick={resumeRun}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition-all"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Resume Queue</span>
                </button>

                <button
                  onClick={() => setShowRegenConfirm(true)}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition-all"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Regenerate All</span>
                </button>
              </>
            )}

            {(isRunning || isPaused) && (
              <button
                onClick={stopRun}
                className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white shadow-md transition-all"
              >
                <Square className="w-4 h-4" />
                <span>Stop</span>
              </button>
            )}

            <button
              onClick={() => setActivePage('reports')}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-medium hover:bg-white/10 transition-colors"
              style={{
                backgroundColor: 'var(--surface-elevated)',
                border: '1px solid var(--surface-border)',
                color: 'var(--text-primary)',
              }}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Run Report</span>
            </button>
          </div>
        </div>

        {/* Deterministic State Machine Stepper */}
        <div className="p-4 rounded-xl bg-black/25 border border-white/5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wider text-[var(--text-secondary)] font-semibold">
                Current Item:
              </span>
              {queueState.currentPromptId ? (
                <span className="font-mono text-sm font-bold text-indigo-400">
                  {queueState.currentPromptId} (Seq #{queueState.currentSequence})
                </span>
              ) : (
                <span className="text-xs text-[var(--text-secondary)]">Queue idle &bull; Ready</span>
              )}
            </div>

            <div className="flex items-center gap-3 text-xs">
              <span className="text-[var(--text-secondary)]">
                Elapsed: <strong style={{ color: 'var(--text-primary)' }}>{formatElapsed(queueState.elapsedMs)}</strong>
              </span>
              <span
                className="px-2.5 py-0.5 rounded text-[11px] font-bold uppercase font-mono"
                style={{
                  backgroundColor: isRunning
                    ? 'rgba(34, 197, 94, 0.15)'
                    : isPaused
                    ? 'rgba(245, 158, 11, 0.15)'
                    : 'rgba(148, 163, 184, 0.15)',
                  color: isRunning ? '#4ade80' : isPaused ? '#fbbf24' : '#cbd5e1',
                  border: '1px solid currentColor',
                }}
              >
                {queueState.currentStage}
              </span>
            </div>
          </div>

          {/* Stepper Steps */}
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-1.5 pt-1">
            {STAGES.map((s, idx) => {
              const isPast = currentStageIndex > idx;
              const isCurrent = currentStageIndex === idx && (isRunning || isPaused);

              return (
                <div
                  key={s.key}
                  className={`p-2 rounded-lg text-center border text-[11px] font-medium transition-all ${
                    isCurrent
                      ? 'border-indigo-500 bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500'
                      : isPast
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                      : 'border-white/5 bg-white/5 text-[var(--text-secondary)] opacity-50'
                  }`}
                >
                  <div className="text-[9px] font-mono uppercase opacity-70">
                    Step {idx + 1}
                  </div>
                  <div className="font-semibold truncate">{s.label}</div>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-[var(--text-secondary)]">
            {stageDescriptions[queueState.currentStage] || 'Processing queue...'}
          </p>

          {/* Progress Bar */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-medium text-[var(--text-secondary)]">
                Sequential Verification Progress (Prompt N+1 waits for Prompt N verified)
              </span>
              <span className="font-bold" style={{ color: 'var(--text-primary)' }}>
                {processedCount} of {totalPrompts} items ({percentage}%)
              </span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-white/10 overflow-hidden relative">
              <div
                className="h-full transition-all duration-300 bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400"
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
        </div>

        {/* 4 Summary Stat Boxes */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-lg glass-card text-center">
            <span className="text-[11px] text-[var(--text-secondary)] block uppercase">Saved & Verified</span>
            <span className="text-xl font-bold text-emerald-400 mt-0.5 block">{savedCount}</span>
          </div>

          <div className="p-3.5 rounded-lg glass-card text-center">
            <span className="text-[11px] text-[var(--text-secondary)] block uppercase">Needs Review</span>
            <span className="text-xl font-bold text-amber-400 mt-0.5 block">{reviewCount}</span>
          </div>

          <div className="p-3.5 rounded-lg glass-card text-center">
            <span className="text-[11px] text-[var(--text-secondary)] block uppercase">Failures</span>
            <span className="text-xl font-bold text-rose-400 mt-0.5 block">{failedCount}</span>
          </div>

          <div className="p-3.5 rounded-lg glass-card text-center">
            <span className="text-[11px] text-[var(--text-secondary)] block uppercase">Remaining</span>
            <span className="text-xl font-bold mt-0.5 block" style={{ color: 'var(--text-primary)' }}>
              {Math.max(0, totalPrompts - processedCount)}
            </span>
          </div>
        </div>

        {/* Last Verified Artifact Card */}
        {lastSavedItem && (
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>
                <strong>Latest Verified Output:</strong> {lastSavedItem.id} &bull; File: <code>{lastSavedItem.outputFile}</code>
              </span>
            </div>
            {lastSavedItem.sha256 && (
              <div className="flex items-center gap-1 font-mono text-[10px] text-emerald-300/80">
                <Hash className="w-3 h-3" />
                <span>SHA-256: {lastSavedItem.sha256.substring(0, 16)}...</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Live Event Stream Terminal Console */}
      <div className="panel" style={{ borderColor: 'var(--surface-border)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-indigo-400" />
            <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
              Live Execution Event Stream (Chronological Logs)
            </h3>
          </div>
          <span className="text-[11px] text-[var(--text-secondary)]">
            {logs.length} logged events
          </span>
        </div>

        <div className="p-4 rounded-xl font-mono text-[11px] leading-relaxed overflow-y-auto max-h-80 space-y-1.5 select-text bg-black/40 border border-white/10">
          {logs.length > 0 ? (
            logs.map((log) => {
              const isSuccess = log.severity === 'success';
              const isWarn = log.severity === 'warn';
              const isError = log.severity === 'error';

              return (
                <div key={log.id} className="flex items-start gap-2">
                  <span className="text-[var(--text-secondary)] shrink-0 opacity-60">
                    [{new Date(log.timestamp).toLocaleTimeString()}]
                  </span>
                  <span
                    className={`font-bold shrink-0 ${
                      isSuccess
                        ? 'text-emerald-400'
                        : isWarn
                        ? 'text-amber-400'
                        : isError
                        ? 'text-rose-400'
                        : 'text-indigo-400'
                    }`}
                  >
                    [{log.type}]
                  </span>
                  {log.promptId && <span className="text-sky-300 font-bold shrink-0">[{log.promptId}]</span>}
                  <span style={{ color: isSuccess ? '#86efac' : isError ? '#fca5a5' : '#e2e8f0' }}>
                    {log.message}
                  </span>
                </div>
              );
            })
          ) : (
            <div className="text-[var(--text-secondary)] italic py-8 text-center">
              Event stream ready. Start the queue to observe visible browser actions, verification, and file hashing.
            </div>
          )}
        </div>
      </div>

      {/* Regenerate All Confirmation Modal */}
      {showRegenConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="modal-box" style={{ borderColor: 'var(--surface-border)' }}>
            <div className="flex items-center gap-3 text-amber-400">
              <RefreshCw className="w-5 h-5 shrink-0" />
              <h3 className="text-base font-bold text-white">Regenerate All Images?</h3>
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {existingImageCount > 0 ? (
                <>
                  Regenerating will create a new isolated run and process all {totalPrompts} prompts from the beginning.
                  {existingImageCount} previously generated image(s) will remain preserved in their existing run directories.
                  New outputs will be written alongside existing ones.
                </>
              ) : (
                <>
                  Regenerating will create a new isolated run and process all {totalPrompts} prompts from the beginning.
                  No previously generated images exist yet.
                </>
              )}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowRegenConfirm(false)}
                className="px-3.5 py-2 rounded-lg text-xs font-medium hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRegenerate}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white"
              >
                Yes, Regenerate All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
