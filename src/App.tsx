import React, { useState, useMemo, useCallback } from 'react';
import { AppProvider, useApp } from './context/AppContext.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { Header } from './components/Header.tsx';
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
  const { activePage } = useApp();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const openCreateModal = useCallback(() => setCreateModalOpen(true), []);
  const closeCreateModal = useCallback(() => setCreateModalOpen(false), []);
  const openMobileMenu = useCallback(() => setMobileMenuOpen(true), []);
  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);

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

  return (
    <div className="app">
      <Sidebar mobileOpen={mobileMenuOpen} onCloseMobile={closeMobileMenu} />

      <div className="viewport">
        <Header
          onOpenMobileMenu={openMobileMenu}
          onOpenNewProjectModal={openCreateModal}
        />

        <main className="page default" id="studio-main">
          <div className="workspace">
            {activePageElement}
          </div>
        </main>
      </div>

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
