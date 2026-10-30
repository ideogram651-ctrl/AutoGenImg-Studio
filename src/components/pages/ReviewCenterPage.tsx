import React from 'react';
import {
  AlertTriangle,
  RotateCcw,
  Download,
  CheckCircle,
  SkipForward,
  CheckCircle2,
  FileQuestion,
  Sparkles,
  Layers,
} from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';

export function ReviewCenterPage() {
  const { manifest, regeneratePrompt, retryDownload, markReviewed, skipItem } = useApp();

  const reviewItems = (manifest?.items || []).filter(
    (item) => item.status === 'NEEDS_REVIEW' || item.status === 'FAILED'
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 rounded-xl glass-panel" style={{ borderColor: 'var(--surface-border)' }}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              <h2 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                Review Center & Exception Resolution
              </h2>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Uncertain generations and download anomalies are placed here without blind regeneration. Decide how each item should be handled.
            </p>
          </div>

          <div className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            {reviewItems.length} Item(s) Requiring Attention
          </div>
        </div>
      </div>

      {/* Review Items List */}
      {reviewItems.length > 0 ? (
        <div className="space-y-4">
          {reviewItems.map((item) => (
            <div
              key={item.id}
              className="p-5 rounded-xl border glass-panel space-y-4"
              style={{ borderColor: 'var(--surface-border)' }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2.5 mb-1">
                    <span className="font-mono text-xs font-bold text-indigo-400">
                      {item.id}
                    </span>
                    <span className="text-[11px] text-[var(--text-secondary)]">
                      Sequence #{item.sequence} &bull; Attempt #{item.attempts}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        item.status === 'NEEDS_REVIEW'
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                  <p className="text-xs font-medium leading-relaxed max-w-3xl" style={{ color: 'var(--text-primary)' }}>
                    {item.prompt}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => retryDownload(item.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                    title="Retry visible download if image already exists in chat without generating new image"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Retry Download</span>
                  </button>

                  <button
                    onClick={() => regeneratePrompt(item.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-600 hover:bg-amber-500 text-white transition-colors"
                    title="Explicitly submit a fresh generation request"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Request New Generation</span>
                  </button>

                  <button
                    onClick={() => markReviewed(item.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-white/10 transition-colors"
                    style={{
                      backgroundColor: 'var(--surface-elevated)',
                      border: '1px solid var(--surface-border)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Mark Reviewed</span>
                  </button>

                  <button
                    onClick={() => skipItem(item.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-white/10 text-[var(--text-secondary)]"
                  >
                    <SkipForward className="w-3.5 h-3.5" />
                    <span>Skip</span>
                  </button>
                </div>
              </div>

              {/* Diagnostic Review Reason Box */}
              <div className="p-3.5 rounded-lg bg-black/25 border border-white/5 space-y-1.5 text-xs">
                <div className="flex items-center gap-2 text-amber-400 font-semibold">
                  <FileQuestion className="w-4 h-4 shrink-0" />
                  <span>Reason for Review: {item.reviewReason || 'Ambiguous outcome detected.'}</span>
                </div>
                {item.suggestedAction && (
                  <p className="text-[11px] text-[var(--text-secondary)] pl-6">
                    <strong>Suggested Action:</strong> {item.suggestedAction}
                  </p>
                )}
                {item.outputFile && (
                  <p className="text-[11px] text-sky-400 font-mono pl-6">
                    Associated file: {item.outputFile}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-16 rounded-xl text-center glass-panel" style={{ borderColor: 'var(--surface-border)' }}>
          <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3 opacity-80" />
          <h3 className="text-base font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
            Review Queue Clean &mdash; No Exceptions
          </h3>
          <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
            All processed prompts have either verified output files saved to disk or haven&apos;t run yet. Any ambiguous generations or download hiccups will safely appear here for deliberate resolution.
          </p>
        </div>
      )}
    </div>
  );
}
