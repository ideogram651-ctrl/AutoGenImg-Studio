import React, { useState } from 'react';
import {
  Layers,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Search,
  FileCode,
  ArrowRight,
  Clock,
  AlertCircle,
  Edit2,
  Trash2,
  Save,
  X,
  RotateCcw,
  Code,
  Code2,
  Eye,
  Edit,
  Copy,
  Maximize,
} from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { validatePromptBundle } from '../../server/validator.ts';
import { ValidationError, PromptItem, ReferenceFile } from '../../types/index.ts';

export function BundleManagerPage() {
  const { currentBundle, currentReferences, updateBundle, updateReferences, setActivePage } = useApp();

  const [jsonInput, setJsonInput] = useState('');
  const [showJsonModal, setShowJsonModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [isValidated, setIsValidated] = useState(false);
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [editedPromptText, setEditedPromptText] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [showViewJson, setShowViewJson] = useState(false);
  const [showEditJson, setShowEditJson] = useState(false);
  const [jsonContent, setJsonContent] = useState('');
  const [editedJsonContent, setEditedJsonContent] = useState('');
  const [jsonEditError, setJsonEditError] = useState<string | null>(null);
  const [jsonSaving, setJsonSaving] = useState(false);

  // Validate active bundle on load or change
  React.useEffect(() => {
    if (currentBundle) {
      const res = validatePromptBundle(currentBundle, currentReferences);
      setValidationErrors(res.errors);
      setIsValidated(true);
    }
  }, [currentBundle, currentReferences]);

  const handleImportText = () => {
    try {
      const parsed = JSON.parse(jsonInput);
      const res = validatePromptBundle(parsed, currentReferences);
      setValidationErrors(res.errors);
      setIsValidated(true);

      if (res.valid) {
        updateBundle(parsed);
        setShowJsonModal(false);
        setJsonInput('');
      }
    } catch (err: any) {
      setValidationErrors([
        { message: `Invalid JSON syntax: ${err.message}`, severity: 'error' },
      ]);
      setIsValidated(true);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        const res = validatePromptBundle(parsed, currentReferences);
        setValidationErrors(res.errors);
        setIsValidated(true);
        if (res.valid) {
          updateBundle(parsed);
        }
      } catch (err: any) {
        setValidationErrors([
          { message: `Failed to parse file "${file.name}": ${err.message}`, severity: 'error' },
        ]);
        setIsValidated(true);
      }
    };
    reader.readAsText(file);
  };

  const handleEditPrompt = (prompt: PromptItem) => {
    setEditingPromptId(prompt.id);
    setEditedPromptText(prompt.prompt);
    setEditError(null);
  };

  const handleCancelEdit = () => {
    setEditingPromptId(null);
    setEditedPromptText('');
    setEditError(null);
  };

  const handleSaveEdit = async () => {
    if (!currentBundle) return;
    setEditError(null);

    const trimmed = editedPromptText.trim();
    if (!trimmed) {
      setEditError('Prompt text cannot be empty.');
      return;
    }

    // Build updated bundle with the modified prompt
    const updatedPrompts = currentBundle.prompts.map((p) =>
      p.id === editingPromptId ? { ...p, prompt: trimmed } : p
    );
    const updatedBundle: typeof currentBundle = {
      ...currentBundle,
      prompts: updatedPrompts,
    };

    // Validate before saving
    const res = validatePromptBundle(updatedBundle, currentReferences);
    setValidationErrors(res.errors);
    setIsValidated(true);

    if (!res.valid) {
      const blocking = res.errors.filter((e) => e.severity === 'error');
      if (blocking.length > 0) {
        setEditError(blocking[0].message || 'Validation failed. Changes not saved.');
        return;
      }
    }

    try {
      await updateBundle(updatedBundle);
      setEditingPromptId(null);
      setEditedPromptText('');
      setEditError(null);
    } catch (err: any) {
      setEditError(err.message || 'Failed to save prompt changes.');
    }
  };

  const handleRemoveReferenceFromPrompt = async (promptId: string, refId: string) => {
    if (!currentBundle) return;

    // Remove the reference ID from the prompt's referenceIds
    const updatedPrompts = currentBundle.prompts.map((p) =>
      p.id === promptId
        ? { ...p, referenceIds: (p.referenceIds || []).filter((id) => id !== refId) }
        : p
    );
    const updatedBundle: typeof currentBundle = {
      ...currentBundle,
      prompts: updatedPrompts,
    };

    // Also remove the reference from currentReferences if it's no longer used by any prompt
    const refStillUsed = updatedPrompts.some((p) =>
      (p.referenceIds || []).includes(refId)
    );

    try {
      await updateBundle(updatedBundle);

      if (!refStillUsed) {
        // Remove the reference record entirely from the project
        const updatedRefs = currentReferences.filter((r) => r.id !== refId);
        await updateReferences(updatedRefs);
      }

      // Re-validate
      const res = validatePromptBundle(updatedBundle, currentReferences);
      setValidationErrors(res.errors);
      setIsValidated(true);
    } catch (err: any) {
      setEditError(err.message || 'Failed to remove reference.');
    }
  };

  const handleViewJson = async () => {
    if (!currentBundle) return;
    try {
      const res = await fetch('/api/bundle/json');
      const data = await res.json();
      if (res.ok && data.success) {
        setJsonContent(data.content);
        setShowViewJson(true);
      } else {
        setEditError(data.error || 'Failed to load bundle JSON.');
      }
    } catch (err: any) {
      setEditError(err.message || 'Failed to load bundle JSON.');
    }
  };

  const handleEditJson = async () => {
    if (!currentBundle) return;
    try {
      const res = await fetch('/api/bundle/json');
      const data = await res.json();
      if (res.ok && data.success) {
        setEditedJsonContent(data.content);
        setJsonEditError(null);
        setShowEditJson(true);
      } else {
        setEditError(data.error || 'Failed to load bundle JSON.');
      }
    } catch (err: any) {
      setEditError(err.message || 'Failed to load bundle JSON.');
    }
  };

  const handleSaveEditedJson = async () => {
    if (!editedJsonContent.trim()) {
      setJsonEditError('JSON content cannot be empty.');
      return;
    }

    setJsonSaving(true);
    setJsonEditError(null);

    try {
      const res = await fetch('/api/bundle/save-json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editedJsonContent }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setJsonEditError(data.error || 'Failed to save JSON.');
        setJsonSaving(false);
        return;
      }

      setShowEditJson(false);
      setEditedJsonContent('');
      setJsonSaving(false);

      // Reconcile Reference Manager assignments with edited JSON referenceIds.
      // Derive each reference's assignment scope from the bundle's per-prompt
      // referenceIds so that Reference Manager and JSON stay consistent.
      try {
        const parsedBundle = JSON.parse(editedJsonContent);
        const updatedRefs = currentReferences.map((ref) => {
          const promptingPrompts: string[] = (parsedBundle.prompts || [])
            .filter((p: any) => p.referenceIds && p.referenceIds.includes(ref.id))
            .map((p: any) => p.id);
          const allPromptIds: string[] = (parsedBundle.prompts || []).map((p: any) => p.id);
          const isAssignedToAll = promptingPrompts.length === allPromptIds.length && allPromptIds.length > 0;
          return {
            ...ref,
            assignedMode: isAssignedToAll ? 'all' : 'selected',
            assignedPromptIds: isAssignedToAll ? [] : promptingPrompts,
          } as ReferenceFile;
        });
        await updateReferences(updatedRefs);
      } catch {
        // Non-fatal: reference reconciliation failure doesn't block JSON save
      }

      // Refresh validation from current state
      const res2 = await fetch('/api/bundle/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundle: JSON.parse(editedJsonContent), references: currentReferences }),
      });
      const valData = await res2.json();
      setValidationErrors(valData.errors || []);
      setIsValidated(true);
    } catch (err: any) {
      setJsonEditError(err.message || 'Failed to save JSON.');
      setJsonSaving(false);
    }
  };

  const handleCancelEditJson = () => {
    setShowEditJson(false);
    setEditedJsonContent('');
    setJsonEditError(null);
  };

  const prompts = currentBundle?.prompts || [];
  const filteredPrompts = prompts.filter((p) => {
    const q = searchQuery.toLowerCase();
    return p.id.toLowerCase().includes(q) || p.prompt.toLowerCase().includes(q);
  });

  const blockingErrors = validationErrors.filter((e) => e.severity === 'error');
  const warnings = validationErrors.filter((e) => e.severity === 'warning');

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="p-6 rounded-xl glass-panel" style={{ borderColor: 'var(--surface-border)' }}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Layers className="w-5 h-5 text-indigo-400" />
              <h2 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                Prompt Bundle Manager
              </h2>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Validate, inspect sequence, and review the effective prompt queue for the active project.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {currentBundle && (
              <>
                <button
                  onClick={handleViewJson}
                  disabled={!currentBundle}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/15 transition-colors"
                  title="View Bundle JSON"
                  aria-label="View Bundle JSON"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>View JSON</span>
                </button>

                <button
                  onClick={handleEditJson}
                  disabled={!currentBundle}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/15 transition-colors"
                  title="Edit Bundle JSON"
                  aria-label="Edit Bundle JSON"
                >
                  <Edit className="w-3.5 h-3.5" />
                  <span>Edit JSON</span>
                </button>
              </>
            )}
            <label className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/15 cursor-pointer transition-colors">
              <Upload className="w-3.5 h-3.5" />
              <span>Import .JSON File</span>
              <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
            </label>

            <button
              onClick={() => setShowJsonModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/15 transition-colors"
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>Paste JSON</span>
            </button>
          </div>
        </div>

        {/* Validation Status Banner */}
        {isValidated && (
          <div className="mt-4 pt-4 border-t space-y-2" style={{ borderColor: 'var(--surface-border)' }}>
            {blockingErrors.length === 0 ? (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>
                    Validation Passed: Schema 1.0 compliant. {prompts.length} prompts ready for processing.
                  </span>
                </div>
                <button
                  onClick={() => setActivePage('references')}
                  className="font-semibold underline flex items-center gap-1"
                >
                  <span>Assign References</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 space-y-1.5">
                <div className="flex items-center gap-2 font-bold">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{blockingErrors.length} Blocking Validation Error(s) Detected:</span>
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-[11px] pl-2">
                  {blockingErrors.map((err, i) => (
                    <li key={i}>
                      {err.promptId && <strong>[{err.promptId}] </strong>}
                      {err.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {warnings.length > 0 && (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400 space-y-1">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{warnings.length} Non-Blocking Warning(s):</span>
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-[11px] pl-2">
                  {warnings.map((w, i) => (
                    <li key={i}>
                      {w.promptId && <strong>[{w.promptId}] </strong>}
                      {w.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Prompts Inspection List */}
      <div className="p-6 rounded-xl glass-panel space-y-4" style={{ borderColor: 'var(--surface-border)' }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
              Deterministic Prompt Sequence
            </h3>
            <span className="text-xs text-[var(--text-secondary)]">
              ({filteredPrompts.length} of {prompts.length} prompts)
            </span>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[var(--text-secondary)] absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search prompt ID or text..."
              className="pl-8 pr-3 py-1.5 rounded-lg text-xs glass-card outline-none w-64 focus:ring-1 focus:ring-indigo-500"
              style={{ color: 'var(--text-primary)' }}
            />
          </div>
        </div>

        {filteredPrompts.length > 0 ? (
          <div className="space-y-2.5">
            {filteredPrompts.map((p) => {
              const isEditing = editingPromptId === p.id;
              return (
                <div
                  key={p.id}
                  className="p-3.5 rounded-lg border glass-card hover:border-indigo-500/30 transition-colors"
                  style={{ borderColor: 'var(--surface-border)' }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2.5">
                      <span className="w-6 h-6 rounded flex items-center justify-center text-[11px] font-bold bg-white/10 text-[var(--text-secondary)]">
                        {p.sequence}
                      </span>
                      <strong className="text-xs font-mono text-indigo-400">
                        {p.id}
                      </strong>
                      {p.startSeconds !== undefined && p.endSeconds !== undefined && (
                        <span className="flex items-center gap-1 text-[11px] text-[var(--text-secondary)]">
                          <Clock className="w-3 h-3" />
                          <span>{p.startSeconds}s &ndash; {p.endSeconds}s</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      {p.referenceIds && p.referenceIds.length > 0 && (
                        <div className="flex items-center gap-1">
                          {p.referenceIds.map((refId) => (
                            <span
                              key={refId}
                              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-indigo-500/10 text-indigo-300 border border-indigo-500/20"
                            >
                              {refId}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveReferenceFromPrompt(p.id, refId);
                                }}
                                className="p-1 text-[var(--text-secondary)] hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
                                title={`Remove ${refId} from this prompt`}
                                aria-label={`Remove reference ${refId} from ${p.id}`}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}

                      {!isEditing && (
                        <button
                          onClick={() => handleEditPrompt(p)}
                          className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-indigo-400 hover:bg-white/5 transition-colors"
                          title="Edit prompt"
                          aria-label={`Edit prompt ${p.id}`}
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                      )}

                      {isEditing && (
                        <>
                          <button
                            onClick={handleSaveEdit}
                            className="p-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
                            title="Save changes"
                          >
                            <Save className="w-3 h-3" />
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                            title="Cancel"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {isEditing ? (
                    <>
                      <textarea
                        value={editedPromptText}
                        onChange={(e) => setEditedPromptText(e.target.value)}
                        rows={3}
                        className="w-full p-2 rounded-lg text-xs font-mono glass-card outline-none focus:ring-1 focus:ring-indigo-500 mb-2"
                        style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-secondary)' }}
                        autoFocus
                      />
                      {editError && (
                        <p className="text-[10px] text-rose-400 mb-2">{editError}</p>
                      )}
                      <div className="text-[10px] text-[var(--text-secondary)]">
                        Editing prompt <strong>{p.id}</strong> (sequence {p.sequence})
                      </div>
                    </>
                  ) : (
                    <p className="text-xs leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                      {p.prompt}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16 text-xs text-[var(--text-secondary)]">
            No prompts found in current project. Click &quot;Import .JSON File&quot; or &quot;Paste JSON&quot; to load your prompt bundle.
          </div>
        )}
      </div>

      {/* Paste JSON Modal */}
      {showJsonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-2xl p-6 rounded-xl glass-panel space-y-4" style={{ borderColor: 'var(--surface-border)' }}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                Paste JSON Prompt Bundle
              </h3>
              <button onClick={() => setShowJsonModal(false)} className="text-xs text-[var(--text-secondary)] hover:text-white">
                Cancel
              </button>
            </div>
            <textarea
              rows={12}
              value={jsonInput}
              onChange={(e) => setJsonInput(e.target.value)}
              placeholder='{\n  "schemaVersion": "1.0",\n  "project": { "name": "Video" },\n  "prompts": [...] \n}'
              className="w-full p-3 rounded-lg text-xs font-mono glass-card outline-none"
              style={{ color: 'var(--text-primary)' }}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowJsonModal(false)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium hover:bg-white/10"
              >
                Close
              </button>
              <button
                onClick={handleImportText}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white"
              >
                Validate & Import
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View JSON Modal */}
      {showViewJson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-xl glass-panel" style={{ borderColor: 'var(--surface-border)' }}>
            <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--surface-border)' }}>
              <div className="flex items-center gap-2">
                <Code className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>View Bundle JSON</h3>
              </div>
              <button onClick={() => setShowViewJson(false)} className="text-xs text-[var(--text-secondary)] hover:text-white">
                Close
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-black font-mono text-xs leading-relaxed">
              <pre style={{ color: '#e2e8f0', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>{jsonContent}</pre>
            </div>
          </div>
        </div>
      )}

      {/* Edit JSON Modal */}
      {showEditJson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-4xl h-[85vh] max-h-[90vh] flex flex-col rounded-xl glass-panel" style={{ borderColor: 'var(--surface-border)' }}>
            <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--surface-border)' }}>
              <div className="flex items-center gap-2">
                <Edit className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>Edit Bundle JSON</h3>
              </div>
              <button onClick={handleCancelEditJson} className="text-xs text-[var(--text-secondary)] hover:text-white">
                Cancel
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-auto p-0 bg-black">
              <textarea
                value={editedJsonContent}
                onChange={(e) => setEditedJsonContent(e.target.value)}
                className="w-full h-full p-4 font-mono text-xs leading-relaxed outline-none resize-none"
                style={{ color: '#e2e8f0', backgroundColor: '#000000' }}
                spellCheck={false}
              />
            </div>
            {jsonEditError && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400">
                {jsonEditError}
              </div>
            )}
            <div className="flex justify-end gap-2 p-4 border-t" style={{ borderColor: 'var(--surface-border)' }}>
              <button
                onClick={handleCancelEditJson}
                className="px-3.5 py-2 rounded-lg text-xs font-medium hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEditedJson}
                disabled={jsonSaving}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
              >
                {jsonSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
