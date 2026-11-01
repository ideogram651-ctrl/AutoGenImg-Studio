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
    <div className="stack">
      <div className="panel">
        <div className="heading">
          <div>
            <h2>Project Configuration &amp; Preflight</h2>
            <p>Set up output directories, real AI browser provider, conversation URL, and video interval rules before initiating queue processing.</p>
          </div>
          <div className="actions">
            <Sliders className="icon" aria-hidden="true" />
          </div>
        </div>

        {message && (
          <div className={`notice ${message.type === 'success' ? 'green' : 'red'}`}>
            {message.type === 'success' ? <CheckCircle2 className="icon" aria-hidden="true" /> : <AlertTriangle className="icon" aria-hidden="true" />}
            <span>{message.text}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="stack">
          {/* Section 1: Project Identity & Location */}
          <div className="space-y-4">
            <h3 className="section-title">
              1. Project Identity &amp; Output Location
            </h3>

            <div className="field">
              <div className="label">Project Name *</div>
              <input
                type="text"
                required
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. YouTube Video - SciFi Short"
              />
            </div>

            <div className="field">
              <div className="label">Authoritative Output Folder Path *</div>
              <div className="relative">
                <input
                  type="text"
                  required
                  list="suggested-output-paths"
                  value={outputPath}
                  onChange={(e) => setOutputPath(e.target.value)}
                  placeholder="e.g. ./project-data/my-project or C:\Users\Username\Videos\ProjectOutput"
                  className="input pl-9"
                />
                <Folder className="icon" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} aria-hidden="true" />
                <datalist id="suggested-output-paths">
                  {(suggestions?.outputPaths || []).map((p, idx) => (
                    <option key={idx} value={p} />
                  ))}
                </datalist>
              </div>
              <p className="hint">
                The application creates isolated <code>runs/&lt;run-id&gt;/images/</code>, <code>output/images/</code>, and <code>manifest.json</code> inside this location.
              </p>
            </div>
          </div>

          {/* Section 2: AI Provider & Conversation URL */}
          <div className="space-y-4">
            <div className="row between">
              <h3 className="section-title">
                2. AI Provider &amp; Conversation Target (Production)
              </h3>
              <span className="badge green">
                <ShieldCheck className="icon" aria-hidden="true" /> Dedicated Chrome CDP Profile
              </span>
            </div>

            <div className="three">
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
                  className={`provider-card${provider === prov.id ? ' selected' : ''}`}
                >
                  <div className="row between">
                    <span className="indigo-text">{prov.title}</span>
                    <span className="badge">{prov.badge}</span>
                  </div>
                  <p className="muted">
                    {prov.desc}
                  </p>
                </div>
              ))}
            </div>

            <div>
              <div className="label">Target Conversation URL *</div>
              <input
                type="url"
                required
                list="suggested-conversation-urls"
                value={conversationUrl}
                onChange={(e) => setConversationUrl(e.target.value)}
                placeholder="https://chatgpt.com/c/xxxx or https://gemini.google.com/app/xxxx"
                className="input"
              />
              <datalist id="suggested-conversation-urls">
                {(suggestions?.conversationUrls || []).map((u, idx) => (
                  <option key={idx} value={u} />
                ))}
              </datalist>
              <p className="hint">
                Point this to your existing authenticated chat session in the automated Chrome browser.
              </p>
            </div>
          </div>

          {/* Section 3: Video Plan & Visual Spec */}
          <div className="space-y-4">
            <h3 className="section-title">
              3. Timing, Interval &amp; Image Count Calculation
            </h3>

            <div className="three">
              <div className="field">
                <div className="label">Video Duration (Seconds)</div>
                <input
                  type="number"
                  min="5"
                  max="3600"
                  value={durationSecs}
                  onChange={(e) => setDurationSecs(parseInt(e.target.value, 10) || 0)}
                  className="input"
                />
              </div>

              <div className="field">
                <div className="label">Image Interval (Seconds)</div>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={intervalSecs}
                  onChange={(e) => setIntervalSecs(parseInt(e.target.value, 10) || 1)}
                  className="input"
                />
              </div>

              <div className="field">
                <div className="label">Aspect Ratio</div>
                <select
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value)}
                  className="select input"
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
            <div className="notice indigo">
              <span className="font-semibold text-indigo-300 mb-1">
                Calculated Plan: {calculatedCount} Total Images &bull; Aspect Ratio: {aspectRatio}
              </span>
              <p className="hint">
                Formula: <code>Math.ceil({durationSecs}s / {intervalSecs}s) = {calculatedCount} images</code>.
                {!isDivisible && (
                  <span className="text-warning ml-1">
                    Note: {durationSecs}s is not evenly divisible by {intervalSecs}s; the final interval will cover the remaining {durationSecs % intervalSecs}s.
                  </span>
                )}
              </p>
            </div>

            <div className="field">
              <div className="label">Visual Style Description</div>
              <textarea
                rows={2}
                value={styleDescription}
                onChange={(e) => setStyleDescription(e.target.value)}
                placeholder="e.g. Cinematic 35mm anamorphic, volumetric neon mist, moody chiaroscuro lighting"
                className="textarea"
              />
              {(suggestions?.styleDescriptions || []).length > 0 && (
                <div className="chips">
                  <small>Recent:</small>
                  {(suggestions?.styleDescriptions || []).slice(0, 3).map((sd, i) => (
                    <span key={i}>{sd}</span>
                  ))}
                </div>
              )}
            </div>

            <div className="field">
              <div className="label">Consistency & Character Instructions</div>
              <textarea
                rows={2}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="e.g. Ensure Detective Kane wears the same weathered trenchcoat and cybernetic left eye in all scenes."
                className="textarea"
              />
              {(suggestions?.instructions || []).length > 0 && (
                <div className="chips">
                  <small>Recent:</small>
                  {(suggestions?.instructions || []).slice(0, 3).map((ins, i) => (
                    <span key={i}>{ins}</span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Form Actions */}
          <div className="actions">
            <button
              type="submit"
              disabled={saving}
              className="btn primary"
            >
              <Save className="icon" />
              <span>{saving ? 'Validating &amp; Saving...' : 'Save Settings'}</span>
            </button>

            <button
              type="button"
              onClick={() => setActivePage('bundle')}
              className="btn"
            >
              <span>Continue to Bundle</span>
              <ArrowRight className="icon" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
