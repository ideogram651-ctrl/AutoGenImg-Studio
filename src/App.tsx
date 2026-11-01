import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { UtilityBar } from './components/UtilityBar.tsx';
import { CreateProjectModal } from './components/CreateProjectModal.tsx';
import { DashboardPage } from './components/pages/DashboardPage.tsx';
import { ProjectSettingsPage } from './components/pages/ProjectSettingsPage.tsx';
import { GuidedWorkflowPage } from './components/pages/GuidedWorkflowPage.tsx';
import { BundleManagerPage } from './components/pages/BundleManagerPage.tsx';
import { ReferenceManagerPage } from './components/pages/ReferenceManagerPage.tsx';
import { RunMonitorPage } from './components/pages/RunMonitorPage.tsx';
import { ReviewCenterPage } from './components/pages/ReviewCenterPage.tsx';
import { ReportsHistoryPage } from './components/pages/ReportsHistoryPage.tsx';
import { GalleryPage } from './components/pages/GalleryPage.tsx';
import { SettingsPage } from './components/pages/SettingsPage.tsx';

function MainLayout() {
  const { activePage, currentProject, queueState, runtimeStatus, startRun, setActivePage } = useApp();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const openCreateModal = useCallback(() => setCreateModalOpen(true), []);
  const closeCreateModal = useCallback(() => setCreateModalOpen(false), []);
  const openMobileMenu = useCallback(() => setMobileMenuOpen(true), []);
  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);
  const toggleSidebarCollapse = useCallback(() => setSidebarCollapsed((prev) => !prev), []);

  useEffect(() => {
    if (sidebarCollapsed) {
      document.body.classList.add('nav-collapsed');
    } else {
      document.body.classList.remove('nav-collapsed');
    }
  }, [sidebarCollapsed]);

  const activePageElement = useMemo(() => {
    switch (activePage) {
      case 'dashboard':
        return <DashboardPage onOpenNewProjectModal={openCreateModal} />;
      case 'settings_project':
        return <ProjectSettingsPage />;
      case 'how_to_use':
        return <GuidedWorkflowPage />;
      case 'bundle':
        return <BundleManagerPage />;
      case 'references':
        return <ReferenceManagerPage />;
      case 'monitor':
        return <RunMonitorPage />;
      case 'review':
        return <ReviewCenterPage />;
      case 'reports':
        return <ReportsHistoryPage />;
      case 'gallery':
        return <GalleryPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <DashboardPage onOpenNewProjectModal={openCreateModal} />;
    }
  }, [activePage, openCreateModal]);

  const pageMeta: Record<string, { title: string; subtitle: string }> = {
    dashboard: { title: 'Production overview', subtitle: 'Your projects, production readiness and verified outputs. One considered workspace.' },
    settings_project: { title: 'Project setup', subtitle: 'Configure local output folder, target AI provider, and video interval parameters.' },
    how_to_use: { title: 'Getting started', subtitle: 'Step-by-step master prompt builder, script preparation, and workflow instructions.' },
    bundle: { title: 'Prompt sequence', subtitle: 'Inspect, validate, and sequence structured JSON prompt bundles.' },
    references: { title: 'Reference library', subtitle: 'Organize character, style, and environment references and assign them to prompt IDs.' },
    monitor: { title: 'Generation monitor', subtitle: 'Live visible queue progress, item stages, timestamps, and real-time event logs.' },
    review: { title: 'Review center', subtitle: 'Resolve ambiguous generations, download exceptions, and deliberate user regenerations.' },
    reports: { title: 'Reports & history', subtitle: 'Inspect self-contained offline HTML reports, wall-clock timings, and manifests.' },
    gallery: { title: 'Asset gallery', subtitle: 'Browse verified outputs, inspect metadata, and manage generated assets.' },
    settings: { title: 'Preferences', subtitle: 'Theme preferences, default output locations, browser profiles, and diagnostic options.' },
  };
  const meta = pageMeta[activePage] || { title: 'AutoGenImg Studio', subtitle: '' };
  const isBrowserConnected = Boolean(runtimeStatus?.chromeStatus?.connected);
  const activeProvider = currentProject?.provider || runtimeStatus?.activeAdapterId || 'chatgpt';
  const providerLabel = activeProvider === 'gemini' ? 'Gemini' : activeProvider === 'chatgpt' ? 'ChatGPT' : 'Simulation';

  return (
    <div className="app">
      <Sidebar collapsed={sidebarCollapsed} onToggleCollapse={toggleSidebarCollapse} />

      <main className="viewport" id="studio-main" tabIndex={-1}>
        <UtilityBar onToggleNav={toggleSidebarCollapse} />

        <section aria-label={meta.title} className="page default" id={activePage}>
          <header className="app-header">
            <div>
              <div className="title-row">
                <h1 tabIndex={-1}>{meta.title}</h1>
                {currentProject && <span className="badge">{currentProject.name}</span>}
                {queueState.overallStatus === 'RUNNING' && (
                  <span className="badge green">Queue Running ({queueState.percentage}%)</span>
                )}
              </div>
              <p>{meta.subtitle}</p>
            </div>
            <div className="actions">
              <div className="provider" title="Captured provider status from the source.">
                <span className="muted">SNAPSHOT · </span>
                <span className="dot" />
                <span className="muted">Provider:</span>
                <b>{providerLabel} via Chrome</b>
                <span className="muted">│ {isBrowserConnected ? 'Connected' : 'Not Connected'}</span>
              </div>
              <button className="btn" type="button" onClick={openCreateModal}>
                <svg aria-hidden="true" className="icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.65" viewBox="0 0 24 24">
                  <path d="M3 6h7l2 2h9v12H3z M13 12v5 M10.5 14.5h5" />
                </svg>
                New Project
              </button>
              {currentProject && queueState.overallStatus !== 'RUNNING' && (
                <button
                  className="btn green"
                  type="button"
                  onClick={() => { setActivePage('monitor'); startRun(); }}
                >
                  <svg aria-hidden="true" className="icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.65" viewBox="0 0 24 24">
                    <path d="M7 4l14 8-14 8z" />
                  </svg>
                  Start Queue
                </button>
              )}
            </div>
          </header>

          {activePage === 'dashboard' && (
            <nav aria-label="Production workflow" className="workflow-rail">
              <a href="#bundle" onClick={(e) => { e.preventDefault(); setActivePage('bundle'); }}>
                <span className="rail-index">01</span><span>Sequence</span><span aria-hidden="true" className="rail-arrow">→</span>
              </a>
              <a href="#references" onClick={(e) => { e.preventDefault(); setActivePage('references'); }}>
                <span className="rail-index">02</span><span>References</span><span aria-hidden="true" className="rail-arrow">→</span>
              </a>
              <a href="#monitor" onClick={(e) => { e.preventDefault(); setActivePage('monitor'); }}>
                <span className="rail-index">03</span><span>Generate</span><span aria-hidden="true" className="rail-arrow">→</span>
              </a>
              <a href="#gallery" onClick={(e) => { e.preventDefault(); setActivePage('gallery'); }}>
                <span className="rail-index">04</span><span>Assets</span><span aria-hidden="true" className="rail-arrow">→</span>
              </a>
            </nav>
          )}

          <div className="workspace">
            <div className="stack">
              {activePageElement}
            </div>
          </div>
        </section>
      </main>

      <CreateProjectModal
        isOpen={createModalOpen}
        onClose={closeCreateModal}
      />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <MainLayout />
    </AppProvider>
  );
}
