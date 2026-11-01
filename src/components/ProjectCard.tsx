import React, { useCallback } from 'react';
import { useApp } from '../context/AppContext.tsx';

interface ProjectCardProps {
  project: {
    id: string;
    name: string;
    outputPath: string;
    provider: string;
    createdAt: string;
    updatedAt: string;
    promptCount: number;
    referenceCount: number;
    savedCount?: number;
    lastRunStatus?: string;
  };
  hasImages: boolean;
  imageCount: number;
  onOpenProject: (id: string) => void;
  onViewGallery: () => void;
}

export function ProjectCard({
  project,
  hasImages,
  imageCount,
  onOpenProject,
  onViewGallery,
}: ProjectCardProps) {
  const { queueState } = useApp();
  const isActive = queueState.projectId === project.id;

  const handleClick = useCallback(() => {
    onOpenProject(project.id);
  }, [onOpenProject, project.id]);

  return (
    <article
      className={`card ${isActive ? 'active-card' : ''}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      {hasImages ? (
        <div className="project-visual">
          {Array.from({ length: Math.min(imageCount, 5) }).map((_, i) => (
            <span key={i} className={`art-${i + 1}`} />
          ))}
        </div>
      ) : (
        <div className="project-visual planning">
          <div className="planning-track">
            {[1, 2, 3, 4, 5].map((n) => (
              <i key={n}>{n.toString().padStart(2, '0')}</i>
            ))}
          </div>
        </div>
      )}

      <div className="row between">
        <div>
          <h4>
            {project.name}
            {isActive && <span className="badge">Active</span>}
          </h4>
          <small>Updated {new Date(project.updatedAt).toLocaleDateString()}</small>
        </div>
        <span className="badge gray">{project.provider.toUpperCase()}</span>
      </div>

      <div className="mini-stats">
        <div>
          <small>Prompts</small>
          <b>{project.promptCount}</b>
        </div>
        <div>
          <small>Refs</small>
          <b>{project.referenceCount}</b>
        </div>
        <div>
          <small>Last Run</small>
          <b className="muted">{project.lastRunStatus || '—'}</b>
        </div>
      </div>

      <div className="row between">
        <div className="actions">
          <span className="green-text">✓ Loaded</span>
          <button
            className="btn quiet icon-only"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onViewGallery();
            }}
            title="Open gallery"
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
              <path d="M3 3h18v18H3z M3 17l6-6 4 4 3-3 5 5 M16 7h.01" />
            </svg>
          </button>
        </div>
        <button
          className="btn quiet icon-only"
          type="button"
          onClick={(e) => {
            e.stopPropagation();
          }}
          title="Delete project"
          aria-disabled="true"
          disabled
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
            <path d="M3 6h18 M9 6V3h6v3 M6 6l1 15h10l1-15 M10 10v7 M14 10v7" />
          </svg>
        </button>
      </div>
    </article>
  );
}
