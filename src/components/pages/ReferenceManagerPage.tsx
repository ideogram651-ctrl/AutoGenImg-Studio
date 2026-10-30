import React, { useState } from 'react';
import {
  Images,
  Plus,
  Trash2,
  CheckCircle2,
  Tag,
  Layers,
  ArrowRight,
  Sparkles,
  Info,
  AlertTriangle,
  FileText,
  FileImage,
  UploadCloud,
  File,
  Hash,
  Edit2,
  Save,
  X,
  RotateCcw,
  Upload,
  RefreshCw,
} from 'lucide-react';
import { useApp } from '../../context/AppContext.tsx';
import { ReferenceFile, ReferenceCategory } from '../../types/index.ts';
import { SAMPLE_REFERENCES } from '../../utils/sampleData.ts';

type EntryMethod = 'upload' | 'write';

export function ReferenceManagerPage() {
  const { currentReferences, currentBundle, updateReferences, uploadReferenceMedia, setActivePage, referenceCount, uploadProgress } = useApp();

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [entryMethod, setEntryMethod] = useState<EntryMethod>('upload');
  const [refId, setRefId] = useState('');
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState<ReferenceCategory>('character');
  const [mode, setMode] = useState<'all' | 'selected'>('selected');
  const [selectedIdsText, setSelectedIdsText] = useState('IMG-001, IMG-002');
  const [textContent, setTextContent] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Edit reference state
  const [editingRefId, setEditingRefId] = useState<string | null>(null);
  const [editRefData, setEditRefData] = useState<{
    id: string;
    name: string;
    label: string;
    category: ReferenceCategory;
    mode: 'all' | 'selected';
    assignedPromptIds: string[];
    textContent: string;
    file: File | null;
  } | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  const handleOpenAddModal = (initialCategory: ReferenceCategory = 'character') => {
    setEntryMethod('upload');
    setCategory(initialCategory);
    setRefId(`REF-${initialCategory.toUpperCase()}-0${currentReferences.length + 1}`);
    setLabel('');
    setTextContent('');
    setSelectedFile(null);
    setModalError(null);
    setShowAddModal(true);
  };

  const handleSaveReference = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    const cleanId = refId.trim().toUpperCase();
    if (!cleanId || !label.trim()) {
      setModalError('Reference ID and Label are required.');
      return;
    }

    if (currentReferences.some((r) => r.id === cleanId)) {
      setModalError(`A reference with ID "${cleanId}" already exists.`);
      return;
    }

    const parsedPromptIds = selectedIdsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    // Write Text: create a text reference from inline content
    if (entryMethod === 'write') {
      if (!textContent.trim()) {
        setModalError('Please enter some text content.');
        return;
      }

      const newRef: ReferenceFile = {
        id: cleanId,
        name: `${cleanId.toLowerCase()}.txt`,
        category,
        refType: 'text',
        label: label.trim(),
        size: textContent.length,
        type: 'text/plain',
        textContent: textContent.trim(),
        assignedMode: mode,
        assignedPromptIds: mode === 'all' ? [] : parsedPromptIds,
      };

      updateReferences([...currentReferences, newRef]);
      setShowAddModal(false);
      return;
    }

    // Upload Media: unified file input for all supported formats
    if (!selectedFile) {
      setModalError('Please choose a file to upload.');
      return;
    }

    // Enforce max reference count (P-001: max 20 unique active references)
    const maxRefs = referenceCount?.max || 20;
    if (currentReferences.length >= maxRefs) {
      setModalError(`Maximum ${maxRefs} references reached. Remove an existing reference before adding a new one.`);
      return;
    }

    setUploading(true);
    const uploaded = await uploadReferenceMedia(selectedFile, {
      refId: cleanId,
      label: label.trim(),
      category,
      mode,
      assignedPromptIds: mode === 'all' ? [] : parsedPromptIds,
    });
    setUploading(false);

    if (!uploaded.success) {
      setModalError(uploaded.error || 'Upload failed. Verify server connection and file format.');
      return;
    }
    setShowAddModal(false);
  };

  const handleDelete = (id: string) => {
    updateReferences(currentReferences.filter((r) => r.id !== id));
  };

  const handleEditRef = (ref: ReferenceFile) => {
    setEditRefData({
      id: ref.id,
      name: ref.name,
      label: ref.label,
      category: ref.category || 'custom',
      mode: ref.assignedMode,
      assignedPromptIds: ref.assignedPromptIds || [],
      textContent: ref.textContent || '',
      file: null,
    });
    setEditingRefId(ref.id);
    setEditError(null);
    setShowEditModal(true);
  };

  const handleCancelEditRef = () => {
    setShowEditModal(false);
    setEditingRefId(null);
    setEditRefData(null);
    setEditError(null);
  };

  const handleSaveEditRef = async () => {
    if (!editRefData || !currentReferences) return;
    setEditError(null);

    const cleanId = editRefData.id.trim().toUpperCase();
    if (!cleanId || !editRefData.label.trim()) {
      setEditError('Reference ID and Label are required.');
      return;
    }

    // Check for duplicate ID (excluding self)
    const duplicate = currentReferences.some(
      (r) => r.id === cleanId && r.id !== editingRefId
    );
    if (duplicate) {
      setEditError(`A reference with ID "${cleanId}" already exists.`);
      return;
    }

    // Handle file replacement if a new file was selected
    if (editRefData.file) {
      const fileName = editRefData.file.name;
      // Read file as base64 and upload via existing API
      try {
        const reader = new FileReader();
        reader.onload = async (event) => {
          try {
            const base64 = (event.target?.result as string).split(',')[1];
            const res = await fetch('/api/references/upload', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                fileName,
                fileBase64: base64,
                category: editRefData.category,
                label: editRefData.label,
                mode: editRefData.mode,
                assignedPromptIds: editRefData.mode === 'all' ? [] : editRefData.assignedPromptIds,
                refId: cleanId,
              }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
              setEditError(data.error || 'File replacement failed.');
              return;
            }
            // Replace the reference in the array
            const updatedRefs = currentReferences.map((r) =>
              r.id === editingRefId
                ? { ...data.reference, id: cleanId, label: editRefData.label, category: editRefData.category, assignedMode: editRefData.mode, assignedPromptIds: editRefData.mode === 'all' ? [] : editRefData.assignedPromptIds }
                : r
            );
            await updateReferences(updatedRefs);
            setShowEditModal(false);
            setEditingRefId(null);
            setEditRefData(null);
            setEditError(null);
          } catch (err: any) {
            setEditError(err.message || 'File replacement failed.');
          }
        };
        reader.readAsDataURL(editRefData.file);
      } catch (err: any) {
        setEditError(err.message || 'Failed to process replacement file.');
      }
      return;
    }

    // No file replacement - just update metadata
    const updatedRefs = currentReferences.map((r) =>
      r.id === editingRefId
        ? {
            ...r,
            id: cleanId,
            name: editRefData.name,
            label: editRefData.label,
            category: editRefData.category,
            assignedMode: editRefData.mode,
            assignedPromptIds: editRefData.mode === 'all' ? [] : editRefData.assignedPromptIds,
          }
        : r
    );

    try {
      await updateReferences(updatedRefs);
      setShowEditModal(false);
      setEditingRefId(null);
      setEditRefData(null);
      setEditError(null);
    } catch (err: any) {
      setEditError(err.message || 'Failed to save reference changes.');
    }
  };

  const handleLoadSamples = () => {
    updateReferences(SAMPLE_REFERENCES);
  };

  const [syncStatus, setSyncStatus] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const handleSyncReferences = async () => {
    if (!currentReferences || !currentBundle) {
      setSyncStatus({ message: 'No active project or references to synchronize.', type: 'error' });
      return;
    }

    setSyncStatus(null);

    try {
      const res = await fetch('/api/references/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          references: currentReferences,
          bundle: currentBundle,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setSyncStatus({ message: data.error || 'Sync validation failed.', type: 'error' });
        return;
      }

      // Update local state with the synchronized references
      await updateReferences(data.references || currentReferences);

      setSyncStatus({
        message: data.message || 'Sync complete.',
        type: 'success',
      });

      setTimeout(() => setSyncStatus(null), 5000);
    } catch (err: any) {
      setSyncStatus({ message: err.message || 'Sync failed.', type: 'error' });
    }
  };

  const prompts = currentBundle?.prompts || [];

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="p-6 rounded-xl glass-panel" style={{ borderColor: 'var(--surface-border)' }}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Images className="w-5 h-5 text-indigo-400" />
              <h2 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                Reference Manager & Prompt Mappings
              </h2>
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              Manage visual media assets (images, PDFs) and textual style references assigned across the queue.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleSyncReferences}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Sync References</span>
            </button>

            <button
              onClick={() => handleOpenAddModal('character')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold ${referenceCount?.atLimit ? 'bg-gray-500 hover:bg-gray-600 text-white opacity-50 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition-all'}`}
              disabled={referenceCount?.atLimit}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Reference</span>
            </button>
            {referenceCount && (
              <span className={`px-2.5 py-1 rounded text-[10px] font-bold ${
                referenceCount.atLimit ? 'bg-red-500 text-white' : 'bg-indigo-100 text-indigo-700'
              }`}>
                {referenceCount.count}/{referenceCount.max}
              </span>
            )}
          </div>
        </div>
      </div>

      {syncStatus && (
        <div className={`p-4 rounded-lg text-xs font-medium flex items-center gap-2 ${
          syncStatus.type === 'success'
            ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
            : syncStatus.type === 'error'
              ? 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
              : 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-400'
        }`}>
          {syncStatus.type === 'success' ? (
            <CheckCircle2 className="w-3 h-3 shrink-0" />
          ) : syncStatus.type === 'error' ? (
            <AlertTriangle className="w-3 h-3 shrink-0" />
          ) : (
            <Info className="w-3 h-3 shrink-0" />
          )}
          <span>{syncStatus.message}</span>
        </div>
      )}

      {/* References Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {currentReferences.map((ref) => {
          const categoryColors: Record<string, string> = {
            style: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
            character: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
            environment: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
            object: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
            custom: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
          };

          const isMedia = ref.refType === 'media' || ref.type?.startsWith('image/') || ref.type === 'application/pdf';
          const isVideo = ref.refType === 'video' || ref.type === 'video/mp4';
          const isJson = ref.refType === 'json' || ref.type === 'application/json';

          return (
            <div
              key={ref.id}
              className="p-5 rounded-xl border glass-panel space-y-3"
              style={{ borderColor: 'var(--surface-border)' }}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-white/5 border border-white/10">
                    {isVideo ? (
                      <File className="w-5 h-5 text-blue-400" />
                    ) : isJson ? (
                      <FileText className="w-5 h-5 text-purple-400" />
                    ) : ref.type?.startsWith('image/') ? (
                      <FileImage className="w-5 h-5 text-indigo-400" />
                    ) : ref.type === 'application/pdf' ? (
                      <File className="w-5 h-5 text-rose-400" />
                    ) : (
                      <FileText className="w-5 h-5 text-amber-400" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs font-bold text-indigo-400">
                        {ref.id}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase border ${categoryColors[ref.category] || ''}`}>
                        {ref.category}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-[var(--text-secondary)] font-mono">
                        {isVideo ? 'VIDEO' : isJson ? 'JSON' : isMedia ? 'MEDIA' : 'TEXT'}
                      </span>
                    </div>
                    <h4 className="text-xs font-semibold leading-snug" style={{ color: 'var(--text-primary)' }}>
                      {ref.label}
                    </h4>
                  </div>
                </div>

                <button
                  onClick={() => handleEditRef(ref)}
                  className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-indigo-400 hover:bg-white/5 transition-colors"
                  title="Edit reference"
                  aria-label={`Edit reference ${ref.id}`}
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(ref.id)}
                  className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                  title="Remove reference"
                  aria-label={`Remove reference ${ref.id}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {ref.textContent && (
                <div className="p-2.5 rounded-lg bg-black/30 border border-white/5 text-[11px] font-mono text-[var(--text-secondary)] max-h-20 overflow-y-auto">
                  {ref.textContent}
                </div>
              )}

              <div className="p-2.5 rounded-lg bg-black/20 border border-white/5 text-xs space-y-1">
                <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                  <span>Assignment Scope:</span>
                  <strong className={ref.assignedMode === 'all' ? 'text-indigo-400' : 'text-amber-400'}>
                    {ref.assignedMode === 'all' ? 'All Prompts' : `Selected Prompts (${ref.assignedPromptIds?.length || 0})`}
                  </strong>
                </div>

                {ref.assignedMode === 'selected' && ref.assignedPromptIds && ref.assignedPromptIds.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {ref.assignedPromptIds.map((pId) => (
                      <span
                        key={pId}
                        className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-white/5 border border-white/10 text-indigo-300"
                      >
                        {pId}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-[var(--text-secondary)] pt-1 border-t border-white/5">
                <span className="truncate max-w-[200px]" title={ref.path || ref.name}>
                  File: {ref.name}
                </span>
                <span>
                  {ref.size ? `${(ref.size / 1024).toFixed(1)} KB` : 'N/A'} &bull; {ref.type || 'text'}
                </span>
                {ref.checksum && (
                  <span className="font-mono flex items-center gap-0.5 text-indigo-400/80">
                    <Hash className="w-2.5 h-2.5" />
                    {ref.checksum.substring(0, 8)}...
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {currentReferences.length === 0 && (
        <div className="p-12 rounded-xl text-center glass-panel" style={{ borderColor: 'var(--surface-border)' }}>
          <Images className="w-10 h-10 text-[var(--text-secondary)] mx-auto mb-3 opacity-40" />
          <h4 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
            No References Configured
          </h4>
          <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto mb-4">
            Upload character concept art, style guide images, or specify textual guidelines. References are automatically attached or injected into browser prompts.
          </p>
          <div className="flex justify-center gap-3">
            <button
              onClick={handleLoadSamples}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/15 text-white"
            >
              Load Sample Presets
            </button>
            <button
              onClick={() => handleOpenAddModal('character')}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white"
            >
              Add Your First Reference
            </button>
          </div>
        </div>
      )}

      {/* Preflight Summary Matrix */}
      {prompts.length > 0 && (
        <div className="p-6 rounded-xl glass-panel space-y-4" style={{ borderColor: 'var(--surface-border)' }}>
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
              Effective Reference Set per Prompt (Preflight Summary)
            </h3>
            <button
              onClick={() => setActivePage('monitor')}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1"
            >
              <span>Go to Run Monitor</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
            {prompts.slice(0, 10).map((p) => {
              const effectiveRefs = currentReferences.filter(
                (r) => r.assignedMode === 'all' || (r.assignedPromptIds && r.assignedPromptIds.includes(p.id))
              );

              return (
                <div
                  key={p.id}
                  className="p-2.5 rounded-lg border glass-card flex items-center justify-between gap-3 text-xs"
                  style={{ borderColor: 'var(--surface-border)' }}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-indigo-400 w-16">{p.id}</span>
                    <span className="text-[var(--text-secondary)] truncate max-w-sm">{p.prompt}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {effectiveRefs.length > 0 ? (
                      effectiveRefs.map((r) => (
                        <span
                          key={r.id}
                          className="px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-500/10 text-indigo-300 border border-indigo-500/20"
                        >
                          {r.id}
                        </span>
                      ))
                    ) : (
                      <span className="text-[11px] text-[var(--text-secondary)]">None</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {prompts.length > 10 && (
            <div className="text-[11px] text-[var(--text-secondary)] text-center">
              + {prompts.length - 10} more prompts verified in bundle
            </div>
          )}
        </div>
      )}

      {/* Add Reference Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg p-6 rounded-xl glass-panel space-y-4" style={{ borderColor: 'var(--surface-border)' }}>
            <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
              Add Reference Asset
            </h3>

            {modalError && (
              <div className="p-2.5 rounded text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20">
                {modalError}
              </div>
            )}

            <form onSubmit={handleSaveReference} className="space-y-4 text-xs">
              {/* Entry Method Selector */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setEntryMethod('upload')}
                  className={`p-2.5 rounded-lg border text-center font-semibold transition-all ${
                    entryMethod === 'upload'
                      ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                      : 'border-white/10 hover:border-white/20 text-[var(--text-secondary)]'
                  }`}
                >
                  <UploadCloud className="w-4 h-4 mx-auto mb-1" />
                  <div className="font-semibold leading-tight">Upload Media</div>
                  <div className="text-[9px] opacity-75">PNG, JPG, WebP, GIF, SVG, PDF, TXT, MD, JSON</div>
                </button>
                <button
                  type="button"
                  onClick={() => setEntryMethod('write')}
                  className={`p-2.5 rounded-lg border text-center font-semibold transition-all ${
                    entryMethod === 'write'
                      ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                      : 'border-white/10 hover:border-white/20 text-[var(--text-secondary)]'
                  }`}
                >
                  <FileText className="w-4 h-4 mx-auto mb-1" />
                  <div className="font-semibold leading-tight">Write Text</div>
                  <div className="text-[9px] opacity-75">Enter instructions directly</div>
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                  Reference ID *
                </label>
                <input
                  type="text"
                  required
                  value={refId}
                  onChange={(e) => setRefId(e.target.value)}
                  placeholder="e.g. REF-CHAR-01"
                  className="w-full px-3 py-2 rounded-lg glass-card outline-none font-mono"
                  style={{ color: 'var(--text-primary)' }}
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                  Descriptive Label *
                </label>
                <input
                  type="text"
                  required
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Detective Kane Character Sheet"
                  className="w-full px-3 py-2 rounded-lg glass-card outline-none"
                  style={{ color: 'var(--text-primary)' }}
                />
              </div>

              {entryMethod === 'write' ? (
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                    Text Content *
                  </label>
                  <textarea
                    rows={4}
                    value={textContent}
                    onChange={(e) => setTextContent(e.target.value)}
                    placeholder="Enter instructions, descriptions, character details, visual guidelines, or other reference information..."
                    className="w-full px-3 py-2 rounded-lg glass-card outline-none font-mono"
                    style={{ color: 'var(--text-primary)' }}
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                    Supported formats: PNG, JPG, JPEG, WebP, GIF, SVG, PDF, TXT, MD, JSON.
                  </label>
                  <label className="border-2 border-dashed border-white/20 hover:border-indigo-500 rounded-lg p-4 flex flex-col items-center justify-center cursor-pointer transition-colors bg-white/5">
                    <UploadCloud className="w-6 h-6 text-indigo-400 mb-1" />
                    <span className="text-xs font-medium text-white">
                      {selectedFile ? selectedFile.name : 'Click to select file'}
                    </span>
                    <span className="text-[10px] text-[var(--text-secondary)] mt-0.5">
                      {selectedFile ? `${(selectedFile.size / 1024).toFixed(1)} KB` : 'File will be validated and SHA-256 hashed'}
                    </span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,application/pdf,text/plain,text/markdown,application/json,.txt,.md,.markdown,.json"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                  </label>
                </div>
              )}

              {uploadProgress && (
                <div className="p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-indigo-300 truncate max-w-[140px]">
                      {uploadProgress.fileName}
                    </span>
                    <span className="font-mono text-indigo-400">{uploadProgress.progress}%</span>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        uploadProgress.status === 'error'
                          ? 'bg-rose-500'
                          : uploadProgress.status === 'complete'
                            ? 'bg-emerald-500'
                            : 'bg-indigo-500'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(0, uploadProgress.progress))}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-[var(--text-secondary)] capitalize">
                    {uploadProgress.status}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ReferenceCategory)}
                    className="w-full px-3 py-2 rounded-lg glass-card outline-none"
                    style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-secondary)' }}
                  >
                    <option value="character">Character Reference</option>
                    <option value="style">Style Reference</option>
                    <option value="environment">Environment Reference</option>
                    <option value="object">Object Reference</option>
                    <option value="custom">Custom Reference</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                    Assignment Scope
                  </label>
                  <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value as 'all' | 'selected')}
                    className="w-full px-3 py-2 rounded-lg glass-card outline-none"
                    style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-secondary)' }}
                  >
                    <option value="selected">Selected Prompt IDs</option>
                    <option value="all">All Prompts</option>
                  </select>
                </div>
              </div>

              {mode === 'selected' && (
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                    Target Prompt IDs (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={selectedIdsText}
                    onChange={(e) => setSelectedIdsText(e.target.value)}
                    placeholder="IMG-001, IMG-003, IMG-005"
                    className="w-full px-3 py-2 rounded-lg glass-card outline-none font-mono"
                    style={{ color: 'var(--text-primary)' }}
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => setShowAddModal(false)}
                  className="px-3.5 py-2 rounded-lg text-xs font-medium hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
                >
                  {uploading ? 'Uploading & Hashing...' : 'Save Reference'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Reference Modal */}
      {showEditModal && editRefData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md p-6 rounded-xl glass-panel space-y-4" style={{ borderColor: 'var(--surface-border)' }}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                Edit Reference
              </h3>
              <button
                onClick={handleCancelEditRef}
                className="text-xs text-[var(--text-secondary)] hover:text-white"
              >
                Cancel
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                Reference ID *
              </label>
              <input
                type="text"
                required
                value={editRefData.id}
                onChange={(e) => setEditRefData({ ...editRefData, id: e.target.value })}
                placeholder="e.g. REF-CHAR-01"
                className="w-full px-3 py-2 rounded-lg glass-card outline-none font-mono"
                style={{ color: 'var(--text-primary)' }}
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                Descriptive Label *
              </label>
              <input
                type="text"
                required
                value={editRefData.label}
                onChange={(e) => setEditRefData({ ...editRefData, label: e.target.value })}
                placeholder="e.g. Detective Kane Character Sheet"
                className="w-full px-3 py-2 rounded-lg glass-card outline-none"
                style={{ color: 'var(--text-primary)' }}
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                Category
              </label>
              <select
                value={editRefData.category}
                onChange={(e) => setEditRefData({ ...editRefData, category: e.target.value as ReferenceCategory })}
                className="w-full px-3 py-2 rounded-lg glass-card outline-none"
                style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-secondary)' }}
              >
                <option value="character">Character Reference</option>
                <option value="style">Style Reference</option>
                <option value="environment">Environment Reference</option>
                <option value="object">Object Reference</option>
                <option value="custom">Custom Reference</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                Assignment Scope
              </label>
              <select
                value={editRefData.mode}
                onChange={(e) => setEditRefData({ ...editRefData, mode: e.target.value as 'all' | 'selected' })}
                className="w-full px-3 py-2 rounded-lg glass-card outline-none"
                style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-secondary)' }}
              >
                <option value="selected">Selected Prompt IDs</option>
                <option value="all">All Prompts</option>
              </select>
            </div>

            {editRefData.mode === 'selected' && (
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                  Target Prompt IDs (comma-separated)
                </label>
                <input
                  type="text"
                  value={editRefData.assignedPromptIds.join(', ')}
                  onChange={(e) => setEditRefData({ ...editRefData, assignedPromptIds: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                  placeholder="IMG-001, IMG-003, IMG-005"
                  className="w-full px-3 py-2 rounded-lg glass-card outline-none font-mono"
                  style={{ color: 'var(--text-primary)' }}
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                Replace File (optional)
              </label>
              <label className="border-2 border-dashed border-white/20 hover:border-indigo-500 rounded-lg p-4 flex flex-col items-center justify-center cursor-pointer transition-colors bg-white/5">
                <Upload className="w-6 h-6 text-indigo-400 mb-1" />
                <span className="text-xs font-medium text-white">
                  {editRefData.file ? editRefData.file.name : 'Click to select replacement file'}
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,application/pdf,text/plain,text/markdown,application/json,.txt,.md,.markdown,.json"
                  onChange={(e) => setEditRefData({ ...editRefData, file: e.target.files?.[0] || null })}
                  className="hidden"
                />
              </label>
              {editRefData.file && (
                <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">
                  {`${(editRefData.file.size / 1024).toFixed(1)} KB`}
                </p>
              )}
            </div>

            {editError && (
              <p className="text-[10px] text-rose-400">{editError}</p>
            )}

            <div className="flex justify-end gap-2 pt-3">
              <button
                type="button"
                onClick={handleCancelEditRef}
                className="px-3.5 py-2 rounded-lg text-xs font-medium hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEditRef}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
