import React, { useState, useEffect, useCallback } from 'react';

interface GalleryItem {
  id: string;
  sequence: number;
  prompt: string;
  outputFile: string;
  fileSize: number;
  sha256?: string;
  completedAt?: string;
  fileExists: boolean;
  imageUrl: string;
}

interface HeroArtProps {
  projectId: string | null;
  onViewGallery: () => void;
}

export function HeroArt({ projectId, onViewGallery }: HeroArtProps) {
  const [images, setImages] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchImages = useCallback(async () => {
    if (!projectId) {
      setImages([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/gallery');
      if (!res.ok) {
        setImages([]);
        return;
      }
      const data = await res.json();
      const items: GalleryItem[] = (data.items || []).filter(
        (item: GalleryItem) => item.fileExists
      );
      items.sort((a: GalleryItem, b: GalleryItem) => a.sequence - b.sequence);
      setImages(items.slice(0, 2));
    } catch {
      setImages([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  return (
    <a
      className="hero-art"
      href="#gallery"
      onClick={(e) => {
        e.preventDefault();
        onViewGallery();
      }}
      aria-label="Explore project gallery"
    >
      {images.length === 0 ? (
        <>
          <span className="hero-frame empty" />
          <span className="hero-frame empty" />
        </>
      ) : (
        <>
          {images.map((img, idx) => (
            <span
              key={img.id}
              className="hero-frame"
              style={{
                backgroundImage: `url(${img.imageUrl})`,
              }}
            />
          ))}
          {images.length === 1 && <span className="hero-frame empty" />}
        </>
      )}
      <small>STICKMAN / COMPLETED PROJECT PREVIEW ↗</small>
    </a>
  );
}
