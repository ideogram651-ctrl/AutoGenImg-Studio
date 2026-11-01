import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Image as ImageIcon,
  RefreshCw,
  AlertTriangle,
  Maximize,
  X,
  ChevronLeft,
  ChevronRight,
  Folder,
  Clock,
  Hash,
} from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';

interface GalleryItem {
  id: string;
  sequence: number;
  prompt: string;
  outputFile: string;
  fileSize: number;
  sha256?: string;
  completedAt?: string;
  generationDurationMs?: number;
  downloadDurationMs?: number;
  totalDurationMs?: number;
  fileExists: boolean;
  imageUrl: string;
}

interface GalleryProject {
  project: {
    id: string;
    name: string;
    outputPath: string;
    createdAt: string;
    updatedAt: string;
    aspectRatio: string;
  };
  items: GalleryItem[];
}

// Aspect ratio configuration: desktop target columns and minimum card width.
// These are starting targets; actual column count adapts to viewport width.
const ASPECT_RATIO_CONFIG: Record<
  string,
  { columns: number; minCardWidth: number }
> = {
  '16:9': { columns: 3, minCardWidth: 320 },
  '9:16': { columns: 6, minCardWidth: 140 },
  '1:1': { columns: 5, minCardWidth: 140 },
  '4:3': { columns: 4, minCardWidth: 240 },
  '21:9': { columns: 3, minCardWidth: 380 },
};

function getAspectRatioConfig(ratio: string) {
  return ASPECT_RATIO_CONFIG[ratio] || ASPECT_RATIO_CONFIG['16:9'];
}

function getColumnCount(
  ratio: string,
  containerWidth: number,
): number {
  const config = getAspectRatioConfig(ratio);
  const maxCols = Math.floor(containerWidth / config.minCardWidth);
  return Math.max(1, Math.min(config.columns, maxCols));
}

/**
 * Classify an image's intrinsic aspect ratio into landscape / portrait / square.
 * Thresholds use a 20% tolerance so near-square images are treated as square.
 */
function getAspectRatioCategory(
  width: number,
  height: number,
): 'landscape' | 'portrait' | 'square' {
  const ratio = width / height;
  if (ratio > 1.25) return 'landscape';
  if (ratio < 0.8) return 'portrait';
  return 'square';
}

export function GalleryPage() {
  const {
    currentProject,
    queueState,
    retryDownload,
    regeneratePrompt,
    refreshState,
  } = useApp();

  const containerRef = useRef<HTMLDivElement>(null);
  const [galleryData, setGalleryData] = useState<GalleryProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [viewerImageDim, setViewerImageDim] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const fetchGallery = useCallback(async () => {
    if (!currentProject) {
      setLoading(false);
      setError('No active project loaded.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/gallery');
      if (!res.ok) {
        throw new Error(`Gallery request failed (${res.status}).`);
      }
      const data = await res.json();
      setGalleryData(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load gallery.');
      setGalleryData(null);
    } finally {
      setLoading(false);
    }
  }, [currentProject]);

  useEffect(() => {
    fetchGallery();
  }, [fetchGallery]);

  // Refresh gallery when queue state changes (e.g. after a download completes).
  // Also re-fetch when runId changes (e.g. after Regenerate All creates a new run).
  useEffect(() => {
    fetchGallery();
  }, [queueState.overallStatus, queueState.savedCount, queueState.runId, fetchGallery]);

  // Track container width for responsive column calculation.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const items = galleryData?.items || [];
  const project = galleryData?.project || null;
  const viewerItems = items.filter((i) => i.fileExists);
  const viewerItem = viewerItems[viewerIndex];

  // Determine aspect-ratio category from intrinsic dimensions once the image loads.
  // Defaults to 'landscape' until the first image has loaded.
  const viewerAspectRatio = viewerImageDim
    ? getAspectRatioCategory(viewerImageDim.width, viewerImageDim.height)
    : 'landscape';

  const aspectRatio = project?.aspectRatio || '16:9';
  const columns = containerWidth
    ? getColumnCount(aspectRatio, containerWidth)
    : getAspectRatioConfig(aspectRatio).columns;

  const formattedDate = (iso?: string) => {
    if (!iso) return 'Unknown date';
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return iso;
    }
  };

  const formattedSize = (bytes?: number) => {
    if (!bytes || bytes === 0) return 'Unknown size';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formattedDuration = (ms?: number) => {
    if (!ms) return '—';
    const seconds = (ms / 1000).toFixed(1);
    return `${seconds}s`;
  };

  const openViewer = (index: number) => {
    setViewerIndex(index);
    setViewerOpen(true);
    setViewerImageDim(null);
  };

  const closeViewer = () => {
    setViewerOpen(false);
  };

  const nextImage = () => {
    setViewerIndex((i) => (i + 1) % viewerItems.length);
    setViewerImageDim(null);
  };

  const prevImage = () => {
    setViewerIndex((i) => (i - 1 + viewerItems.length) % viewerItems.length);
    setViewerImageDim(null);
  };

  const handleImgLoad = (e: React.UIEvent<HTMLImageElement>) => {
    const img = e.target as HTMLImageElement;
    if (img.naturalWidth && img.naturalHeight) {
      setViewerImageDim({ width: img.naturalWidth, height: img.naturalHeight });
    }
  };

  const handleRetryDownload = async (itemId: string) => {
    const ok = await retryDownload(itemId);
    if (ok) {
      await refreshState();
    }
  };

  const handleRegenerate = async (itemId: string) => {
    const ok = await regeneratePrompt(itemId);
    if (ok) {
      await refreshState();
    }
  };

  if (loading) {
    return (
      <div className="p-16 rounded-xl text-center glass-panel" style={{ borderColor: 'var(--surface-border)' }}>
        <RefreshCw className="w-12 h-12 text-indigo-400 mx-auto mb-3 animate-spin" />
        <h3 className="text-base font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
          Loading Gallery…
        </h3>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-16 rounded-xl text-center glass-panel" style={{ borderColor: 'var(--surface-border)' }}>
        <AlertTriangle className="w-12 h-12 text-rose-400 mx-auto mb-3" />
        <h3 className="text-base font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
          Gallery Unavailable
        </h3>
        <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">{error}</p>
        {currentProject && (
          <button
            onClick={fetchGallery}
            className="mt-4 px-4 py-2 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white"
          >
            Refresh
          </button>
        )}
      </div>
    );
  }

  if (!currentProject || !project || items.length === 0) {
    return (
      <div className="p-16 rounded-xl text-center glass-panel" style={{ borderColor: 'var(--surface-border)' }}>
        <ImageIcon className="w-12 h-12 text-gray-500 mx-auto mb-3 opacity-50" />
        <h3 className="text-base font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
          No Generated Images Yet
        </h3>
        <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
          Run an image-generation queue to see your downloaded images here.
          Images are grouped by project and ordered by prompt sequence.
        </p>
      </div>
    );
  }

  return (
    <div className="stack">
      {/* Gallery Header */}
      <div className="panel" style={{ borderColor: 'var(--surface-border)' }}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ImageIcon className="w-5 h-5 text-indigo-400" />
              <h2 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                Generated Gallery
              </h2>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Browse downloaded images for the current project. Images are ordered by prompt sequence.
              Card proportions match the project's {aspectRatio} aspect ratio.
            </p>
          </div>

          <div className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            {items.length} Image(s) &bull; {items.filter((i) => i.fileExists).length} Available
          </div>
        </div>
      </div>

      {/* Project Group */}
      <div className="space-y-4">
        {/* Project Header Row */}
        <div className="p-4 rounded-lg glass-panel" style={{ borderColor: 'var(--surface-border)' }}>
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-2">
              <Folder className="w-4 h-4 text-indigo-400" />
              <div>
                <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {project.name}
                </div>
                <div className="text-[10px] text-[var(--text-secondary)]">
                  {project.id} &bull; {project.outputPath}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-[var(--text-secondary)]">
              <Clock className="w-3 h-3" />
              <span>Created: {formattedDate(project.createdAt)}</span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)]">
              <span className="font-mono">{aspectRatio}</span>
            </div>
          </div>

          {/* Image Grid */}
          <div
            ref={containerRef}
            className="grid gap-3"
            style={{
              gridTemplateColumns: `repeat(${columns}, 1fr)`,
            }}
          >
            {items.map((item) => (
              <div
                key={item.id}
                className="relative group rounded-lg overflow-hidden border" style={{ borderColor: 'var(--surface-border)' }}
              >
                {item.fileExists ? (
                  <>
                    <button
                      onClick={() => openViewer(items.findIndex((i) => i.id === item.id))}
                      className="block aspect-video bg-black/30"
                    >
                      <img
                        src={item.imageUrl}
                        alt={`Image ${item.sequence}`}
                        className="w-full h-full object-contain opacity-90 group-hover:opacity-100 transition-opacity"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '';
                        }}
                      />
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Maximize className="w-5 h-5 text-white" />
                      </div>
                    </button>
                    <div className="p-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold text-indigo-400">
                          #{item.sequence}
                        </span>
                        {item.fileSize ? (
                          <span className="text-[10px] text-[var(--text-secondary)]">
                            {formattedSize(item.fileSize)}
                          </span>
                        ) : null}
                      </div>
                      <div className="h-6 overflow-hidden">
                        <p className="text-[10px] line-clamp-2 text-[var(--text-secondary)]">
                          {item.prompt}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[9px] text-[var(--text-secondary)]">
                          {formattedDuration(item.totalDurationMs)}
                        </span>
                        {!item.fileExists && (
                          <span className="text-[9px] text-rose-400">File missing</span>
                        )}
                      </div>
                      {!item.fileExists && (
                        <div className="flex gap-1 mt-2">
                          <button
                            onClick={() => handleRetryDownload(item.id)}
                            className="px-2 py-1 rounded text-[9px] font-medium bg-rose-600/20 text-rose-400 hover:bg-rose-600"
                            title="Retry download"
                          >
                            Retry
                          </button>
                          <button
                            onClick={() => handleRegenerate(item.id)}
                            className="px-2 py-1 rounded text-[9px] font-medium bg-amber-600/20 text-amber-400 hover:bg-amber-600"
                            title="Regenerate"
                          >
                            Regenerate
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="aspect-video bg-black/10 flex flex-col items-center justify-center">
                    <AlertTriangle className="w-6 h-6 text-rose-400 mb-1" />
                    <span className="text-[10px] text-[var(--text-secondary)]">Missing</span>
                    <div className="flex gap-1 mt-2">
                      <button
                        onClick={() => handleRetryDownload(item.id)}
                        className="px-2 py-1 rounded text-[9px] font-medium bg-rose-600/20 text-rose-400 hover:bg-rose-600"
                        title="Retry download"
                      >
                        Retry
                      </button>
                      <button
                        onClick={() => handleRegenerate(item.id)}
                        className="px-2 py-1 rounded text-[9px] font-medium bg-amber-600/20 text-amber-400 hover:bg-amber-600"
                        title="Regenerate"
                      >
                        Regenerate
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Image Viewer / Lightbox */}
      {viewerOpen && viewerItem && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={closeViewer}>
          <div
            className={[
              'relative bg-black rounded-lg border border-white/20 overflow-hidden',
              viewerAspectRatio === 'portrait'
                ? 'max-h-[90vh] max-w-[480px]'
                : viewerAspectRatio === 'square'
                  ? 'max-h-[85vh] max-w-[640px]'
                  : 'max-h-[85vh]',
            ].join(' ')}
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={closeViewer} className="absolute top-4 right-4 z-10">
              <X className="w-6 h-6 text-white" />
            </button>

            <div className="flex items-center justify-center w-full h-full p-4">
              {viewerIndex > 0 && (
                <button
                  onClick={prevImage}
                  className="absolute left-4 top-1/2 -translate-y-1/2 z-20 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
              )}
              {viewerIndex < viewerItems.length - 1 && (
                <button
                  onClick={nextImage}
                  className="absolute right-4 top-1/2 -translate-y-1/2 z-20 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white"
                >
                  <ChevronRight className="w-6 h-6" />
                </button>
              )}

              <div className="relative max-w-full max-h-full flex items-center justify-center">
                <img
                  src={viewerItem.imageUrl}
                  alt={`Image ${viewerItem.sequence}`}
                  className="max-w-full max-h-full object-contain"
                  loading="lazy"
                  onLoad={handleImgLoad}
                />
              </div>

              {/* Viewer Metadata */}
              <div className="absolute bottom-4 left-4 right-4 p-4 bg-black/80 backdrop-blur-md rounded-lg border border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-indigo-400">
                      #{viewerItem.sequence}
                    </span>
                    <span className="text-xs text-[var(--text-secondary)]">
                      {viewerItems.length} images
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-[var(--text-secondary)]">
                    {formattedSize(viewerItem.fileSize)} &bull;
                    {formattedDuration(viewerItem.totalDurationMs)}
                  </div>
                </div>
                <p className="text-xs line-clamp-2 text-[var(--text-secondary)] mb-2">
                  {viewerItem.prompt}
                </p>
                {viewerItem.sha256 && (
                  <div className="flex items-center gap-2 text-[9px] text-[var(--text-secondary)] font-mono truncate">
                    <Hash className="w-3 h-3" />
                    <span title={viewerItem.sha256}>{viewerItem.sha256}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GalleryPage;
