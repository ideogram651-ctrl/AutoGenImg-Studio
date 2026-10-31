import React, { useState, useRef } from 'react';
import {
  FolderPlus,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Layers,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  Download,
  Copy,
  Trash2,
  Upload,
  FolderOpen,
  Check,
} from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { ProjectSummary } from '../../types/index.ts';
import { ProjectThumbnail } from '../ProjectThumbnail.tsx';

export function DashboardPage({ onOpenNewProjectModal }: { onOpenNewProjectModal: () => void }) {
  const {
    currentProject,
    currentBundle,
    queueState,
    manifest,
    logs,
    projectsList,
    openProject,
    duplicateProject,
    deleteProject,
    exportProject,
    importProject,
    saveStatus,
    setActivePage,
    startRun,
    resumeRun,
  } = useApp();

  const [projectToDelete, setProjectToDelete] = useState<ProjectSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importFeedback, setImportFeedback] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalPrompts = manifest?.totalPrompts || currentBundle?.prompts.length || queueState.totalPrompts || 0;
  const savedCount = manifest?.savedCount || queueState.savedCount || 0;
  const reviewCount = manifest?.reviewCount || queueState.reviewCount || 0;
  const failedCount = manifest?.failedCount || queueState.failedCount || 0;
  const status = queueState.overallStatus;
  const canResume = status === 'PAUSED' || status === 'PAUSED_PROVIDER_LIMIT';

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportLoading(true);
    setImportFeedback(null);

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = (reader.result as string).split(',')[1];
        const res = await importProject(base64);
        setImportLoading(false);
        if (res.success) {
          setImportFeedback('Project archive imported and activated successfully!');
          setTimeout(() => setImportFeedback(null), 4000);
        } else {
          setImportFeedback(`Import error: ${res.error}`);
        }
      } catch (err: any) {
        setImportLoading(false);
        setImportFeedback(`Failed to read ZIP archive: ${err.message}`);
      }
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const confirmDelete = async () => {
    if (!projectToDelete) return;
    setIsDeleting(true);
    await deleteProject(projectToDelete.id);
    setIsDeleting(false);
    setProjectToDelete(null);
  };

  return (
    <div className="space-y-6">
      {/* Hero Welcome Banner */}
      <div
        className="p-6 rounded-xl glass-panel relative overflow-hidden"
        style={{ borderColor: 'var(--surface-border)' }}
      >
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 mb-3">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Verifiable Local-First Architecture &bull; Visible Browser Automation</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight mb-2" style={{ color: 'var(--text-primary)' }}>
              Orchestrate AI Video Visuals from Script to Saved Files
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Prepare structured prompt bundles, map multi-category references (character, style, environment), execute sequential browser-driven generation, verify downloads into ID-based files, and review exceptions without blind regeneration.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={onOpenNewProjectModal}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition-all"
            >
              <FolderPlus className="w-4 h-4" />
              <span>Create Project</span>
            </button>

            <label className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg text-xs font-semibold hover:bg-white/10 cursor-pointer transition-colors glass-card">
              <Upload className="w-4 h-4 text-sky-400" />
              <span>{importLoading ? 'Importing...' : 'Import Project (.ZIP)'}</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                onChange={handleImportFile}
                className="hidden"
                disabled={importLoading}
              />
            </label>

            {currentProject && (
              <>
                {canResume ? (
                  <button
                    onClick={() => {
                      resumeRun();
                      setActivePage('monitor');
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white shadow-md transition-all"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Resume Queue ({queueState.pauseReason || 'Paused'})</span>
                  </button>
                ) : status === 'RUNNING' ? (
                  <button
                    onClick={() => setActivePage('monitor')}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition-all"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>View Running Queue ({queueState.percentage}%)</span>
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      setActivePage('monitor');
                      startRun();
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition-all"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>Start Run ({totalPrompts} Prompts)</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {saveStatus.kind !== 'idle' && currentProject && (
        <div
          className={`p-3 rounded-lg text-xs font-medium flex items-center justify-between gap-2 ${
            saveStatus.kind === 'saving'
              ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
              : saveStatus.kind === 'saved'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
          }`}
        >
          <span>
            {saveStatus.kind === 'saving' ? 'Saving…' : saveStatus.kind === 'saved' ? 'Saved' : 'Save failed'}
          </span>
          {saveStatus.message && <span className="truncate max-w-xs">{saveStatus.message}</span>}
        </div>
      )}

      {importFeedback && (
        <div
          className={`p-3.5 rounded-lg text-xs font-medium flex items-center justify-between ${
            importFeedback.includes('error') || importFeedback.includes('Failed')
              ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
              : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
          }`}
        >
          <span>{importFeedback}</span>
          <button onClick={() => setImportFeedback(null)} className="text-xs opacity-70 hover:opacity-100">
            Dismiss
          </button>
        </div>
      )}

      {/* 5 Overview Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        <div className="p-4 rounded-xl glass-card">
          <div className="flex items-center justify-between text-[var(--text-secondary)] mb-2">
            <span className="text-xs uppercase tracking-wider font-semibold">Total Prompts</span>
            <Layers className="w-4 h-4" />
          </div>
          <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {totalPrompts}
          </div>
          <div className="text-[11px] text-[var(--text-secondary)] mt-1">
            {currentProject ? `${currentProject.imageIntervalSeconds}s interval` : 'No active project'}
          </div>
        </div>

        <div className="p-4 rounded-xl glass-card">
          <div className="flex items-center justify-between text-[var(--text-secondary)] mb-2">
            <span className="text-xs uppercase tracking-wider font-semibold">Saved Images</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400">
            {savedCount}
          </div>
          <div className="text-[11px] text-[var(--text-secondary)] mt-1">
            Verified on disk
          </div>
        </div>

        <div className="p-4 rounded-xl glass-card">
          <div className="flex items-center justify-between text-[var(--text-secondary)] mb-2">
            <span className="text-xs uppercase tracking-wider font-semibold">Needs Review</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-400">
            {reviewCount}
          </div>
          <div className="text-[11px] text-[var(--text-secondary)] mt-1">
            No blind regeneration
          </div>
        </div>

        <div className="p-4 rounded-xl glass-card">
          <div className="flex items-center justify-between text-[var(--text-secondary)] mb-2">
            <span className="text-xs uppercase tracking-wider font-semibold">Failed Items</span>
            <XCircle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-rose-400">
            {failedCount}
          </div>
          <div className="text-[11px] text-[var(--text-secondary)] mt-1">
            Definite errors logged
          </div>
        </div>

        <div className="p-4 rounded-xl glass-card col-span-2 md:col-span-1">
          <div className="flex items-center justify-between text-[var(--text-secondary)] mb-2">
            <span className="text-xs uppercase tracking-wider font-semibold">Queue Status</span>
            <Clock className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-lg font-bold truncate" style={{ color: 'var(--text-primary)' }}>
            {status}
          </div>
          <div className="text-[11px] text-[var(--text-secondary)] mt-1 truncate">
            {queueState.percentage}% processed
          </div>
        </div>
      </div>

      {/* Persistent Project Library */}
      <div className="p-6 rounded-xl glass-panel space-y-4" style={{ borderColor: 'var(--surface-border)' }}>
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b" style={{ borderColor: 'var(--surface-border)' }}>
          <div>
            <h3 className="font-bold text-base tracking-tight" style={{ color: 'var(--text-primary)' }}>
              Project Library
            </h3>
            <p className="text-xs text-[var(--text-secondary)]">
              Saved workflow templates with isolated run outputs and portable archive actions
            </p>
          </div>
          <span className="text-xs text-[var(--text-secondary)]">
            {projectsList.length} saved project{projectsList.length === 1 ? '' : 's'}
          </span>
        </div>

        {projectsList.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {projectsList.map((proj) => {
              const isActive = currentProject?.id === proj.id;
              return (
                <div
                  key={proj.id}
                  className={`p-4 rounded-xl border transition-all flex flex-col justify-between overflow-hidden ${
                    isActive
                      ? 'border-indigo-500 bg-indigo-500/10 shadow-sm'
                      : 'border-white/10 hover:border-white/20'
                  }`}
                  style={{ backgroundColor: isActive ? undefined : 'var(--surface-elevated)' }}
                >
                  <div className="h-32 w-full overflow-hidden">
                    <ProjectThumbnail projectId={proj.id} className="w-full h-full" />
                  </div>

                  <div className="p-4 space-y-2 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h4 className="font-bold text-xs" style={{ color: 'var(--text-primary)' }}>
                            {proj.name}
                          </h4>
                          {isActive && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300">
                              Active
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-[var(--text-secondary)] block mt-0.5">
                          Updated {new Date(proj.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-white/5 text-[var(--text-secondary)] border border-white/10">
                        {proj.provider}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-2 text-[11px] text-[var(--text-secondary)] border-t border-white/5">
                      <div>
                        <span className="block text-[10px] uppercase">Prompts</span>
                        <strong className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {proj.promptCount}
                        </strong>
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase">Refs</span>
                        <strong className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {proj.referenceCount}
                        </strong>
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase">Last Run</span>
                        <strong
                          className={`text-[10px] font-bold ${
                            proj.lastRunStatus === 'COMPLETED'
                              ? 'text-emerald-400'
                              : proj.lastRunStatus === 'PAUSED'
                              ? 'text-amber-400'
                              : proj.lastRunStatus === 'RUNNING'
                              ? 'text-sky-400'
                              : 'text-[var(--text-secondary)]'
                          }`}
                        >
                          {proj.lastRunStatus || 'None'}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Project Actions */}
                  <div className="flex flex-wrap items-center justify-between gap-1.5 pt-3 mt-3 border-t border-white/5">
                    <div className="flex items-center gap-1">
                      {!isActive ? (
                        <button
                          onClick={() => openProject(proj.id)}
                          className="px-2.5 py-1 rounded text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-sm"
                        >
                          Open
                        </button>
                      ) : (
                        <span className="px-2.5 py-1 rounded text-xs font-medium text-emerald-400 flex items-center gap-1">
                          <Check className="w-3 h-3" />
                          <span>Loaded</span>
                        </span>
                      )}

                      <button
                        onClick={() => duplicateProject(proj.id)}
                        className="p-1.5 rounded hover:bg-white/10 text-[var(--text-secondary)] hover:text-white transition-colors"
                        title="Duplicate as Template"
                        aria-label="Duplicate as Template"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => exportProject(proj.id)}
                        className="p-1.5 rounded hover:bg-white/10 text-[var(--text-secondary)] hover:text-white transition-colors"
                        title="Download Project (ZIP)"
                        aria-label="Download Project (ZIP)"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <button
                      onClick={() => setProjectToDelete(proj)}
                      className="p-1.5 rounded hover:bg-rose-500/10 text-[var(--text-secondary)] hover:text-rose-400 transition-colors"
                      title="Delete Project"
                      aria-label="Delete Project"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-10 text-xs text-[var(--text-secondary)]">
            <FolderOpen className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>No Saved Projects Yet</p>
            <p className="mt-1">Create a new project or import a portable project .ZIP archive.</p>
          </div>
        )}
      </div>

      {/* Two Column Layout: Current Project Details & Recent Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Active Project Details & Steps */}
        <div className="lg:col-span-2 space-y-4">
          <div className="p-5 rounded-xl glass-panel" style={{ borderColor: 'var(--surface-border)' }}>
            <div className="flex items-center justify-between mb-4 pb-3 border-b" style={{ borderColor: 'var(--surface-border)' }}>
              <div>
                <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                  Active Project Status
                </h3>
                <p className="text-xs text-[var(--text-secondary)]">
                  Configured workflow details and execution target
                </p>
              </div>
              {currentProject && (
                <button
                  onClick={() => setActivePage('settings_project')}
                  className="text-xs font-medium text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                >
                  <span>Edit Settings</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {currentProject ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-lg bg-black/20 border border-white/5">
                    <span className="text-[var(--text-secondary)] block text-[11px] uppercase">Project Name</span>
                    <span className="font-semibold text-sm mt-0.5 block" style={{ color: 'var(--text-primary)' }}>
                      {currentProject.name}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-black/20 border border-white/5">
                    <span className="text-[var(--text-secondary)] block text-[11px] uppercase">Execution Mode / Provider</span>
                    <span className="font-semibold text-sm mt-0.5 block capitalize text-indigo-400">
                      {currentProject.provider === 'gemini' ? 'Google Gemini' : 'ChatGPT via Chrome'}
                    </span>
                  </div>
                  <div className="p-3 rounded-lg bg-black/20 border border-white/5 sm:col-span-2">
                    <span className="text-[var(--text-secondary)] block text-[11px] uppercase">Output Directory</span>
                    <code className="text-xs text-sky-400 font-mono block mt-0.5 break-all">
                      {currentProject.outputPath}
                    </code>
                  </div>
                </div>

                {/* Progress bar */}
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-medium text-[var(--text-secondary)]">Queue Progress</span>
                    <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {queueState.processedCount} of {totalPrompts} prompts ({queueState.percentage}%)
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full transition-all duration-300 bg-gradient-to-r from-indigo-500 to-emerald-400"
                      style={{ width: `${queueState.percentage}%` }}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    onClick={() => setActivePage('monitor')}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/15 transition-colors"
                  >
                    Open Run Monitor
                  </button>
                  <button
                    onClick={() => setActivePage('review')}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/15 transition-colors flex items-center gap-1.5"
                  >
                    <span>Review Center</span>
                    {reviewCount > 0 && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] bg-amber-500/20 text-amber-400 font-bold">
                        {reviewCount}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setActivePage('reports')}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/15 transition-colors"
                  >
                    View HTML Reports
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-10 px-4">
                <Layers className="w-10 h-10 text-[var(--text-secondary)] mx-auto mb-3 opacity-40" />
                <h4 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                  No Active Project Configured
                </h4>
                <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto mb-4">
                  Select an existing project from the Project Library above or create a new project to get started.
                </p>
                <button
                  onClick={onOpenNewProjectModal}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm inline-flex items-center gap-2"
                >
                  <FolderPlus className="w-4 h-4" />
                  <span>Create New Project</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Live Event Stream Feed */}
        <div className="p-5 rounded-xl glass-panel flex flex-col h-[420px]" style={{ borderColor: 'var(--surface-border)' }}>
          <div className="flex items-center justify-between mb-3 pb-2 border-b" style={{ borderColor: 'var(--surface-border)' }}>
            <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
              Recent Activity Feed
            </h3>
            <span className="text-[11px] text-[var(--text-secondary)]">Live Events</span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1 text-xs">
            {logs.length > 0 ? (
              logs.slice(-15).reverse().map((log) => {
                const isSuccess = log.severity === 'success';
                const isWarn = log.severity === 'warn';
                const isError = log.severity === 'error';

                return (
                  <div
                    key={log.id}
                    className="p-2.5 rounded-lg border text-xs"
                    style={{
                      backgroundColor: isSuccess
                        ? 'rgba(34, 197, 94, 0.08)'
                        : isWarn
                        ? 'rgba(245, 158, 11, 0.08)'
                        : isError
                        ? 'rgba(239, 68, 68, 0.08)'
                        : 'var(--surface-elevated)',
                      borderColor: 'var(--surface-border)',
                    }}
                  >
                    <div className="flex items-center justify-between text-[10px] text-[var(--text-secondary)] mb-1">
                      <span className="font-mono">{log.type}</span>
                      <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div className="font-medium text-xs leading-snug" style={{ color: 'var(--text-primary)' }}>
                      {log.promptId && <strong className="text-indigo-400 mr-1">[{log.promptId}]</strong>}
                      {log.message}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-16 text-xs text-[var(--text-secondary)]">
                No activity logged yet. Start a run or load a bundle to see live event entries.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {projectToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md p-6 rounded-2xl glass-panel space-y-4 border border-rose-500/30">
            <div className="flex items-center gap-2 text-rose-400">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="text-base font-bold">Permanently Delete Project?</h3>
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Are you sure you want to permanently delete project <strong className="text-white">&quot;{projectToDelete.name}&quot;</strong> and its configuration from disk? This action cannot be undone.
            </p>
            <div className="p-3 rounded-lg bg-black/30 border border-white/5 text-[11px] font-mono text-[var(--text-secondary)]">
              Path: {projectToDelete.outputPath}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setProjectToDelete(null)}
                className="px-4 py-2 rounded-lg text-xs font-medium hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white transition-all shadow-sm disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Delete Project Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
