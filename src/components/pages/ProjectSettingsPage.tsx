import React, { useState, useEffect } from 'react';
import {
  Save,
  CheckCircle2,
  AlertTriangle,
  Folder,
  ArrowRight,
  ShieldCheck,
  Sliders,
  Sparkles,
  Compass,
} from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { ProjectConfig, ProviderType } from '../../types/index.ts';

export function ProjectSettingsPage() {
  const { currentProject, initProject, setActivePage, suggestions } = useApp();

  const [name, setName] = useState(currentProject?.name || 'My Visual Project');
  const [outputPath, setOutputPath] = useState(currentProject?.outputPath || './project-data/my-project');
  const [provider, setProvider] = useState<ProviderType>(currentProject?.provider || 'chatgpt');
  const [conversationUrl, setConversationUrl] = useState(
    currentProject?.conversationUrl || 'https://chatgpt.com/'
  );
  const [intervalSecs, setIntervalSecs] = useState<number>(currentProject?.imageIntervalSeconds || 5);
  const [durationSecs, setDurationSecs] = useState<number>(currentProject?.targetDurationSeconds || 120);
  const [aspectRatio, setAspectRatio] = useState(currentProject?.aspectRatio || '16:9');
  const [styleDescription, setStyleDescription] = useState(
    currentProject?.styleDescription || 'Cinematic, 35mm film grain, photorealistic lighting'
  );
  const [instructions, setInstructions] = useState(
    currentProject?.instructions || 'Ensure consistent protagonist clothing and appearance across all scenes.'
  );

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Sync state whenever currentProject hydrates or switches
  useEffect(() => {
    if (currentProject) {
      setName(currentProject.name || '');
      setOutputPath(currentProject.outputPath || '');
      setProvider(currentProject.provider || 'chatgpt');
      setConversationUrl(currentProject.conversationUrl || '');
      setIntervalSecs(currentProject.imageIntervalSeconds ?? 5);
      setDurationSecs(currentProject.targetDurationSeconds ?? 120);
      setAspectRatio(currentProject.aspectRatio || '16:9');
      setStyleDescription(currentProject.styleDescription || '');
      setInstructions(currentProject.instructions || '');
    }
  }, [currentProject]);

  // Calculation
  const calculatedCount = intervalSecs > 0 && durationSecs > 0 ? Math.ceil(durationSecs / intervalSecs) : 0;
  const isDivisible = durationSecs % intervalSecs === 0;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const config: ProjectConfig = {
      id: currentProject?.id || `proj-${Date.now()}`,
      name: name.trim(),
      outputPath: outputPath.trim(),
      provider,
      conversationUrl: conversationUrl.trim(),
      imageIntervalSeconds: Number(intervalSecs),
      targetDurationSeconds: Number(durationSecs),
      aspectRatio,
      styleDescription: styleDescription.trim(),
      instructions: instructions.trim(),
      createdAt: currentProject?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const success = await initProject(config);
    setSaving(false);

    if (success) {
      setMessage({ type: 'success', text: 'Project configuration saved permanently and output directory validated.' });
    } else {
      setMessage({ type: 'error', text: 'Failed to save configuration. Please verify output directory path permissions.' });
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="p-6 rounded-xl glass-panel" style={{ borderColor: 'var(--surface-border)' }}>
        <div className="flex items-center gap-2 mb-2">
          <Sliders className="w-5 h-5 text-indigo-400" />
          <h2 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Project Configuration & Preflight
          </h2>
        </div>
        <p className="text-xs text-[var(--text-secondary)] mb-6">
          Set up output directories, real AI browser provider, conversation URL, and video interval rules before initiating queue processing.
        </p>

        {message && (
          <div
            className={`p-3.5 rounded-lg text-xs font-medium flex items-center gap-2 mb-6 ${
              message.type === 'success'
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
            }`}
          >
            {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
            <span>{message.text}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6">
          {/* Section 1: Project Identity & Location */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400">
              1. Project Identity & Output Location
            </h3>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>
                Project Name *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. YouTube Video - SciFi Short"
                className="w-full px-3 py-2 rounded-lg text-xs glass-card outline-none focus:ring-1 focus:ring-indigo-500"
                style={{ color: 'var(--text-primary)' }}
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>
                Authoritative Output Folder Path *
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  list="suggested-output-paths"
                  value={outputPath}
                  onChange={(e) => setOutputPath(e.target.value)}
                  placeholder="e.g. ./project-data/my-project or C:\Users\Username\Videos\ProjectOutput"
                  className="w-full pl-9 pr-3 py-2 rounded-lg text-xs glass-card outline-none font-mono focus:ring-1 focus:ring-indigo-500"
                  style={{ color: 'var(--text-primary)' }}
                />
                <Folder className="w-4 h-4 text-[var(--text-secondary)] absolute left-3 top-2.5" />
                <datalist id="suggested-output-paths">
                  {(suggestions?.outputPaths || []).map((p, idx) => (
                    <option key={idx} value={p} />
                  ))}
                </datalist>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)] mt-1">
                The application creates isolated <code>runs/&lt;run-id&gt;/images/</code>, <code>output/images/</code>, and <code>manifest.json</code> inside this location.
              </p>
            </div>
          </div>

          {/* Section 2: AI Provider & Conversation URL */}
          <div className="space-y-4 pt-4 border-t" style={{ borderColor: 'var(--surface-border)' }}>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                2. AI Provider & Conversation Target (Production)
              </h3>
              <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-mono">
                <ShieldCheck className="w-3 h-3" /> Dedicated Chrome CDP Profile
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                {
                  id: 'chatgpt',
                  title: 'ChatGPT (DALL-E 3)',
                  badge: 'Recommended',
                  desc: 'Genuine image generation on chatgpt.com via automated Chrome session on isolated ./browser-profile.',
                },
                {
                  id: 'gemini',
                  title: 'Google Gemini',
                  badge: 'Supported',
                  desc: 'Genuine image generation on gemini.google.com via automated Chrome session on isolated ./browser-profile.',
                },
                {
                  id: 'simulation',
                  title: 'Simulation Test Mode',
                  badge: 'Testing Only',
                  desc: 'Offline testing mock that outputs local SVG artifacts. Never submit real prompts to AI providers in this mode.',
                },
              ].map((prov) => (
                <div
                  key={prov.id}
                  onClick={() => setProvider(prov.id as ProviderType)}
                  className={`p-3.5 rounded-lg cursor-pointer border transition-all ${
                    provider === prov.id
                      ? 'border-indigo-500 bg-indigo-500/10 shadow-sm'
                      : 'border-white/10 hover:border-white/20'
                  }`}
                  style={{ backgroundColor: provider === prov.id ? undefined : 'var(--surface-elevated)' }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-xs" style={{ color: 'var(--text-primary)' }}>
                      {prov.title}
                    </span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                        prov.id === 'chatgpt'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : prov.id === 'gemini'
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'bg-amber-500/20 text-amber-400'
                      }`}
                    >
                      {prov.badge}
                    </span>
                  </div>
                  <div className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                    {prov.desc}
                  </div>
                </div>
              ))}
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>
                Target Conversation URL *
              </label>
              <input
                type="url"
                required
                list="suggested-conversation-urls"
                value={conversationUrl}
                onChange={(e) => setConversationUrl(e.target.value)}
                placeholder="https://chatgpt.com/c/xxxx or https://gemini.google.com/app/xxxx"
                className="w-full px-3 py-2 rounded-lg text-xs glass-card outline-none font-mono focus:ring-1 focus:ring-indigo-500"
                style={{ color: 'var(--text-primary)' }}
              />
              <datalist id="suggested-conversation-urls">
                {(suggestions?.conversationUrls || []).map((u, idx) => (
                  <option key={idx} value={u} />
                ))}
              </datalist>
              <p className="text-[11px] text-[var(--text-secondary)] mt-1">
                Point this to your existing authenticated chat session in the automated Chrome browser.
              </p>
            </div>
          </div>

          {/* Section 3: Video Plan & Visual Spec */}
          <div className="space-y-4 pt-4 border-t" style={{ borderColor: 'var(--surface-border)' }}>
            <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400">
              3. Timing, Interval & Image Count Calculation
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>
                  Video Duration (Seconds)
                </label>
                <input
                  type="number"
                  min="5"
                  max="3600"
                  value={durationSecs}
                  onChange={(e) => setDurationSecs(parseInt(e.target.value, 10) || 0)}
                  className="w-full px-3 py-2 rounded-lg text-xs glass-card outline-none focus:ring-1 focus:ring-indigo-500"
                  style={{ color: 'var(--text-primary)' }}
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>
                  Image Interval (Seconds)
                </label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={intervalSecs}
                  onChange={(e) => setIntervalSecs(parseInt(e.target.value, 10) || 1)}
                  className="w-full px-3 py-2 rounded-lg text-xs glass-card outline-none focus:ring-1 focus:ring-indigo-500"
                  style={{ color: 'var(--text-primary)' }}
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>
                  Aspect Ratio
                </label>
                <select
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-xs glass-card outline-none focus:ring-1 focus:ring-indigo-500"
                  style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-secondary)' }}
                >
                  <option value="16:9">16:9 (Landscape YouTube)</option>
                  <option value="9:16">9:16 (Vertical Shorts/Reels)</option>
                  <option value="1:1">1:1 (Square)</option>
                  <option value="4:3">4:3 (Standard)</option>
                  <option value="21:9">21:9 (Cinematic Ultrawide)</option>
                </select>
              </div>
            </div>

            {/* Calculated Preview Box */}
            <div className="p-3.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-xs">
              <div className="flex items-center justify-between font-semibold text-indigo-300 mb-1">
                <span>Calculated Plan: {calculatedCount} Total Images</span>
                <span>Aspect Ratio: {aspectRatio}</span>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)]">
                Formula: <code>Math.ceil({durationSecs}s / {intervalSecs}s) = {calculatedCount} images</code>.
                {!isDivisible && (
                  <span className="text-amber-400 ml-1">
                    Note: {durationSecs}s is not evenly divisible by {intervalSecs}s; the final interval will cover the remaining {durationSecs % intervalSecs}s.
                  </span>
                )}
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>
                Visual Style Description
              </label>
              <textarea
                rows={2}
                value={styleDescription}
                onChange={(e) => setStyleDescription(e.target.value)}
                placeholder="e.g. Cinematic 35mm anamorphic, volumetric neon mist, moody chiaroscuro lighting"
                className="w-full px-3 py-2 rounded-lg text-xs glass-card outline-none focus:ring-1 focus:ring-indigo-500"
                style={{ color: 'var(--text-primary)' }}
              />
              {(suggestions?.styleDescriptions || []).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  <span className="text-[10px] text-[var(--text-secondary)]">Recent:</span>
                  {(suggestions?.styleDescriptions || []).slice(0, 3).map((sd, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setStyleDescription(sd)}
                      className="text-[10px] px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[var(--text-secondary)] truncate max-w-xs"
                    >
                      {sd}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>
                Consistency & Character Instructions
              </label>
              <textarea
                rows={2}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="e.g. Ensure Detective Kane wears the same weathered trenchcoat and cybernetic left eye in all scenes."
                className="w-full px-3 py-2 rounded-lg text-xs glass-card outline-none focus:ring-1 focus:ring-indigo-500"
                style={{ color: 'var(--text-primary)' }}
              />
              {(suggestions?.instructions || []).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  <span className="text-[10px] text-[var(--text-secondary)]">Recent:</span>
                  {(suggestions?.instructions || []).slice(0, 3).map((ins, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setInstructions(ins)}
                      className="text-[10px] px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-[var(--text-secondary)] truncate max-w-xs"
                    >
                      {ins}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-6 border-t" style={{ borderColor: 'var(--surface-border)' }}>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition-all disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Validating & Saving...' : 'Save Settings'}</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActivePage('bundle')}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium hover:bg-white/10 transition-colors"
                style={{
                  backgroundColor: 'var(--surface-elevated)',
                  border: '1px solid var(--surface-border)',
                  color: 'var(--text-primary)',
                }}
              >
                <span>Continue to Bundle</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
