import React, { useCallback } from 'react';
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

export function Sidebar({ collapsed, onToggleCollapse }: { collapsed?: boolean; onToggleCollapse?: () => void }) {
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
      label: 'Production',
      items: [
        { id: 'monitor', label: 'Generation monitor', icon: Activity },
        { id: 'gallery', label: 'Asset gallery', icon: ImageIcon },
        { id: 'review', label: 'Review center', icon: AlertCircle, badge: reviewCount },
        { id: 'reports', label: 'Reports & history', icon: FileText },
      ],
    },
    {
      label: 'Resources',
      items: [
        { id: 'how_to_use', label: 'Getting started', icon: BookOpen },
        { id: 'settings', label: 'Preferences', icon: Settings },
      ],
    },
  ];

  const handleNavClick = useCallback((id: PageId) => {
    setActivePage(id);
  }, [setActivePage]);

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

      <div className="inventory-access">
        <a className="muted" href="#inventory">
          Prototype &amp; screen index ↗
        </a>
      </div>

      <div className="sidebar-foot">
        <div className="project-context">
          <small>
            <svg aria-hidden="true" className="icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.65" viewBox="0 0 24 24">
              <path d="M3 6h7l2 2h9v12H3z M13 12v5 M10.5 14.5h5" />
            </svg>
            Active Project
          </small>
          <div className="newlaw">
            <strong>{currentProject ? currentProject.name : 'new_law'}</strong>
            <small>{currentProject ? `${queueState.savedCount} / ${queueState.totalPrompts} saved` : '0 / 5 saved'}</small>
          </div>
          <div className="stickman">
            <strong>Stickman</strong>
            <small>5 / 5 saved</small>
          </div>
        </div>

        <div className="theme-row">
          <span>Appearance</span>
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
            ◑ Light
          </button>
        </div>
      </div>
    </aside>
  );
}