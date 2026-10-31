import React, { useState, useEffect } from 'react';

interface ProjectThumbnailProps {
  projectId: string;
  className?: string;
}

export function ProjectThumbnail({ projectId, className }: ProjectThumbnailProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetch(`/api/projects/${projectId}/preview`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data?.imageUrl) {
          setImageUrl(data.imageUrl);
        } else {
          setImageUrl(null);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [projectId]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center bg-[var(--surface-elevated)] ${className || ''}`}>
        <div className="w-5 h-5 border-2 border-[var(--text-secondary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !imageUrl) {
    return (
      <div className={`flex items-center justify-center bg-[var(--surface-elevated)] ${className || ''}`}>
        <svg className="w-8 h-8 text-[var(--text-secondary)] opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0l4.586 4.586m0 0l1.414-1.414a2 2 0 012.828 0L20 16m-2-2l-1.414-1.414a2 2 0 010-2.828l.707-.707a2 2 0 012.828 0l.707.707M12 12h.01M16 12h.01" />
        </svg>
      </div>
    );
  }

  return (
    <img
      src={imageUrl}
      alt="Project preview"
      className={`object-cover ${className || ''}`}
      loading="lazy"
      onError={() => setError(true)}
    />
  );
}