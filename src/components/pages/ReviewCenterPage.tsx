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
    <div className="stack">
      {/* Header */}
      <div className="panel">
        <div className="heading">
          <div className="row between">
            <div>
              <div className="row">
                <AlertTriangle className="icon" />
                <h2>Review Center & Exception Resolution</h2>
              </div>
              <p className="muted">
                Uncertain generations and download anomalies are placed here without blind regeneration. Decide how each item should be handled.
              </p>
            </div>
            <div className="actions">
              <span className="badge amber">
                {reviewItems.length} Item(s) Requiring Attention
              </span>
            </div>
          </div>
        </div>

        {/* Review Items List */}
        {reviewItems.length > 0 ? (
          <div className="stack">
            {reviewItems.map((item) => (
              <div key={item.id} className="card">
                <div className="row between">
                  <div className="row">
                    <div className="mono indigo-text">{item.id}</div>
                    <div className="space-y-1">
                      <span className="muted text-xs">Sequence #{item.sequence} &bull; Attempt #{item.attempts}</span>
                    </div>
                  </div>
                  <div className="actions">
                    <span className={`badge ${item.status === 'NEEDS_REVIEW' ? 'amber' : 'red'}`}>
                      {item.status}
                    </span>
                  </div>
                </div>
                <p className="muted leading-relaxed mt-2">{item.prompt}</p>

                {/* Actions */}
                <div className="actions">
                  <button
                    onClick={() => retryDownload(item.id)}
                    className="btn"
                    title="Retry visible download if image already exists in chat without generating new image"
                  >
                    <Download className="icon" />
                    <span>Retry Download</span>
                  </button>

                  <button
                    onClick={() => regeneratePrompt(item.id)}
                    className="btn"
                    title="Explicitly submit a fresh generation request"
                  >
                    <RotateCcw className="icon" />
                    <span>Request New Generation</span>
                  </button>

                  <button
                    onClick={() => markReviewed(item.id)}
                    className="btn quiet icon-only"
                  >
                    <CheckCircle className="icon" />
                  </button>

                  <button
                    onClick={() => skipItem(item.id)}
                    className="btn quiet icon-only"
                  >
                    <SkipForward className="icon" />
                  </button>
                </div>

                {/* Diagnostic Review Reason Box */}
                <div className="notice amber">
                  <FileQuestion className="icon" />
                  <div>
                    <span className="font-semibold text-amber-300">Reason for Review:</span>
                    {item.reviewReason || 'Ambiguous outcome detected.'}
                  </div>
                </div>
                {item.suggestedAction && (
                  <div className="space-y-1 mt-2">
                    <span className="muted text-xs">Suggested Action:</span>
                    <span className="muted">{item.suggestedAction}</span>
                  </div>
                )}
                {item.outputFile && (
                  <div className="space-y-1 mt-2">
                    <span className="muted text-xs">Associated File:</span>
                    <span className="mono muted">{item.outputFile}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="card">
            <div className="empty">
              <div className="big-icon">
                <CheckCircle2 className="icon" />
              </div>
              <h3>Review Queue Clean &mdash; No Exceptions</h3>
              <p className="muted">
                All processed prompts have either verified output files saved to disk or haven&apos;t run yet. Any ambiguous generations or download hiccups will safely appear here for deliberate resolution.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ReviewCenterPage;
