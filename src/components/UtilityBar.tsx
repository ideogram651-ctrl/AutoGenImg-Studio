import React from 'react';
import { useApp } from '../context/AppContext.tsx';

interface UtilityBarProps {
  onToggleNav?: () => void;
}

export function UtilityBar({ onToggleNav }: UtilityBarProps) {
  const { activePage, currentProject } = useApp();
  const contextLabel = currentProject
    ? `${currentProject.name} / ${activePage === 'dashboard' ? 'Overview' : activePage}`
    : `new_law / ${activePage === 'dashboard' ? 'Overview' : activePage}`;

  return (
    <div className="utility-bar">
      <div className="utility-start">
        <button
          aria-controls="studio-navigation"
          aria-expanded="true"
          aria-label="Toggle navigation"
          className="shell-toggle"
          id="navigation-toggle"
          type="button"
          onClick={onToggleNav}
        >
          <svg aria-hidden="true" className="icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" viewBox="0 0 24 24">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <b>Studio</b>
        <span className="utility-slash">/</span>
        <span id="utility-context">{contextLabel}</span>
      </div>
      <div className="utility-end">
        <span className="offline-dot" />
        <span>OFFLINE PROTOTYPE</span>
        <span className="version"> / ATELIER 01</span>
      </div>
    </div>
  );
}
