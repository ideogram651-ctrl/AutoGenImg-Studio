import React, { useState } from 'react';
import {
  FileText,
  ExternalLink,
  Download,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  PauseCircle,
  Layers,
  Search,
  RefreshCw,
  Trash2,
  Play,
  RotateCcw,
  Hash,
  ShieldCheck,
} from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { formatDuration } from '../../server/reportGenerator.ts';

export function ReportsHistoryPage() {
  const {
    currentProject,
    manifest,
    runsList,
    refreshState,
    startRun,
    regenerateAll,
    deleteRunArtifacts,
    setActivePage,
  } = useApp();

  const [showEmbeddedModal, setShowEmbeddedModal] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [runToDelete, setRunToDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteResult, setDeleteResult] = useState<string | null>(null);

  const items = manifest?.items || [];
  const filteredItems = items.filter((it) => {
    const q = searchFilter.toLowerCase();
    return it.id.toLowerCase().includes(q) || it.prompt.toLowerCase().includes(q);
  });

  const handleDeleteRun = async () => {
    if (!runToDelete) return;
    setDeleting(true);
    setDeleteResult(null);

    const res = await deleteRunArtifacts(runToDelete);
    setDeleting(false);

    if (res.success) {
      setDeleteResult(`Run "${runToDelete}" deleted (${res.deletedFilesCount ?? 0} files removed). Project settings and bundle preserved.`);
      setRunToDelete(null);
      await refreshState();
    } else {
      setDeleteResult(res.error || 'Failed to delete run artifacts.');
    }
  };

  return (
    <div className="stack">
      {/* Header */}
      <div className="panel" style={{ borderColor: 'var(--surface-border)' }}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-5 h-5 text-indigo-400" />
              <h2 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                Run Reports & Execution Manifest
              </h2>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Self-contained offline HTML reports, SHA-256 artifact verification, and run isolation records.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => refreshState()}
              className="p-2 rounded-lg text-xs glass-card hover:bg-white/10"
              title="Refresh Manifest"
              aria-label="Refresh Manifest"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            {manifest && (
              <>
                <button
                  onClick={() => setShowEmbeddedModal(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition-all"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Preview HTML Report</span>
                </button>

                <a
                  href="/api/queue/report"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold hover:bg-white/10 transition-colors"
                  style={{
                    backgroundColor: 'var(--surface-elevated)',
                    border: '1px solid var(--surface-border)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Open Offline HTML</span>
                </a>
              </>
            )}

            <button
              onClick={() => {
                setActivePage('monitor');
                startRun();
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-all"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Resume Incomplete</span>
            </button>

            <button
              onClick={() => {
                setActivePage('monitor');
                regenerateAll();
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/15 transition-colors text-white"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Regenerate All</span>
            </button>
          </div>
        </div>

        {deleteResult && (
          <div className="mt-4 p-3 rounded-lg text-xs bg-indigo-500/10 border border-indigo-500/20 text-indigo-300">
            {deleteResult}
          </div>
        )}

        {/* Historical Runs List Pill Selector */}
        {runsList.length > 0 && (
          <div className="mt-5 pt-5 border-t space-y-2" style={{ borderColor: 'var(--surface-border)' }}>
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[var(--text-secondary)]">Historical Runs in Project:</span>
              <span className="text-[11px] text-[var(--text-secondary)]">{runsList.length} run(s) recorded</span>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {runsList.map((r) => {
                const isActiveRun = manifest?.runId === r.runId;
                return (
                  <div
                    key={r.runId}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border ${
                      isActiveRun
                        ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300 font-semibold'
                        : 'bg-black/20 border-white/5 text-[var(--text-secondary)]'
                    }`}
                  >
                    <span className="font-mono">{r.runId}</span>
                    <span className="text-[10px] opacity-75">
                      ({r.savedCount}/{r.totalPrompts} saved)
                    </span>
                    <button
                      onClick={() => setRunToDelete(r.runId)}
                      className="text-rose-400 hover:text-rose-300 p-0.5 rounded"
                      title="Delete run artifacts"
                      aria-label={`Delete run ${r.runId}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Manifest Meta Overview */}
        {manifest ? (
          <div className="mt-6 pt-6 border-t space-y-4" style={{ borderColor: 'var(--surface-border)' }}>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
              <div className="p-3 rounded-lg glass-card">
                <span className="text-[11px] text-[var(--text-secondary)] block uppercase">Active Run ID</span>
                <span className="font-mono font-bold text-indigo-400 truncate block mt-0.5">
                  {manifest.runId}
                </span>
              </div>

              <div className="p-3 rounded-lg glass-card">
                <span className="text-[11px] text-[var(--text-secondary)] block uppercase">Saved & Verified</span>
                <span className="font-bold text-emerald-400 text-base block mt-0.5">
                  {manifest.savedCount} / {manifest.totalPrompts}
                </span>
              </div>

              <div className="p-3 rounded-lg glass-card">
                <span className="text-[11px] text-[var(--text-secondary)] block uppercase">Needs Review</span>
                <span className="font-bold text-amber-400 text-base block mt-0.5">
                  {manifest.reviewCount}
                </span>
              </div>

              <div className="p-3 rounded-lg glass-card">
                <span className="text-[11px] text-[var(--text-secondary)] block uppercase">Wall-Clock Duration</span>
                <span className="font-bold text-base block mt-0.5" style={{ color: 'var(--text-primary)' }}>
                  {formatDuration(manifest.wallClockDurationMs)}
                </span>
              </div>

              <div className="p-3 rounded-lg glass-card">
                <span className="text-[11px] text-[var(--text-secondary)] block uppercase">Active Time</span>
                <span className="font-bold text-base block mt-0.5" style={{ color: 'var(--text-primary)' }}>
                  {formatDuration(manifest.activeProcessingDurationMs)}
                </span>
              </div>

              <div className="p-3 rounded-lg glass-card">
                <span className="text-[11px] text-[var(--text-secondary)] block uppercase">Pauses</span>
                <span className="font-bold text-base block mt-0.5" style={{ color: 'var(--text-primary)' }}>
                  {manifest.pauseCount}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 pt-4 border-t text-xs text-[var(--text-secondary)]" style={{ borderColor: 'var(--surface-border)' }}>
            No manifest generated yet. Start the queue in Run Monitor to generate the initial execution manifest and HTML run report.
          </div>
        )}
      </div>

      {/* Manifest Items Table */}
      {manifest && (
        <div className="panel space-y-4" style={{ borderColor: 'var(--surface-border)' }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
              Per-Prompt Execution Manifest & Verification Hashes
            </h3>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[var(--text-secondary)] absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Filter manifest items..."
                className="pl-8 pr-3 py-1.5 rounded-lg text-xs glass-card outline-none w-56"
                style={{ color: 'var(--text-primary)' }}
              />
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'var(--surface-border)' }}>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-black/10 dark:bg-black/30 text-[var(--text-primary)] font-semibold border-b" style={{ borderColor: 'var(--surface-border)' }}>
                  <th className="p-2.5 w-12 text-center font-bold">#</th>
                  <th className="p-2.5 w-24 font-bold">ID</th>
                  <th className="p-2.5 font-bold">Prompt</th>
                  <th className="p-2.5 w-24 font-bold">Status</th>
                  <th className="p-2.5 w-28 font-bold">Artifact Type</th>
                  <th className="p-2.5 w-32 font-bold">SHA-256</th>
                  <th className="p-2.5 w-24 font-bold">Duration</th>
                  <th className="p-2.5 w-40 font-bold">Saved File</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const isSaved = item.status === 'SAVED';
                  const isReview = item.status === 'NEEDS_REVIEW';
                  const isFailed = item.status === 'FAILED';
                  const isGenuine = item.artifactType === 'genuine_image';

                  return (
                    <tr
                      key={item.id}
                      className="border-b hover:bg-white/[0.02] transition-colors"
                      style={{ borderColor: 'rgba(255, 255, 255, 0.04)' }}
                    >
                      <td className="p-2.5 text-center text-[var(--text-secondary)]">{item.sequence}</td>
                      <td className="p-2.5 font-mono font-bold text-indigo-400">{item.id}</td>
                      <td className="p-2.5 max-w-xs truncate" style={{ color: 'var(--text-primary)' }}>
                        {item.prompt}
                      </td>
                      <td className="p-2.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase inline-block ${
                            isSaved
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : isReview
                              ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                              : isFailed
                              ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                              : 'bg-white/5 text-[var(--text-secondary)]'
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="p-2.5">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold ${
                            isGenuine
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : item.artifactType
                              ? 'bg-amber-500/10 text-amber-400'
                              : 'text-[var(--text-secondary)]'
                          }`}
                        >
                          {item.artifactType === 'genuine_image' ? 'Genuine AI' : item.artifactType === 'simulation_artifact' ? 'Simulated' : '—'}
                        </span>
                      </td>
                      <td className="p-2.5 font-mono text-[10px] text-indigo-300/80">
                        {item.sha256 ? `${item.sha256.substring(0, 10)}...` : '—'}
                      </td>
                      <td className="p-2.5 font-mono text-[var(--text-secondary)]">
                        {formatDuration(item.totalDurationMs)}
                      </td>
                      <td className="p-2.5 font-mono text-[11px] text-sky-400 truncate max-w-xs">
                        {item.outputFile ? item.outputFile.split('/').pop() : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Embedded HTML Report Modal */}
      {showEmbeddedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm">
          <div className="w-full h-full max-w-6xl rounded-2xl glass-panel flex flex-col overflow-hidden border" style={{ borderColor: 'var(--surface-border)' }}>
            <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--surface-border)' }}>
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-400" />
                <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                  Self-Contained Run Report Preview (run-report.html)
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href="/api/queue/report"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1 rounded-md text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white inline-flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open in Full Tab</span>
                </a>
                <button
                  onClick={() => setShowEmbeddedModal(false)}
                  className="px-3 py-1 rounded-md text-xs font-medium hover:bg-white/10"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="flex-1 bg-black">
              <iframe
                src="/api/queue/report"
                title="Generated HTML Run Report"
                className="w-full h-full border-0"
              />
            </div>
          </div>
        </div>
      )}

      {/* Delete Run Confirmation Modal */}
      {runToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="modal-box" style={{ borderColor: 'var(--surface-border)' }}>
            <div className="flex items-center gap-3 text-rose-400">
              <Trash2 className="w-5 h-5 shrink-0" />
              <h3 className="text-base font-bold text-white">Delete Run Artifacts?</h3>
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Are you sure you want to permanently delete run artifacts for <strong className="text-white font-mono">{runToDelete}</strong>?
            </p>
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 space-y-1">
              <div>&bull; Output images in <code>runs/{runToDelete}/</code> will be permanently removed.</div>
              <div>&bull; Run-specific report files will be deleted.</div>
              <div className="text-emerald-400 font-semibold">&bull; Project configuration, prompt bundle, and reference assets will be safely preserved.</div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setRunToDelete(null)}
                className="px-3.5 py-2 rounded-lg text-xs font-medium hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDeleteRun}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Permanently Delete Run'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
