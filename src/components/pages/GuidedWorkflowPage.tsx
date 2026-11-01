import React, { useState } from 'react';
import {
  BookOpen,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Palette,
  Calculator,
  Image as ImageIcon,
  Code2,
  Upload,
  PlayCircle,
  HelpCircle,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';

export function GuidedWorkflowPage() {
  const { setActivePage } = useApp();
  const [currentStep, setCurrentStep] = useState(1);
  const [copied, setCopied] = useState(false);

  // Master Prompt Builder State
  const [builderProjectName, setBuilderProjectName] = useState('The Cyberpunk Detective');
  const [builderDuration, setBuilderDuration] = useState(120);
  const [builderInterval, setBuilderInterval] = useState(5);
  const [builderAspectRatio, setBuilderAspectRatio] = useState('16:9');
  const [builderStyle, setBuilderStyle] = useState('Raw Cinematic 35mm film grain, moody shadows, photorealistic lighting');
  const [builderCharacter, setBuilderCharacter] = useState('Kane: detective in weathered brown trenchcoat, cyan cybernetic left eye');

  const calculatedImages = Math.ceil(builderDuration / builderInterval);

  const generatedMasterPrompt = `You are a professional film director and concept artist. 
I have provided the script for my ${builderDuration}-second video. 
I need an exact image plan of ${calculatedImages} sequential visual prompts (one image every ${builderInterval} seconds) with aspect ratio ${builderAspectRatio}.

PROJECT REQUIREMENTS:
1. Video Title: "${builderProjectName}"
2. Visual Style: ${builderStyle}
3. Character Consistency: ${builderCharacter}
4. Timing: Start at 0s, increment by ${builderInterval}s up to ${builderDuration}s.
5. Unique IDs: IMG-001, IMG-002, ..., IMG-${String(calculatedImages).padStart(3, '0')}.

You MUST output your response in this EXACT JSON schema without markdown prose outside the JSON:

{
  "schemaVersion": "1.0",
  "project": {
    "name": "${builderProjectName}",
    "durationSeconds": ${builderDuration},
    "imageIntervalSeconds": ${builderInterval},
    "aspectRatio": "${builderAspectRatio}",
    "styleDescription": "${builderStyle}"
  },
  "prompts": [
    {
      "id": "IMG-001",
      "sequence": 1,
      "startSeconds": 0,
      "endSeconds": ${builderInterval},
      "prompt": "Detailed cinematic scene description...",
      "referenceIds": ["REF-STYLE-01"]
    }
  ]
}

Ensure all ${calculatedImages} prompts are generated. Return only valid JSON or a downloadable .json file.`;

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(generatedMasterPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const steps = [
    { num: 1, title: 'Prepare Script', icon: FileText },
    { num: 2, title: 'Choose Visual Style', icon: Palette },
    { num: 3, title: 'Image Plan Math', icon: Calculator },
    { num: 4, title: 'Reference Files', icon: ImageIcon },
    { num: 5, title: 'Master Prompt Builder', icon: Code2 },
    { num: 6, title: 'Import Bundle', icon: Upload },
    { num: 7, title: 'Run & Review', icon: PlayCircle },
  ];

  return (
    <div className="stack">
      {/* Guide Header */}
      <div className="panel" style={{ borderColor: 'var(--surface-border)' }}>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BookOpen className="w-5 h-5 text-indigo-400" />
              <h2 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                Beginner&apos;s Guided Workflow: Script to Prompt Bundle
              </h2>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Follow these 7 steps to prepare your script, structure your prompts, and configure automated generation.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentStep((s) => Math.max(1, s - 1))}
              disabled={currentStep === 1}
              className="p-2 rounded-lg glass-card hover:bg-white/10 disabled:opacity-30"
              aria-label="Previous step"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-semibold px-2" style={{ color: 'var(--text-primary)' }}>
              Step {currentStep} of 7
            </span>
            <button
              onClick={() => setCurrentStep((s) => Math.min(7, s + 1))}
              disabled={currentStep === 7}
              className="p-2 rounded-lg glass-card hover:bg-white/10 disabled:opacity-30"
              aria-label="Next step"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Step Progress Bar */}
        <div className="grid grid-cols-7 gap-1.5 pt-2">
          {steps.map((st) => (
            <button
              key={st.num}
              onClick={() => setCurrentStep(st.num)}
              className={`p-2 rounded-lg text-left transition-all ${
                currentStep === st.num
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : currentStep > st.num
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-white/5 text-[var(--text-secondary)] hover:bg-white/10'
              }`}
            >
              <div className="text-[10px] font-bold uppercase opacity-80">Step {st.num}</div>
              <div className="text-xs font-semibold truncate hidden sm:block">{st.title}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <div className="panel" style={{ borderColor: 'var(--surface-border)' }}>
        {/* Step 1: Prepare Script */}
        {currentStep === 1 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-indigo-400">
              <FileText className="w-5 h-5" />
              <h3 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>
                Step 1: Prepare Your Video Script as Plain Text
              </h3>
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Have your video narration, voiceover, or screen action formatted in a clean plain-text <code>.txt</code> file. The AI prompt engineer will analyze this text to partition it into logical scene beats.
            </p>

            <div className="p-4 rounded-lg bg-black/20 border border-white/5 space-y-2 text-xs">
              <span className="font-semibold text-emerald-400">Best Practice:</span>
              <ul className="list-disc list-inside space-y-1 text-[var(--text-secondary)]">
                <li>Include timing timestamps if you have recorded voiceover (e.g. <code>[00:00 - 00:05]</code>).</li>
                <li>Remove technical sound effects or stage directions that should not be depicted visually.</li>
                <li>Clearly mention character names whenever they appear in a scene.</li>
              </ul>
            </div>
          </div>
        )}

        {/* Step 2: Choose Visual Style */}
        {currentStep === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-indigo-400">
              <Palette className="w-5 h-5" />
              <h3 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>
                Step 2: Select a Visual Direction
              </h3>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Choose one cohesive visual aesthetic for your entire bundle so all generated shots look like parts of the same production.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {[
                {
                  title: 'Raw / Cinematic 35mm',
                  desc: 'Volumetric natural lighting, organic film grain, shallow depth of field, anamorphic lens flares, real camera angles.',
                  tag: 'Most Popular for YouTube Video Essays',
                },
                {
                  title: 'Photorealistic Humans',
                  desc: 'Studio lighting, high texture detail, natural skin pores, realistic expressions, candid documentary style.',
                  tag: 'Explainer & Case Studies',
                },
                {
                  title: 'Realistic 3D CGI',
                  desc: 'Octane renderer aesthetics, clean metallic shaders, stylized character geometry, vibrant color palettes.',
                  tag: 'Animated Shorts & Tech Demos',
                },
                {
                  title: 'Minimalist Stickman / Diagrammatic',
                  desc: 'High contrast black ink lines on textured cream background, clear visual metaphors, playful hand-drawn feel.',
                  tag: 'Fast Paced Educational Content',
                },
              ].map((style, i) => (
                <div key={i} className="p-4 rounded-xl glass-card space-y-2 border border-white/5">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-xs" style={{ color: 'var(--text-primary)' }}>
                      {style.title}
                    </h4>
                    <span className="text-[10px] text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded">
                      {style.tag}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                    {style.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Define Image Plan Math */}
        {currentStep === 3 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-indigo-400">
              <Calculator className="w-5 h-5" />
              <h3 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>
                Step 3: Define Image Timing & Plan Calculations
              </h3>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Specify your video duration and pacing interval. The application uses transparent ceiling arithmetic to ensure every second of footage is covered by a visual scene.
            </p>

            <div className="p-4 rounded-xl bg-black/20 border border-white/5 space-y-3 text-xs">
              <div className="font-semibold text-indigo-300">
                Rule: <code>Total Images = Math.ceil(durationSeconds / intervalSeconds)</code>
              </div>
              <p className="text-[var(--text-secondary)]">
                For example: A <strong>120-second</strong> video with an image every <strong>5 seconds</strong> requires exactly <strong>24 images</strong> (IMG-001 to IMG-024).
              </p>
              <p className="text-[var(--text-secondary)]">
                If duration is <strong>122 seconds</strong> with a 5s interval: 24 full 5s intervals + 1 final partial 2s interval = <strong>25 images</strong>.
              </p>
            </div>
          </div>
        )}

        {/* Step 4: Visual References */}
        {currentStep === 4 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-indigo-400">
              <ImageIcon className="w-5 h-5" />
              <h3 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>
                Step 4: Prepare Visual References
              </h3>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Reference files allow AI image generators to lock in a specific face, wardrobe, environment architecture, or color grade across dozens of prompts.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-lg glass-card border border-white/5">
                <span className="font-bold text-emerald-400 block mb-1">Style References (e.g. REF-STYLE-01)</span>
                <p className="text-[var(--text-secondary)] text-[11px]">
                  Applied to <strong>All Prompts</strong>. Defines lighting tone, film grain, color grading, and camera sensor parameters.
                </p>
              </div>
              <div className="p-3.5 rounded-lg glass-card border border-white/5">
                <span className="font-bold text-amber-400 block mb-1">Character References (e.g. REF-CHAR-01)</span>
                <p className="text-[var(--text-secondary)] text-[11px]">
                  Applied selectively only to prompts where that specific character appears (e.g. <code>IMG-001, IMG-003, IMG-005</code>).
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Built-in Master Prompt Builder */}
        {currentStep === 5 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-indigo-400">
                <Code2 className="w-5 h-5" />
                <h3 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>
                  Step 5: Built-in Master Prompt Builder
                </h3>
              </div>
              <button
                onClick={handleCopyPrompt}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition-all"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied to Clipboard!' : 'Copy Master Prompt'}</span>
              </button>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Configure parameters below to produce a master prompt. Copy it, open ChatGPT or Gemini, attach your script <code>.txt</code> file, and paste this prompt.
            </p>

            {/* Config inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">Project Name</label>
                <input
                  type="text"
                  value={builderProjectName}
                  onChange={(e) => setBuilderProjectName(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-md glass-card outline-none text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">Duration (s)</label>
                <input
                  type="number"
                  value={builderDuration}
                  onChange={(e) => setBuilderDuration(parseInt(e.target.value, 10) || 30)}
                  className="w-full px-2.5 py-1.5 rounded-md glass-card outline-none text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1">Interval (s)</label>
                <input
                  type="number"
                  value={builderInterval}
                  onChange={(e) => setBuilderInterval(parseInt(e.target.value, 10) || 5)}
                  className="w-full px-2.5 py-1.5 rounded-md glass-card outline-none text-xs"
                />
              </div>
            </div>

            {/* Rendered copyable box */}
            <div className="relative">
              <pre
                className="p-4 rounded-xl font-mono text-[11px] leading-relaxed overflow-x-auto max-h-72 select-all bg-black/40 border border-white/10"
                style={{ color: '#E2E8F0' }}
              >
                {generatedMasterPrompt}
              </pre>
            </div>
          </div>
        )}

        {/* Step 6: Import Bundle */}
        {currentStep === 6 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-indigo-400">
              <Upload className="w-5 h-5" />
              <h3 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>
                Step 6: Import & Validate the JSON Bundle
              </h3>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              When your AI outputs the JSON response, save it as <code>prompt-bundle.json</code> and import it into the Prompt Bundle Manager.
            </p>

            <div className="p-4 rounded-xl bg-black/20 border border-white/5 space-y-2 text-xs">
              <span className="font-semibold text-indigo-300">Automated Schema Validation Checks:</span>
              <ul className="list-disc list-inside space-y-1 text-[var(--text-secondary)]">
                <li>Unique, non-empty Prompt IDs (e.g. <code>IMG-001</code>).</li>
                <li>Sequential ordering starting from 1 with no gaps.</li>
                <li>Non-empty descriptive visual prompt text.</li>
                <li>Valid non-overlapping startSeconds and endSeconds.</li>
                <li>Unknown reference ID resolution against your library.</li>
              </ul>
            </div>

            <button
              onClick={() => setActivePage('bundle')}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
            >
              Open Prompt Bundle Manager
            </button>
          </div>
        )}

        {/* Step 7: Run & Review */}
        {currentStep === 7 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-emerald-400">
              <PlayCircle className="w-5 h-5" />
              <h3 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>
                Step 7: Run Queue & Inspect Results
              </h3>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Start the run in the Run Monitor. The queue will process one prompt at a time:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-lg glass-card">
                <span className="font-bold text-emerald-400 block mb-1">1. Visible Download</span>
                <p className="text-[var(--text-secondary)] text-[11px]">
                  Activates the provider&apos;s visible download action and saves as <code>IMG-001.png</code>.
                </p>
              </div>
              <div className="p-3 rounded-lg glass-card">
                <span className="font-bold text-amber-400 block mb-1">2. Review Queue</span>
                <p className="text-[var(--text-secondary)] text-[11px]">
                  Ambiguous results are sent to Review Center without blind regeneration.
                </p>
              </div>
              <div className="p-3 rounded-lg glass-card">
                <span className="font-bold text-indigo-400 block mb-1">3. Offline HTML Report</span>
                <p className="text-[var(--text-secondary)] text-[11px]">
                  A self-contained HTML report with timings, files, and metrics is generated.
                </p>
              </div>
            </div>

            <button
              onClick={() => setActivePage('monitor')}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
            >
              Go to Run Monitor
            </button>
          </div>
        )}

        {/* Step Navigation Footer */}
        <div className="flex items-center justify-between pt-4 border-t" style={{ borderColor: 'var(--surface-border)' }}>
          <button
            onClick={() => setCurrentStep((s) => Math.max(1, s - 1))}
            disabled={currentStep === 1}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-white/10 disabled:opacity-30"
            style={{
              backgroundColor: 'var(--surface-elevated)',
              border: '1px solid var(--surface-border)',
              color: 'var(--text-primary)',
            }}
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Previous Step</span>
          </button>

          <button
            onClick={() => setCurrentStep((s) => Math.min(7, s + 1))}
            disabled={currentStep === 7}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-30"
          >
            <span>Next Step</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
