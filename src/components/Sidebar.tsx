import React from 'react';
import {
  LayoutDashboard,
  Sliders,
  BookOpen,
  Layers,
  Images,
  Activity,
  AlertCircle,
  FileText,
  Settings,
  Sun,
  Moon,
  Sparkles,
  FolderOpen,
  Image as ImageIcon,
} from 'lucide-react';
import { useApp, PageId, ThemeMode } from '../context/AppContext.tsx';

interface NavItem {
  id: PageId;
  label: string;
  icon: React.ElementType;
  badge?: number;
}

export function Sidebar({ mobileOpen, onCloseMobile }: { mobileOpen?: boolean; onCloseMobile?: () => void }) {
  const { activePage, setActivePage, theme, setTheme, currentProject, queueState, manifest } = useApp();

  const reviewCount = manifest?.reviewCount || queueState.reviewCount || 0;

  const navGroups: { label: string; items: NavItem[] }[] = [
    {
      label: 'Workspace',
      items: [
        { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
      ],
    },
    {
      label: 'Prepare',
      items: [
        { id: 'settings_project', label: 'Project setup', icon: Sliders },
        { id: 'bundle', label: 'Prompt sequence', icon: Layers },
        { id: 'references', label: 'Reference library', icon: Images },
      ],
    },
    {
      label: 'Generate',
      items: [
        { id: 'monitor', label: 'Generation monitor', icon: Activity },
        { id: 'gallery', label: 'Asset gallery', icon: ImageIcon },
        { id: 'review', label: 'Review center', icon: AlertCircle, badge: reviewCount },
        { id: 'reports', label: 'Reports & history', icon: FileText },
      ],
    },
    {
      label: 'System',
      items: [
        { id: 'how_to_use', label: 'Getting started', icon: BookOpen },
        { id: 'settings', label: 'Preferences', icon: Settings },
      ],
    },
  ];

  const handleNavClick = (id: PageId) => {
    setActivePage(id);
    if (onCloseMobile) onCloseMobile();
  };

  return (
    <aside className="sidebar" id="studio-navigation">
      <div className="brand">
        <div className="brandmark">
          <svg aria-hidden="true" className="icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.65" viewBox="0 0 24 24">
            <path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z M20 2v4 M18 4h4" />
          </svg>
        </div>
        <div>
          <strong>AutoGenImg</strong>
          <small>VISUAL PRODUCTION</small>
        </div>
      </div>

      <nav aria-label="Main navigation" className="nav">
        {navGroups.map((group) => (
          <React.Fragment key={group.label}>
            <div className="nav-group">{group.label}</div>
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = activePage === item.id;
              return (
                <a
                  key={item.id}
                  aria-label={item.label}
                  aria-current={isActive ? 'page' : undefined}
                  title={item.label}
                  href={`#${item.id}`}
                  onClick={(e) => { e.preventDefault(); handleNavClick(item.id); }}
                >
                  <Icon className="icon" />
                  <span>{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="nav-count">{item.badge}</span>
                  )}
                </a>
              );
            })}
          </React.Fragment>
        ))}
      </nav>

      <div className="sidebar-foot">
        {currentProject ? (
          <div className="project-context">
            <small>Active project</small>
            <strong>{currentProject.name}</strong>
            <div className="newlaw">
              <small>{queueState.savedCount} / {queueState.totalPrompts} saved</small>
            </div>
          </div>
        ) : (
          <div className="project-context">
            <small>No active project</small>
            <strong>—</strong>
          </div>
        )}

        <div className="theme-row">
          <span>Theme</span>
          <button
            aria-label={`Switch theme (current: ${theme})`}
            className="btn tiny"
            data-theme-toggle=""
            type="button"
            onClick={() => {
              const themes: ThemeMode[] = ['dark', 'light', 'aurora-violet', 'arctic-blue', 'lavender-mist', 'midnight-orchid', 'obsidian-amethyst', 'carbon-graphite', 'midnight-sapphire', 'dark-titanium'];
              const idx = themes.indexOf(theme);
              setTheme(themes[(idx + 1) % themes.length]);
            }}
          >
            {theme}
          </button>
        </div>
      </div>
    </aside>
  );
}