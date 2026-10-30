import React, { useState } from 'react';
import { FolderPlus, X, Sparkles, Folder, ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppContext.tsx';
import { ProjectConfig, ProviderType } from '../types/index.ts';
import { SAMPLE_BUNDLE, SAMPLE_REFERENCES } from '../utils/sampleData.ts';

export function CreateProjectModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { initProject, setActivePage } = useApp();

  const [name, setName] = useState('');
  const [outputPath, setOutputPath] = useState('./project-data/my-new-project');
  const [provider, setProvider] = useState<ProviderType>('chatgpt');
  const [conversationUrl, setConversationUrl] = useState('https://chatgpt.com/');
  const [intervalSecs, setIntervalSecs] = useState(5);
  const [durationSecs, setDurationSecs] = useState(120);
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [includeSampleTemplate, setIncludeSampleTemplate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    setError(null);

    const project: ProjectConfig = {
      id: `proj-${Date.now()}`,
      name: name.trim(),
      outputPath: outputPath.trim(),
      provider,
      conversationUrl: conversationUrl.trim(),
      imageIntervalSeconds: Number(intervalSecs),
      targetDurationSeconds: Number(durationSecs),
      aspectRatio,
      styleDescription: 'Cinematic 35mm film grain, photorealistic lighting',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const bundle = includeSampleTemplate ? SAMPLE_BUNDLE : undefined;
    const refs = includeSampleTemplate ? SAMPLE_REFERENCES : undefined;

    const success = await initProject(project, bundle, refs);
    setIsSubmitting(false);

    if (success) {
      onClose();
      setActivePage('dashboard');
    } else {
      setError('Failed to initialize output directory. Check folder write permissions.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg p-6 rounded-2xl glass-panel space-y-4 border" style={{ borderColor: 'var(--surface-border)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderPlus className="w-5 h-5 text-indigo-400" />
            <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
              Create New Image Workflow Project
            </h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10" aria-label="Close modal">
            <X className="w-4 h-4 text-[var(--text-secondary)]" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
              Project Name *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                const slug = e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
                setOutputPath(`./project-data/${slug || 'project'}`);
              }}
              placeholder="e.g. YouTube SciFi Short - Episode 1"
              className="w-full px-3 py-2 rounded-lg glass-card outline-none"
              style={{ color: 'var(--text-primary)' }}
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
              Output Folder Location *
            </label>
            <div className="relative">
              <input
                type="text"
                required
                value={outputPath}
                onChange={(e) => setOutputPath(e.target.value)}
                className="w-full pl-9 pr-3 py-2 rounded-lg font-mono glass-card outline-none"
                style={{ color: 'var(--text-primary)' }}
              />
              <Folder className="w-4 h-4 text-[var(--text-secondary)] absolute left-3 top-2.5" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                Target AI Provider
              </label>
              <select
                value={provider}
                onChange={(e) => {
                  const val = e.target.value as ProviderType;
                  setProvider(val);
                  if (val === 'gemini') {
                    setConversationUrl('https://gemini.google.com/app');
                  } else if (val === 'chatgpt') {
                    setConversationUrl('https://chatgpt.com/');
                  }
                }}
                className="w-full px-3 py-2 rounded-lg glass-card outline-none"
                style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-secondary)' }}
              >
                <option value="chatgpt">ChatGPT (DALL-E 3) via Chrome CDP</option>
                <option value="gemini">Google Gemini via Chrome CDP</option>
                <option value="simulation">Simulation Test Mode (Offline SVG)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                Aspect Ratio
              </label>
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value)}
                className="w-full px-3 py-2 rounded-lg glass-card outline-none"
                style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-secondary)' }}
              >
                <option value="16:9">16:9 (Landscape YouTube)</option>
                <option value="9:16">9:16 (Vertical Shorts/Reels)</option>
                <option value="1:1">1:1 (Square)</option>
                <option value="4:3">4:3 (Standard)</option>
                <option value="21:9">21:9 (Ultrawide)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
              Conversation URL *
            </label>
            <input
              type="url"
              required
              value={conversationUrl}
              onChange={(e) => setConversationUrl(e.target.value)}
              className="w-full px-3 py-2 rounded-lg font-mono glass-card outline-none"
              style={{ color: 'var(--text-primary)' }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                Video Duration (Seconds)
              </label>
              <input
                type="number"
                min="5"
                value={durationSecs}
                onChange={(e) => setDurationSecs(parseInt(e.target.value, 10) || 5)}
                className="w-full px-3 py-2 rounded-lg glass-card outline-none"
                style={{ color: 'var(--text-primary)' }}
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                Image Interval (Seconds)
              </label>
              <input
                type="number"
                min="1"
                value={intervalSecs}
                onChange={(e) => setIntervalSecs(parseInt(e.target.value, 10) || 1)}
                className="w-full px-3 py-2 rounded-lg glass-card outline-none"
                style={{ color: 'var(--text-primary)' }}
              />
            </div>
          </div>

          <div className="p-3 rounded-lg bg-black/20 border border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <div>
                <div className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Populate with sample starter bundle (optional)
                </div>
                <div className="text-[10px] text-[var(--text-secondary)]">
                  Unchecked by default. Leave blank to import your own JSON prompt bundle.
                </div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={includeSampleTemplate}
              onChange={(e) => setIncludeSampleTemplate(e.target.checked)}
              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t" style={{ borderColor: 'var(--surface-border)' }}>
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-lg text-xs font-medium hover:bg-white/10"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
            >
              {isSubmitting ? 'Creating Project...' : 'Create & Initialize Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
