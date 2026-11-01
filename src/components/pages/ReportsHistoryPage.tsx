import React, { useState } from 'react';
import {
  FileText,
  ExternalLink,
  Download,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Trash2,
  Play,
  RotateCcw,
  Hash,
  ShieldCheck,
  Search,
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
      <div className="panel">
        <div className="heading">
          <div className="row between">
            <div>
              <div className="row">
                <FileText className="icon" />
                <h2>Run Reports & Execution Manifest</h2>
              </div>
              <p className="muted">Self-contained offline HTML reports, SHA-256 artifact verification, and run isolation records.</p>
            </div>
            <div className="actions">
              <button
                onClick={() => refreshState()}
                className="btn"
                title="Refresh Manifest"
                aria-label="Refresh Manifest"
              >
                <RotateCcw className="icon" />
                <span>Refresh Manifest</span>
              </button>

              {manifest && (
                <>
                  <button
                    onClick={() => setShowEmbeddedModal(true)}
                    className="btn primary"
                  >
                    <ExternalLink className="icon" />
                    <span>Preview HTML Report</span>
                  </button>

                  <a className="btn" href="/api/queue/report" target="_blank" rel="noopener noreferrer">
                    <Download className="icon" />
                    <span>Open Offline HTML</span>
                  </a>
                </>
              )}

              <button
                onClick={() => { setActivePage('monitor'); startRun(); }}
                className="btn green"
              >
                <Play className="icon" />
                <span>Resume Incomplete</span>
              </button>

              <button
                onClick={() => { setActivePage('monitor'); regenerateAll(); }}
                className="btn"
              >
                <RefreshCw className="icon" />
                <span>Regenerate All</span>
              </button>
            </div>
          </div>
        </div>

        {deleteResult && (
          <div className="notice green">
            <span>{deleteResult}</span>
          </div>
        )}

        {/* Historical Runs List Pill Selector */}
        {runsList.length > 0 && (
          <div className="space-y-4">
            <div className="row">
              <span className="muted">Historical Runs in Project:</span>
              <span className="muted">{runsList.length} run(s) recorded</span>
            </div>
            <div className="row between" style={{ gap: 8 }}>
              {runsList.map((r) => {
                const isActiveRun = manifest?.runId === r.runId;
                return (
                  <div key={r.runId} className={`actions ${isActiveRun ? 'bg-indigo-500/20 text-indigo-300 font-semibold border border-indigo-500' : 'muted border border-white/5'}`}>
                    <span className="mono">{r.runId}</span>
                    <span className="text-[10px] opacity-75">({r.savedCount}/{r.totalPrompts} saved)</span>
                    <button
                      onClick={() => setRunToDelete(r.runId)}
                      className="btn quiet icon-only"
                      title="Delete run artifacts"
                      aria-label={`Delete run ${r.runId}`}
                    >
                      <Trash2 className="icon" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Manifest Meta Overview */}
        {manifest ? (
          <div className="three">
            <div className="value-block">
              <small className="muted">Active Run ID</small>
              <div className="font-mono font-bold indigo-text">{manifest.runId}</div>
            </div>
            <div className="value-block">
              <small className="muted">Saved & Verified</small>
              <div className="font-bold green-text">{manifest.savedCount} / {manifest.totalPrompts}</div>
            </div>
            <div className="value-block">
              <small className="muted">Needs Review</small>
              <div className="font-bold amber-text">{manifest.reviewCount}</div>
            </div>
            <div className="value-block">
              <small className="muted">Wall-Clock Duration</small>
              <div className="font-bold">{formatDuration(manifest.wallClockDurationMs)}</div>
            </div>
            <div className="value-block">
              <small className="muted">Active Time</small>
              <div className="font-bold">{formatDuration(manifest.activeProcessingDurationMs)}</div>
            </div>
            <div className="value-block">
              <small className="muted">Pauses</small>
              <div className="font-bold">{manifest.pauseCount}</div>
            </div>
          </div>
        ) : (
          <div className="notice indigo">
            <span>No manifest generated yet. Start the queue in Run Monitor to generate the initial execution manifest and HTML run report.</span>
          </div>
        )}
      </div>

      {/* Manifest Items Table */}
      {manifest && (
        <div className="panel">
          <div className="heading">
            <div className="row between">
              <div>
                <h3 className="section-title">Per-Prompt Execution Manifest & Verification Hashes</h3>
              </div>
              <div className="actions">
                <label className="search">
                  <svg aria-hidden="true" className="icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" viewBox="0 0 24 24">
                    <path d="M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13M16 16l5 5" />
                  </svg>
                  <input
                    type="text"
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    className="search-input"
                    placeholder="Filter manifest items..."
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="table-wrap">
            <table className="report-table">
              <thead>
                <tr>
                  <th className="w-12 text-center">#</th>
                  <th className="w-24">ID</th>
                  <th>Prompt</th>
                  <th className="w-24">Status</th>
                  <th className="w-28">Artifact Type</th>
                  <th className="w-32">SHA-256</th>
                  <th className="w-24">Duration</th>
                  <th className="w-40">Saved File</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const isSaved = item.status === 'SAVED';
                  const isReview = item.status === 'NEEDS_REVIEW';
                  const isFailed = item.status === 'FAILED';
                  const isGenuine = item.artifactType === 'genuine_image';
                  return (
                    <tr key={item.id}>
                      <td className="mono">{item.id.replace('IMG-', '')}</td>
                      <td className="mono indigo-text">{item.id}</td>
                      <td>
                        <div className="excerpt">{item.prompt}</div>
                      </td>
                      <td>
                        <span className={`badge ${isSaved ? 'green' : isReview ? 'amber' : isFailed ? 'red' : 'gray'}`}>{item.status}</span>
                      </td>
                      <td>
                        <span className={`badge ${isGenuine ? 'green' : 'gray'}`}>{isGenuine ? 'Genuine AI' : 'Simulated'}</span>
                      </td>
                      <td className="mono">{item.sha256 ? item.sha256.substring(0, 16) + '…' : '—'}</td>
                      <td className="muted">{item.generationDurationMs ? formatDuration(item.generationDurationMs) : '—'}</td>
                      <td className="path muted">{item.outputFile || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="no-results" id="manifest-no-results" hidden={filteredItems.length > 0}>
            No matching rows. Clear the search to restore the complete source snapshot.
          </div>
        </div>
      )}

      {/* Embedded Modal */}
      {showEmbeddedModal && (
        <div className="modal" style={{ display: 'flex' }} role="dialog" aria-modal="true">
          <div className="modal-box wide">
            <div className="modal-heading">
              <h3>Self-Contained Run Report Preview (run-report.html)</h3>
              <div className="actions">
                <a className="btn" href="/api/queue/report" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="icon" />
                  <span>Open in Full Tab</span>
                </a>
                <button onClick={() => setShowEmbeddedModal(false)} className="btn">
                  Close
                </button>
              </div>
            </div>
            <div className="stack" style={{ maxHeight: '63vh', overflow: 'auto' }}>
              <iframe
                src="/api/queue/report"
                title="Generated HTML Run Report"
                className="w-full h-full border-0"
              />
            </div>
            <div className="modal-footer">
              <a className="btn" href="#reports">
                Cancel
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Delete Run Confirmation Modal */}
      {runToDelete && (
        <div className="modal" style={{ display: 'flex' }} role="dialog" aria-modal="true">
          <div className="modal-box">
            <div className="modal-heading">
              <h3>Delete Run Artifacts?</h3>
              <button
                onClick={() => setRunToDelete(null)}
                className="btn quiet icon-only"
                aria-label="Close dialog"
              >
                <XCircle className="icon" />
              </button>
            </div>
            <div className="prototype-note">
              Run <code>{runToDelete}</code>
              <div className="card path" style={{ marginTop: 16 }}>
                • Output images in <code>runs/{runToDelete}/</code> will be permanently removed.<br />
                • The selected execution manifest and run report would be removed.
              </div>
              <div className="notice red">
                <svg aria-hidden="true" className="icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.65" viewBox="0 0 24 24">
                  <path d="M12 8v5 M12 17h.01 M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18" />
                </svg>
                <div>This destructive action is disabled in the offline visual prototype.</div>
              </div>
            </div>
            <div className="modal-footer">
              <a className="btn" href="#reports" onClick={() => setRunToDelete(null)}>
                Cancel
              </a>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDeleteRun}
                className="btn danger"
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

export default ReportsHistoryPage;
