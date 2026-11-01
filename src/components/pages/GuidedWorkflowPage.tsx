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
  ExternalLink,
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
      <div className="panel">
        <div className="heading">
          <div>
            <div className="row">
              <BookOpen className="icon" />
              <h2>Beginner&apos;s Guided Workflow: Script to Prompt Bundle</h2>
            </div>
            <p className="muted">
              Follow these 7 steps to prepare your script, structure your prompts, and configure automated generation.
            </p>
          </div>
          <div className="actions">
            <button
              onClick={() => setCurrentStep((s) => Math.max(1, s - 1))}
              disabled={currentStep === 1}
              className="btn"
              aria-label="Previous step"
            >
              <ChevronLeft className="icon" />
            </button>
            <span className="font-semibold muted">Step {currentStep} of 7</span>
            <button
              onClick={() => setCurrentStep((s) => Math.min(7, s + 1))}
              disabled={currentStep === 7}
              className="btn"
              aria-label="Next step"
            >
              <ChevronRight className="icon" />
            </button>
          </div>
        </div>

        {/* Step Progress Bar */}
        <div className="stages">
          {steps.map((st) => (
            <button
              key={st.num}
              onClick={() => setCurrentStep(st.num)}
              className={`stage ${currentStep === st.num ? 'active' : currentStep > st.num ? 'completed' : 'pending'}`}
            >
              <div className="text-[9px] font-mono uppercase opacity-70">Step {st.num}</div>
              <div className="font-semibold truncate hidden sm:block">{st.title}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <div className="panel">
        {/* Step 1: Prepare Script */}
        {currentStep === 1 && (
          <div className="space-y-4">
            <div className="row between">
              <div className="row">
                <FileText className="icon" />
                <h3>Step 1: Prepare Your Video Script as Plain Text</h3>
              </div>
              <span className="badge green">
                <Sparkles className="icon" aria-hidden="true" />
                Best Practice
              </span>
            </div>
            <p className="muted">
              Have your video narration, voiceover, or screen action formatted in a clean plain-text <code>.txt</code> file. The AI prompt engineer will analyze this text to partition it into logical scene beats.
            </p>

            <div className="notice green">
              <span className="font-semibold text-emerald-300 mb-1">
                Best Practice:
              </span>
              <ul className="list-disc list-inside space-y-1 text-xs text-muted">
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
            <div className="row between">
              <div className="row">
                <Palette className="icon" />
                <h3>Step 2: Select a Visual Direction</h3>
              </div>
              <span className="badge amber">
                <Sparkles className="icon" aria-hidden="true" />
                Style Direction
              </span>
            </div>
            <p className="muted">
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
              ].map((style, idx) => (
                <div key={idx} className="style-choice">
                  <h4>{style.title}</h4>
                  <small className="muted">{style.tag}</small>
                  <p className="muted">{style.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Image Plan Math */}
        {currentStep === 3 && (
          <div className="space-y-4">
            <div className="row between">
              <div className="row">
                <Calculator className="icon" />
                <h3>Step 3: Define Image Timing &amp; Plan Calculations</h3>
              </div>
              <span className="badge indigo-text">
                <Sparkles className="icon" aria-hidden="true" />
                Plan Math
              </span>
            </div>
            <p className="muted">
              Specify your video duration and pacing interval. The application uses transparent ceiling arithmetic to ensure every second of footage is covered by a visual scene.
            </p>

            <div className="notice indigo">
              <span className="font-semibold text-indigo-300 mb-1">
                Rule:
              </span>
              <code>Total Images = Math.ceil(durationSeconds / intervalSeconds)</code>
            </div>

            <p>
              For example: A <strong>120-second</strong> video with an image every <strong>5 seconds</strong> requires exactly <strong>24 images</strong> (IMG-001 to IMG-024).
            </p>
            <p>
              If duration is <strong>122 seconds</strong> with a 5s interval: 24 full 5s intervals + 1 final partial 2s interval = <strong>25 images</strong>.
            </p>

            <div className="three">
              <div className="field">
                <div className="label">Duration (Seconds)</div>
                <input type="number" className="input" value={builderDuration} onChange={(e) => setBuilderDuration(Number(e.target.value) || 0)} />
              </div>
              <div className="field">
                <div className="label">Interval (Seconds)</div>
                <input type="number" className="input" value={builderInterval} onChange={(e) => setBuilderInterval(Number(e.target.value) || 5)} />
              </div>
              <div className="field">
                <div className="label">Aspect Ratio</div>
                <select className="select input" value={builderAspectRatio} onChange={(e) => setBuilderAspectRatio(e.target.value)}>
                  <option value="16:9">16:9</option>
                  <option value="9:16">9:16</option>
                  <option value="1:1">1:1</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Reference Files */}
        {currentStep === 4 && (
          <div className="space-y-4">
            <div className="row between">
              <div className="row">
                <ImageIcon className="icon" />
                <h3>Step 4: Prepare Visual References</h3>
              </div>
              <span className="badge amber">
                <Sparkles className="icon" aria-hidden="true" />
                References
              </span>
            </div>
            <p className="muted">
              Reference files allow AI image generators to lock in a specific face, wardrobe, environment architecture, or color grade across dozens of prompts.
            </p>

            <div className="two">
              <div className="notice green">
                <svg aria-hidden="true" className="icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.65" viewBox="0 0 24 24">
                  <path d="M12 8v5 M12 17h.01 M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18" />
                </svg>
                <div>
                  <b className="indigo-text">Style References</b>
                  <p>Applied to All Prompts. Defines lighting tone, film grain, color grading, and camera sensor parameters.</p>
                </div>
              </div>
              <div className="notice amber">
                <svg aria-hidden="true" className="icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.65" viewBox="0 0 24 24">
                  <path d="M12 8v5 M12 17h.01 M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18" />
                </svg>
                <div>
                  <b className="indigo-text">Character References</b>
                  <p>Applied selectively only to prompts where that specific character appears.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Master Prompt Builder */}
        {currentStep === 5 && (
          <div className="space-y-4">
            <div className="row between">
              <h3>Step 5: Built-in Master Prompt Builder</h3>
              <button
                onClick={handleCopyPrompt}
                className="btn"
                disabled={copied}
              >
                <Copy className="icon" />
                <span>{copied ? 'Copied!' : 'Copy Master Prompt'}</span>
              </button>
            </div>
            <p className="muted">
              Configure parameters below to produce a master prompt. Copy it, open ChatGPT or Gemini, attach your script <code>.txt</code> file, and paste this prompt.
            </p>

            <div className="three">
              <div className="field">
                <div className="label">Project Name</div>
                <input type="text" className="input" value={builderProjectName} onChange={(e) => setBuilderProjectName(e.target.value)} />
              </div>
              <div className="field">
                <div className="label">Duration (s)</div>
                <input type="number" className="input" value={builderDuration} onChange={(e) => setBuilderDuration(Number(e.target.value) || 120)} />
              </div>
              <div className="field">
                <div className="label">Interval (s)</div>
                <input type="number" className="input" value={builderInterval} onChange={(e) => setBuilderInterval(Number(e.target.value) || 5)} />
              </div>
            </div>

            <pre className="code-display">{generatedMasterPrompt}</pre>
          </div>
        )}

        {/* Step 6: Import Bundle */}
        {currentStep === 6 && (
          <div className="space-y-4">
            <div className="row between">
              <div className="row">
                <Upload className="icon" />
                <h3>Step 6: Import &amp; Validate the JSON Bundle</h3>
              </div>
              <span className="badge indigo-text">
                <Sparkles className="icon" aria-hidden="true" />
                Import
              </span>
            </div>
            <p className="muted">
              When your AI outputs the JSON response, save it as <code>prompt-bundle.json</code> and import it into the Prompt Bundle Manager.
            </p>

            <div className="notice indigo">
              <span className="font-semibold text-indigo-300 mb-1">
                Automated Schema Validation Checks:
              </span>
              <ul className="list-disc list-inside space-y-1 text-xs text-muted">
                <li>Unique, non-empty Prompt IDs (e.g. <code>IMG-001</code>).</li>
                <li>Sequential ordering starting from 1 with no gaps.</li>
                <li>Non-empty descriptive visual prompt text.</li>
                <li>Valid non-overlapping startSeconds and endSeconds.</li>
                <li>Unknown reference ID resolution against your library.</li>
              </ul>
            </div>

            <div className="actions" style={{ marginTop: 18 }}>
              <a className="btn primary" href="#bundle">
                <Upload className="icon" />
                <span>Open Prompt Bundle Manager</span>
              </a>
            </div>
          </div>
        )}

        {/* Step 7: Run & Review */}
        {currentStep === 7 && (
          <div className="space-y-4">
            <div className="row between">
              <div className="row">
                <PlayCircle className="icon" />
                <h3>Step 7: Run Queue &amp; Inspect Results</h3>
              </div>
              <span className="badge green">
                <Sparkles className="icon" aria-hidden="true" />
                Execute
              </span>
            </div>
            <p className="muted">
              Start the run in the Run Monitor. The queue will process one prompt at a time:
            </p>

            <div className="three">
              <div className="card">
                <h4>1. Visible Download</h4>
                <p className="muted">Activates the provider&apos;s visible download action and saves as IMG-001.png.</p>
              </div>
              <div className="card">
                <h4>2. Review Queue</h4>
                <p className="muted">Ambiguous results are sent to Review Center without blind regeneration.</p>
              </div>
              <div className="card">
                <h4>3. Offline HTML Report</h4>
                <p className="muted">A self-contained HTML report with timings, files, and metrics is generated.</p>
              </div>
            </div>

            <div className="actions" style={{ marginTop: 18 }}>
              <a className="btn primary" href="#monitor">
                <ExternalLink className="icon" />
                <span>Go to Run Monitor</span>
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Step Navigation Footer */}
      <div className="row between" style={{ borderTop: '1px solid var(--color-border)', paddingTop: 24 }}>
        <button
          onClick={() => setCurrentStep((s) => Math.max(1, s - 1))}
          disabled={currentStep === 1}
          className="btn quiet icon-only"
          aria-label="Previous step"
        >
          <ChevronLeft className="icon" />
          <span>Previous Step</span>
        </button>
        <button
          onClick={() => setCurrentStep((s) => Math.min(7, s + 1))}
          disabled={currentStep === 7}
          className="btn primary"
        >
          <span>Next Step</span>
          <ChevronRight className="icon" />
        </button>
      </div>
    </div>
  );
}
