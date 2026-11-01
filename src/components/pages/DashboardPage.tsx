import React, { useState, useRef, useCallback } from 'react';
import {
  FolderPlus,
  Play,
  RotateCcw,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { ProjectSummary } from '../../types/index.ts';
import { ProjectThumbnail } from '../ProjectThumbnail.tsx';
import { HeroArt } from '../HeroArt.tsx';
import { ProjectCard } from '../ProjectCard.tsx';

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
    <div className="stack">
      {/* Hero Welcome Banner */}
      <section className="panel hero">
        <div className="hero-copy">
          <span className="studio-eyebrow">THE VISUAL PRODUCTION WORKSPACE</span>
          <h2>Every frame.<br /><em>Under control.</em></h2>
          <p className="hero-original-title">Orchestrate AI video visuals — from script to saved files.</p>
          <p>Shape your prompts. Align your references. Follow every generation through to a verified asset.</p>
          <div className="actions">
            <a
              className="btn primary"
              href="#create-project"
              onClick={(e) => { e.preventDefault(); onOpenNewProjectModal(); }}
            >
              <svg
                aria-hidden="true"
                className="icon"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.65"
                viewBox="0 0 24 24"
              >
                <path d="M3 6h7l2 2h9v12H3z M13 12v5 M10.5 14.5h5" />
              </svg>
              Create Project
            </a>
            <label className="btn">
              <Upload className="icon" />
              <span>{importLoading ? 'Importing...' : 'Import Project (.ZIP)'}</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                onChange={handleImportFile}
                hidden
                disabled={importLoading}
              />
            </label>
            {currentProject && status !== 'RUNNING' && (
              <button
                className="btn green"
                type="button"
                onClick={() => { setActivePage('monitor'); startRun(); }}
              >
                <svg
                  aria-hidden="true"
                  className="icon"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.65"
                  viewBox="0 0 24 24"
                >
                  <path d="M7 4l14 8-14 8z" />
                </svg>
                Start Run ({totalPrompts} Prompts)
              </button>
            )}
          </div>
          <details className="hero-context">
            <summary>How the production chain works</summary>
            <span className="badge">
              ♧ Verifiable Local-First Architecture • Visible Browser Automation
            </span>
            <p>Prepare structured prompt bundles, map multi-category references (character, style, environment), execute sequential browser-driven generation, verify downloads into ID-based files, and review exceptions without blind regeneration.</p>
          </details>
        </div>
        <HeroArt projectId={currentProject?.id ?? null} onViewGallery={() => setActivePage('gallery')} />
      </section>
      {saveStatus.kind !== 'idle' && currentProject && (
        <div
          className="notice"
        >
          <span>
            {saveStatus.kind === 'saving' ? 'Saving…' : saveStatus.kind === 'saved' ? 'Saved' : 'Save failed'}
          </span>
          {saveStatus.message && <span className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px', display: 'block' }}>{saveStatus.message}</span>}
        </div>
      )}

      {importFeedback && (
        <div
          className="notice"
        >
          <span>{importFeedback}</span>
          <button onClick={() => setImportFeedback(null)} className="btn quiet icon-only" style={{ fontSize: '10px', opacity: 0.7 }}>
            Dismiss
          </button>
        </div>
      )}

      {/* 5 Overview Metric Cards */}
      {/* Stats */}
      <div className="stats" style={{ '--columns': 5 } as React.CSSProperties}>
        <div className="stat">
          <div className="statlabel">
            Total Prompts
            <svg
              aria-hidden="true"
              className="icon"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.65"
              viewBox="0 0 24 24"
            >
              <path d="M12 3L2 8l10 5 10-5z M2 12l10 5 10-5 M2 16l10 5 10-5" />
            </svg>
          </div>
          <strong>{totalPrompts}</strong>
          <small>{currentProject ? `${currentProject.imageIntervalSeconds}s interval` : 'No active project'}</small>
        </div>
        <div className="stat">
          <div className="statlabel">
            Saved Images
            <svg
              aria-hidden="true"
              className="icon"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.65"
              viewBox="0 0 24 24"
            >
              <path d="M4 12l5 5L20 6" />
            </svg>
          </div>
          <strong className="green-text">{savedCount}</strong>
          <small>Verified on disk</small>
        </div>
        <div className="stat">
          <div className="statlabel">
            Needs Review
            <svg
              aria-hidden="true"
              className="icon"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.65"
              viewBox="0 0 24 24"
            >
              <path d="M12 8v5 M12 17h.01 M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18" />
            </svg>
          </div>
          <strong className="amber-text">{reviewCount}</strong>
          <small>No blind regeneration</small>
        </div>
        <div className="stat">
          <div className="statlabel">
            Failed Items
            <svg
              aria-hidden="true"
              className="icon"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.65"
              viewBox="0 0 24 24"
            >
              <path d="M5 5l14 14 M19 5L5 19" />
            </svg>
          </div>
          <strong className="red-text">{failedCount}</strong>
          <small>Definite errors logged</small>
        </div>
        <div className="stat">
          <div className="statlabel">
            Queue Status
            <svg
              aria-hidden="true"
              className="icon"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.65"
              viewBox="0 0 24 24"
            >
              <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l4 2" />
            </svg>
          </div>
          <strong>{status}</strong>
          <small>{queueState.percentage}% processed</small>
        </div>
      </div>

      {/* Persistent Project Library */}
      {/* Project Library */}
      <section className="panel">
        <div className="heading">
          <div>
            <h2>Project Library</h2>
            <p>Saved workflow templates with isolated run outputs and portable archive actions</p>
          </div>
          <div className="actions">
            <small>{projectsList.length} saved project{projectsList.length !== 1 ? 's' : ''}</small>
          </div>
        </div>
        <div className="rule" />
        <div className="library-grid">
            {projectsList.length > 0 ? (
              projectsList.map((proj) => {
                const isActive = currentProject?.id === proj.id;
                return (
                  <ProjectCard
                    key={proj.id}
                    project={{
                      id: proj.id,
                      name: proj.name,
                      outputPath: proj.outputPath,
                      provider: proj.provider,
                      createdAt: proj.createdAt,
                      updatedAt: proj.updatedAt,
                      promptCount: proj.promptCount,
                      referenceCount: proj.referenceCount,
                      savedCount: proj.savedCount,
                      lastRunStatus: proj.lastRunStatus,
                    }}
                    hasImages={false}
                    imageCount={0}
                    onOpenProject={openProject}
                    onViewGallery={() => setActivePage('gallery')}
                  />
                );
              })
            ) : (
              <div className="card">
                <p>No projects yet. Create your first project to get started.</p>
              </div>
            )}
        </div>
      </section>

      {/* Wide Two: Active Project Status + Recent Activity */}
      <div className="wide-two">
        <section className="panel">
          <div className="heading">
            <div>
              <h2>Active Project Status</h2>
              <p>Configured workflow details and execution target</p>
            </div>
            <div className="actions">
              <a className="btn quiet" href="#project">
                <svg
                  aria-hidden="true"
                  className="icon"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.65"
                  viewBox="0 0 24 24"
                >
                  <path d="M4 12h16 M14 6l6 6-6 6" />
                </svg>
                Edit Settings
              </a>
            </div>
          </div>
          <div className="two">
            <div className="value-block">
              <small>Project Name</small>
              <b>{currentProject?.name || 'new_law'}</b>
            </div>
            <div className="value-block">
              <small>Execution Mode / Provider</small>
              <b className="indigo-text">ChatGPT Via Chrome</b>
            </div>
          </div>
          {currentProject && (
            <div className="value-block path" style={{ marginTop: 12 }}>
              <small>Output Directory</small>
              {currentProject.outputPath}
            </div>
          )}
          <div className="row between" style={{ marginTop: 18 }}>
            <span className="muted">Queue Progress</span>
            <span>
              {savedCount} of {totalPrompts} prompts (
              {Math.round((savedCount / Math.max(totalPrompts, 1)) * 100)}%)
            </span>
          </div>
          <div className="progress">
            <span
              style={{
                width:
                  totalPrompts > 0
                    ? Math.round((savedCount / totalPrompts) * 100)
                    : 0,
              }}
            />
          </div>
          <div className="actions">
            <a className="btn" href="#monitor">
              Open Run Monitor
            </a>
            <a className="btn" href="#review">
              Review Center
            </a>
            <a className="btn" href="#reports">
              View HTML Reports
            </a>
          </div>
        </section>
        <section className="panel">
          <div className="heading">
            <div>
              <h2>Recent Activity Feed</h2>
              <p></p>
            </div>
            <div className="actions">
              <small>Live Events</small>
            </div>
          </div>
          <div className="activity" tabIndex={0}>
            {logs && logs.length > 0 ? (
              logs.map((log) => {
                const isError = log.severity === 'error';
                return (
                  <div key={log.id} className={`event ${isError ? 'error-event' : ''}`}>
                    <code>{log.type}</code>
                    <time>{new Date(log.timestamp).toLocaleTimeString()}</time>
                    <p>{log.message}</p>
                  </div>
                );
              })
            ) : (
              <div className="event">
                <code>PROJECT_LOADED</code>
                <time>—</time>
                <p>No activity logged yet. Start a run or load a bundle to see live event entries.</p>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Delete Confirmation Modal */}
      {projectToDelete && (
        <div
          className="modal"
          style={{ display: 'flex' }}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal-box">
            <div className="modal-heading">
              <h3>Permanently Delete Project?</h3>
              <button
                onClick={() => setProjectToDelete(null)}
                className="btn quiet icon-only"
                aria-label="Close dialog"
              >
                <svg
                  aria-hidden="true"
                  className="icon"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.65"
                  viewBox="0 0 24 24"
                >
                  <path d="M5 5l14 14 M19 5L5 19" />
                </svg>
              </button>
            </div>
            <p className="muted">
              Are you sure you want to permanently delete project{' '}
              <strong>{projectToDelete.name}</strong> and its configuration from disk? This action cannot be undone.
            </p>
            <div className="notice red">
              <svg
                aria-hidden="true"
                className="icon"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.65"
                viewBox="0 0 24 24"
              >
                <path d="M12 8v5 M12 17h.01 M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18" />
              </svg>
              <div>
                Project configuration and associated artifacts would be removed in the original application. No deletion is possible in this prototype.
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setProjectToDelete(null)} className="btn">
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={isDeleting}
                className="btn danger"
              >
                {isDeleting ? 'Deleting...' : 'Delete Project'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
