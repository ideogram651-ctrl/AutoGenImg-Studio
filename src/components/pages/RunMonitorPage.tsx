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
    DETECT: 'Detecting completion indicators and locating downloadable artifact...',
    VERIFY: 'Verifying file integrity and SHA-256 hash...',
    DOWNLOAD: 'Downloading to temporary .part staging path...',
    SAVE: 'Committing verified output to disk...',
    COMMIT: 'Finalizing run manifest and report generation...',
  };

  const lastSavedItem = manifest?.items?.find(
    (i) => i.status === 'SAVED' && i.outputFile
  ) || null;

  const handleConfirmRegenerate = async () => {
    setShowRegenConfirm(false);
    if (existingImageCount > 0) {
      await regenerateAll();
    } else {
      await regenerateAll();
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
      {/* Blocked Auth Banner */}
      {isBlockedAuth && (
        <div className="notice amber">
          <ShieldAlert className="icon" />
          <div>
            <span className="font-semibold">ACTION REQUIRED IN CHROME:</span>
            Please log in or complete verification directly in the automated Chrome browser, then click Resume Queue.
          </div>
        </div>
      )}

      {/* Simulation Warning Banner if in Simulation Mode */}
      {isDemo && (
        <div className="notice amber">
          <AlertTriangle className="icon" />
          <div>
            <span className="font-semibold">SIMULATION MODE ACTIVE:</span> Currently producing local test SVG artifacts. To generate genuine AI images, select ChatGPT or Gemini in Project Settings.
          </div>
        </div>
      )}

      {/* Main Execution Card */}
      <div className="panel">
        <div className="heading">
          <div className="row between">
            <div>
              <div className="row">
                <Activity className="icon" />
                <h2>Active Run Orchestrator</h2>
              </div>
              <div className="space-y-1">
                {currentProject ? (
                  <>
                    <div className="row">
                      <span>Project:</span>
                      <strong className="font-semibold">{currentProject.name}</strong>
                    </div>
                    <div className="row">
                      <span>Run ID:</span>
                      <code className="mono indigo-text">{queueState.runId || manifest?.runId || 'run-pending'}</code>
                    </div>
                    <div className="row">
                      <span>Provider:</span>
                      <strong className="uppercase muted">{currentProject.provider}</strong>
                    </div>
                    <div className="row">
                      <span>Browser:</span>
                      {runtimeStatus?.browserAutomationAvailable ? (
                        <span className="green-text">CDP Active</span>
                      ) : (
                        <span className="muted">Standby</span>
                      )}
                    </div>
                  </>
                ) : (
                  'No project loaded. Go to Dashboard or Project Settings to initialize.'
                )}
              </div>
            </div>

            {/* Run Control Buttons */}
            <div className="actions">
              {!isRunning && !isPaused && (
                <>
                  <button
                    onClick={startRun}
                    disabled={!currentProject || totalPrompts === 0}
                    className="btn green"
                  >
                    <Play className="icon" />
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
                    className="btn indigo-text"
                    title="Create fresh run ID and regenerate all prompts without skipping"
                  >
                    <RefreshCw className="icon" />
                    <span>Regenerate All</span>
                  </button>
                </>
              )}

              {isRunning && (
                <button
                  onClick={() => pauseRun()}
                  className="btn amber"
                >
                  <Pause className="icon" />
                  <span>Pause Queue</span>
                </button>
              )}

              {isPaused && (
                <>
                  <button
                    onClick={resumeRun}
                    className="btn green"
                  >
                    <RotateCcw className="icon" />
                    <span>Resume Queue</span>
                  </button>

                  <button
                    onClick={() => setShowRegenConfirm(true)}
                    className="btn indigo-text"
                  >
                    <RefreshCw className="icon" />
                    <span>Regenerate All</span>
                  </button>
                </>
              )}

              {(isRunning || isPaused) && (
                <button
                  onClick={stopRun}
                  className="btn red"
                >
                  <Square className="icon" />
                  <span>Stop</span>
                </button>
              )}

              <button
                onClick={() => setActivePage('reports')}
                className="btn"
              >
                <FileText className="icon" />
                <span>Run Report</span>
              </button>
            </div>
          </div>
        </div>

        {/* Deterministic State Machine Stepper */}
        <div className="space-y-4">
          <div className="row between">
            <div className="row">
              <span className="muted">Current Item:</span>
              {queueState.currentPromptId ? (
                <code className="mono indigo-text">{queueState.currentPromptId} (Seq #{queueState.currentSequence})</code>
              ) : (
                <span className="muted">Queue idle &bull; Ready</span>
              )}
            </div>
            <div className="row between text-xs">
              <span className="muted">Elapsed:</span>
              <strong className="font-semibold">{formatElapsed(queueState.elapsedMs)}</strong>
              <span className={`badge ${isRunning ? 'green' : isPaused ? 'amber' : 'gray'}`}>
                {queueState.currentStage}
              </span>
            </div>
          </div>

          {/* Stepper Steps */}
          <div className="stages">
            {STAGES.map((s, idx) => {
              const isPast = currentStageIndex > idx;
              const isCurrent = currentStageIndex === idx && (isRunning || isPaused);
              return (
                <div key={s.key} className={`stage ${isCurrent ? 'active' : isPast ? 'completed' : 'pending'}`}>
                  <div className="text-[9px] font-mono uppercase opacity-70">Step {idx + 1}</div>
                  <div className="font-semibold">{s.label}</div>
                </div>
              );
            })}
          </div>

          <p className="muted">
            {stageDescriptions[queueState.currentStage] || 'Processing queue...'}
          </p>

          {/* Progress Bar */}
          <div className="progress">
            <div className="row between">
              <span className="muted">Sequential Verification Progress (Prompt N+1 waits for Prompt N verified)</span>
              <strong>{processedCount} of {totalPrompts} items ({percentage}%)</strong>
            </div>
            <div className="progress-bar">
              <span style={{ width: `${percentage}%` }} />
            </div>
          </div>
        </div>

        {/* 4 Summary Stat Boxes */}
        <div className="stats" style={{ '--columns': 4 }}>
          <div className="stat">
            <div className="statlabel">
              Saved & Verified
              <CheckCircle2 className="icon" />
            </div>
            <strong className="green-text">{savedCount}</strong>
          </div>
          <div className="stat">
            <div className="statlabel">
              Needs Review
              <AlertTriangle className="icon" />
            </div>
            <strong className="amber-text">{reviewCount}</strong>
          </div>
          <div className="stat">
            <div className="statlabel">
              Failures
              <XCircle className="icon" />
            </div>
            <strong className="red-text">{failedCount}</strong>
          </div>
          <div className="stat">
            <div className="statlabel">
              Remaining
              <Clock className="icon" />
            </div>
            <strong className="">{Math.max(0, totalPrompts - processedCount)}</strong>
          </div>
        </div>

        {/* Last Verified Artifact Card */}
        {lastSavedItem && (
          <div className="notice green">
            <CheckCircle2 className="icon" />
            <div>
              <span className="font-semibold">Latest Verified Output:</span>
              {lastSavedItem.id} &bull; File: <code>{lastSavedItem.outputFile}</code>
              {lastSavedItem.sha256 && (
                <div className="flex items-center gap-1 font-mono text-[10px] text-emerald-300/80 mt-1">
                  <Hash className="w-3 h-3" />
                  <span>SHA-256: {lastSavedItem.sha256.substring(0, 16)}…</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Live Event Stream Terminal Console */}
      <div className="panel">
        <div className="heading">
          <div className="row between">
            <div className="row">
              <Terminal className="icon" />
              <h3>Live Execution Event Stream (Chronological Logs)</h3>
            </div>
            <span className="muted">{logs.length} logged events</span>
          </div>
        </div>

        <div className="logs">
          {logs.length > 0 ? (
            logs.map((log) => {
              const isSuccess = log.severity === 'success';
              const isWarn = log.severity === 'warn';
              const isError = log.severity === 'error';

              return (
                <div key={log.id} className={`logline ${isError ? 'error-event' : ''}`}>
                  <span>[</span>
                  <time>{new Date(log.timestamp).toLocaleTimeString()}</time>
                  <span>]</span>
                  <b>{[log.type]}</b>
                  {log.promptId && <span className="mono text-indigo-400">[{log.promptId}]</span>}
                  <span>{log.message}</span>
                </div>
              );
            })
          ) : (
            <div className="muted italic">Event stream ready. Start the queue to observe visible browser actions, verification, and file hashing.</div>
          )}
        </div>
      </div>

      {/* Regenerate All Confirmation Modal */}
      {showRegenConfirm && (
        <div className="modal" style={{ display: 'flex' }} role="dialog" aria-modal="true">
          <div className="modal-box">
            <div className="modal-heading">
              <h3>Regenerate All Images?</h3>
              <button
                onClick={() => setShowRegenConfirm(false)}
                className="btn quiet icon-only"
                aria-label="Close dialog"
              >
                <XCircle className="icon" />
              </button>
            </div>
            <p className="muted">
              {existingImageCount > 0 ? (
                <>
                  Regenerating will create a new isolated run and process all {totalPrompts} prompts from the beginning. {existingImageCount} previously generated image(s) will remain preserved in their existing run directories. New outputs will be written alongside existing ones.
                </>
              ) : (
                <>
                  Regenerating will create a new isolated run and process all {totalPrompts} prompts from the beginning. No previously generated images exist yet.
                </>
              )}
            </p>
            <div className="modal-footer">
              <button onClick={() => setShowRegenConfirm(false)} className="btn">
                Cancel
              </button>
              <button onClick={handleConfirmRegenerate} className="btn primary">
                Yes, Regenerate All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RunMonitorPage;
