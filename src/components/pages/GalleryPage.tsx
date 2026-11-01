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

  const formattedSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  };

  const formattedDuration = (ms?: number) => {
    if (!ms) return '-';
    const secs = Math.floor(ms / 1000);
    if (secs < 60) return `${secs}s`;
    return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  };

  const containerWidthRef = containerRef.current?.offsetWidth || 0;

  const aspectRatio = galleryData?.project?.aspectRatio || '16:9';
  const items = galleryData?.items || [];
  const galleryItems = items.filter((i) => i.fileExists);
  const columns = getColumnCount(aspectRatio, containerWidthRef || 640);

  const openViewer = (index: number) => {
    setViewerIndex(index);
    setViewerOpen(true);
  };

  const closeViewer = () => setViewerOpen(false);
  const prevImage = () => setViewerIndex((i) => (i > 0 ? i - 1 : viewerItems.length - 1));
  const nextImage = () => setViewerIndex((i) => (i < viewerItems.length - 1 ? i + 1 : 0));

  const viewerItems = galleryItems;
  const viewerItem = viewerItems[viewerIndex];

  const handleImgLoad = (img: HTMLImageElement) => {
    setViewerImageDim({ width: img.naturalWidth, height: img.naturalHeight });
  };

  const viewerAspectRatio = viewerImageDim
    ? getAspectRatioCategory(viewerImageDim.width, viewerImageDim.height)
    : 'landscape';

  return (
    <div className="stack">
      {/* Gallery Header */}
      <div className="panel">
        <div className="heading">
          <div className="row between">
            <div>
              <div className="row">
                <ImageIcon className="icon" />
                <h2>Generated Gallery</h2>
              </div>
              <p>Five original downloaded images from the completed snapshot. Ordered by prompt sequence.</p>
            </div>
            <div className="actions">
              <div className="row between">
                <span className="badge">
                  {galleryItems.length} Image(s) • {galleryItems.length} Available
                </span>
                <div className="row">
                  <span className="muted">
                    <svg aria-hidden="true" className="icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.65" viewBox="0 0 24 24">
                      <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l4 2" />
                    </svg>
                    Created: Oct 30, 2026
                  </span>
                  <span className="mono">9:16</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Gallery Tools */}
        <div className="row between">
          <div className="row">
            <span className="indigo-text">
              <svg aria-hidden="true" className="icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.65" viewBox="0 0 24 24">
                <path d="M3 6h7l2 2h9v12H3z M13 12v5 M10.5 14.5h5" />
              </svg>
            </span>
            <div>
              <h3>{currentProject?.name || 'Stickman'}</h3>
              <small className="path">
                {currentProject?.outputPath || 'proj-1793336985003'}
              </small>
            </div>
          </div>
          <div className="gallery-tools">
            <label className="search">
              <svg aria-hidden="true" className="icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" viewbox="0 0 24 24">
                <path d="M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13M16 16l5 5" />
              </svg>
              <input
                aria-label="Search original gallery assets"
                autocomplete="off"
                id="gallery-search"
                placeholder="Find an asset, character or scene…"
                type="search"
              />
            </label>
            <div className="tool-end">
              <span aria-live="polite" className="search-status">
                {galleryItems.length} of {galleryItems.length} assets
              </span>
              <div aria-label="Gallery density" className="segment">
                <button aria-pressed={false} data-density="comfortable" type="button">
                  Large
                </button>
                <button aria-pressed={true} data-density="compact" type="button">
                  Sequence
                </button>
              </div>
              <button className="btn tiny" id="select-all-assets" type="button">
                Select all
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Gallery Grid */}
      <div className="panel gallery-group">
        <div className="gallery-grid compact-gallery" data-density="compact">
          {galleryItems.length > 0 ? (
            galleryItems.map((item, idx) => (
              <article key={item.id} className="gallery-card">
                <label className="asset-select">
                  <input aria-label={`Select ${item.id}`} data-asset-select={idx + 1} type="checkbox" />
                </label>
                <span className="asset-id">{`${String(idx + 1).padStart(2, '0')} / ${galleryItems.length}`}</span>
                <a aria-label={`Preview original ${item.id}, portrait 9:16`} className="gallery-photo" onClick={(e) => { e.preventDefault(); openViewer(idx); }} />
                <div className="gallery-caption">
                  <div className="row between">
                    <b className="indigo-text">{item.id}</b>
                    <small>{formattedSize(item.fileSize)}</small>
                  </div>
                  <p title="Full prompt available in image preview">{item.prompt}</p>
                  <div className="row between">
                    <time>{formattedDuration(item.totalDurationMs)}</time>
                    <div className="gallery-hover actions">
                      <button className="btn" type="button" title="Retry">
                        <RefreshCw className="w-3 h-3" />
                        <span>Retry</span>
                      </button>
                      <button className="btn" type="button" title="Regenerate">
                        <svg aria-hidden="true" className="icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.65" viewBox="0 0 24 24">
                          <path d="M20 10a8 8 0 1 0 0 7 M20 3v7h-7" />
                        </svg>
                        <span>Regenerate</span>
                      </button>
                    </div>
                  </div>
                  <span className="asset-state">✓ SAVED · SOURCE SNAPSHOT</span>
                </div>
              </article>
            ))
          ) : (
            <div className="card">
              <div className="empty">
                <div className="big-icon">
                  <ImageIcon className="icon" />
                </div>
                <h3>No Generated Images Yet</h3>
                <p>Run an image-generation queue to see your downloaded images here.</p>
              </div>
            </div>
          )}
        </div>
        <div className="no-results" id="gallery-no-results">
          No assets match this search. Try a character name or IMG-001.
        </div>
        <div className="selection-tray" id="selection-tray">
          <strong id="selection-count">0 assets selected</strong>
          <button className="btn tiny" id="preview-selected" type="button">
            Preview first ↗
          </button>
          <button className="btn quiet tiny" id="clear-selection" type="button">
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}

export default GalleryPage;
