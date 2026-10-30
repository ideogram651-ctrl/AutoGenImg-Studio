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
import { useApp, PageId } from '../context/AppContext.tsx';

interface NavItem {
  id: PageId;
  label: string;
  icon: React.ElementType;
  badge?: number;
}

export function Sidebar({ mobileOpen, onCloseMobile }: { mobileOpen?: boolean; onCloseMobile?: () => void }) {
  const { activePage, setActivePage, theme, toggleTheme, currentProject, queueState, manifest } = useApp();

  const reviewCount = manifest?.reviewCount || queueState.reviewCount || 0;

  const navItems: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'settings_project', label: 'Project Settings', icon: Sliders },
    { id: 'how_to_use', label: 'How to Use (Guide)', icon: BookOpen },
    { id: 'bundle', label: 'Prompt Bundle', icon: Layers },
    { id: 'references', label: 'Reference Manager', icon: Images },
    { id: 'monitor', label: 'Run Monitor', icon: Activity },
    { id: 'gallery', label: 'Generated Gallery', icon: ImageIcon },
    { id: 'review', label: 'Review Center', icon: AlertCircle, badge: reviewCount },
    { id: 'reports', label: 'Reports & History', icon: FileText },
    { id: 'settings', label: 'App Settings', icon: Settings },
  ];

  const handleNavClick = (id: PageId) => {
    setActivePage(id);
    if (onCloseMobile) onCloseMobile();
  };

  return (
    <aside
      className={`fixed lg:static inset-y-0 left-0 z-40 w-64 glass-panel flex flex-col justify-between transition-transform duration-200 border-r ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}
      style={{ borderColor: 'var(--surface-border)' }}
    >
      {/* Brand Identity */}
      <div>
        <div className="p-5 border-b" style={{ borderColor: 'var(--surface-border)' }}>
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-white shadow-sm"
              style={{ background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)' }}
            >
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-bold text-base tracking-tight" style={{ color: 'var(--text-primary)' }}>
                AutoGenImg
              </div>
              <div className="text-[11px] font-medium tracking-wide uppercase" style={{ color: 'var(--text-secondary)' }}>
                Workflow Studio
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="p-3 space-y-1" aria-label="Main Navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'shadow-sm text-white'
                    : 'hover:bg-white/5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
                style={{
                  backgroundColor: isActive ? 'var(--accent)' : 'transparent',
                }}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                    style={{
                      backgroundColor: isActive ? 'rgba(0,0,0,0.3)' : 'rgba(245, 158, 11, 0.2)',
                      color: isActive ? '#fff' : '#fbbf24',
                    }}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer / Context Info & Theme */}
      <div className="p-4 border-t space-y-3" style={{ borderColor: 'var(--surface-border)' }}>
        {currentProject ? (
          <div className="p-2.5 rounded-lg glass-card text-xs">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-secondary)]">
              <FolderOpen className="w-3.5 h-3.5" />
              <span className="truncate">Active Project</span>
            </div>
            <div className="font-semibold truncate mt-1" style={{ color: 'var(--text-primary)' }}>
              {currentProject.name}
            </div>
            <div className="text-[10px] text-[var(--text-secondary)] mt-0.5 truncate">
              {queueState.savedCount} / {queueState.totalPrompts} saved
            </div>
          </div>
        ) : (
          <div className="px-2 py-1 text-xs text-[var(--text-secondary)]">
            No active project loaded
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <span className="text-xs font-medium text-[var(--text-secondary)]">Theme</span>
          <button
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors hover:bg-white/10"
            style={{
              backgroundColor: 'var(--surface-elevated)',
              border: '1px solid var(--surface-border)',
              color: 'var(--text-primary)',
            }}
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span>Light</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-indigo-500" />
                <span>Dark</span>
              </>
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}
