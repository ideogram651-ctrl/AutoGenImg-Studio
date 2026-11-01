import React, { useState } from 'react';
import {
  Images, Plus, Trash2, CheckCircle2, Tag, Layers, ArrowRight,
  Sparkles, Info, AlertTriangle, FileText, FileImage, UploadCloud,
  File, Hash, Edit2, Save, X, RotateCcw, Upload, RefreshCw,
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

    if (!selectedFile) {
      setModalError('Please choose a file to upload.');
      return;
    }

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

    const duplicate = currentReferences.some(
      (r) => r.id === cleanId && r.id !== editingRefId
    );
    if (duplicate) {
      setEditError(`A reference with ID "${cleanId}" already exists.`);
      return;
    }

    if (editRefData.file) {
      const fileName = editRefData.file.name;
      // Read file and upload via existing API
      try {
        await uploadReferenceMedia(editRefData.file, {
          refId: cleanId,
          label: editRefData.label,
          category: editRefData.category,
          mode: editRefData.mode,
          assignedPromptIds: editRefData.assignedPromptIds,
        });
      } catch (err: any) {
        setEditError(err.message || 'Failed to upload replacement file.');
        return;
      }
    }

    const updatedRefs = currentReferences.map((r) =>
      r.id === editingRefId
        ? { ...editRefData, id: cleanId, label: editRefData.label, category: editRefData.category, mode: editRefData.mode, assignedPromptIds: editRefData.assignedPromptIds }
        : r
    );
    updateReferences(updatedRefs as ReferenceFile[]);
    setShowEditModal(false);
    setEditingRefId(null);
    setEditRefData(null);
  };
  const prompts = currentBundle?.prompts || [];
  const totalRefs = currentReferences.length;

  return (
    <div className="stack">
      {/* Page Header */}
      <div className="panel">
        <div className="heading">
          <div>
            <h2>Reference Manager &amp; Prompt Mappings</h2>
            <p>Manage visual media assets (images, PDFs) and textual style references assigned across the queue.</p>
          </div>
          <div className="actions">
            <button
              onClick={() => setShowAddModal(true)}
              className="btn primary"
            >
              <Plus className="icon" />
              <span>Add Reference</span>
            </button>
            <span className="badge gray">{totalRefs}/20</span>
          </div>
        </div>
      </div>

      {/* Reference Cards Grid */}
      <div className="three">
        {currentReferences.length > 0 ? (
          currentReferences.map((ref) => (
            <article key={ref.id} className="card ref-card">
              <div className="ref-plate">
                <span>{ref.category[0].toUpperCase()}</span>
                <div>
                  <b>{ref.category === 'style' ? 'AGENT INSTRUCTIONS' : ref.category === 'character' ? 'CHARACTER REFERENCE' : ref.category.toUpperCase()}</b>
                  <p>{ref.refType === 'text' ? 'Text / Markdown' : 'Image metadata'} · Shared across {prompts.filter(p => (p.referenceIds || []).includes(ref.id)).length} scenes</p>
                </div>
              </div>
              <div className="row between">
                <div className="row">
                  <div className="ref-icon">
                    {ref.refType === 'text' ? (
                      <FileText className="icon" />
                    ) : (
                      <FileImage className="icon" />
                    )}
                  </div>
                  <div>
                    <b className="indigo-text mono">{ref.id}</b>
                    <div className="actions" style={{ marginTop: 4 }}>
                      <span className="badge amber">{ref.category}</span>
                      <span className="badge gray">{ref.refType?.toUpperCase() ?? 'TEXT'}</span>
                    </div>
                  </div>
                </div>
                <div className="actions">
                  <button
                    onClick={() => handleEditRef(ref)}
                    className="btn quiet icon-only"
                    title="Edit reference"
                    aria-label={`Edit reference ${ref.id}`}
                  >
                    <Edit2 className="icon" />
                  </button>
                  <button
                    onClick={() => handleDelete(ref.id)}
                    className="btn quiet icon-only"
                    title="Delete reference"
                    aria-label={`Delete reference ${ref.id}`}
                  >
                    <Trash2 className="icon" />
                  </button>
                </div>
              </div>
              <h3>{ref.label}</h3>
              <div className="scope">
                <span className="muted">Assignment Scope:</span> &nbsp;<span className="badge">{ref.assignedMode === 'all' ? 'All Prompts' : 'Selected Prompts'}</span>
              </div>
              <small>
                File: {ref.name}<br />
                {ref.size} bytes · {ref.type} &nbsp;{ref.checksum || ''}
              </small>
            </article>
          ))
        ) : (
          <div className="card">
            <div className="empty">
              <div className="big-icon">
                <Images className="icon" />
              </div>
              <h3>No references configured</h3>
              <p>Upload character concept art, style guide images, or specify textual guidelines.</p>
            </div>
          </div>
        )}
      </div>

      {/* Effective Reference Set per Prompt */}
      <section className="panel">
        <div className="heading">
          <div>
            <h2>Effective Reference Set per Prompt (Preflight Summary)</h2>
            <p></p>
          </div>
          <div className="actions">
            <a className="btn quiet" href="#monitor">
              <ArrowRight className="icon" />
              <span>Go to Run Monitor</span>
            </a>
          </div>
        </div>
        {prompts.length > 0 ? (
          prompts.map((prompt) => {
            const assignedRefs = currentReferences.filter((ref) =>
              (ref.assignedPromptIds || []).includes(prompt.id) || ref.assignedMode === 'all'
            );
            return (
              <div key={prompt.id} className="mapping-row">
                <b className="mono indigo-text">{prompt.id}</b>
                <div>
                  <p>{prompt.prompt}</p>
                  <button
                    aria-controls={`mapping-prompt-${prompt.id}`}
                    aria-expanded="false"
                    className="mapping-expand"
                    data-expand=""
                    type="button"
                  >
                    Read full prompt ↓
                  </button>
                </div>
                <div className="actions">
                  {assignedRefs.map((ref) => (
                    <span key={ref.id} className="badge">{ref.id}</span>
                  ))}
                </div>
              </div>
            );
          })
        ) : (
          <section className="panel">
            <h3>No prompts found in current project</h3>
            <p>Click “Import .JSON File” or “Paste JSON” to load your prompt bundle.</p>
            <div className="actions" style={{ marginTop: 12 }}>
              <button
                className="btn"
                disabled
                title="Application operation unavailable in this offline visual prototype"
              >
                Load Sample Presets
              </button>
              <a className="btn primary" href="#bundle">
                <svg aria-hidden="true" className="icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.65" viewBox="0 0 24 24">
                  <path d="M8 3h13v13H8z M3 8v13h13 M8 13l4-4 4 4 2-2 3 3 M16 6h.01" />
                </svg>
                <span>Add Your First Reference</span>
              </a>
            </div>
          </section>
        )}
      </section>
      {/* Design State Explorer */}
      <details className="state-explorer">
        <summary>Inspect reference states and alternate assignment scope</summary>
        <div className="state-content">
          <div className="notice green">
            <svg aria-hidden="true" className="icon" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.65" viewBox="0 0 24 24">
              <path d="M12 8v5 M12 17h.01 M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18" />
            </svg>
            <div>
              <b>References synchronized.</b> Library and prompt mappings are aligned. This is a static reference state.
            </div>
          </div>
          <div className="card">
            <b>Selected Prompt IDs</b>
            <div className="actions" style={{ marginTop: 10 }}>
              {prompts.map((p) => (
                <span key={p.id} className="badge">{p.id}</span>
              ))}
            </div>
          </div>
          <section className="panel">
            <h3>No References Configured</h3>
            <p>Upload character concept art, style guide images, or specify textual guidelines.</p>
            <div className="actions" style={{ marginTop: 12 }}>
              <button
                className="btn"
                disabled
                title="Application operation unavailable in this offline visual prototype"
              >
                Load Sample Presets
              </button>
              <a className="btn primary" href="#add-reference-upload">
                <Plus className="icon" />
                <span>Add Your First Reference</span>
              </a>
            </div>
          </section>
        </div>
      </details>

      {/* Add Reference Modal */}
      {showAddModal && (
        <div className="modal" style={{ display: 'flex' }} role="dialog" aria-modal="true">
          <div className="modal-box">
            <div className="modal-heading">
              <h3>Add Reference Asset</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="btn quiet icon-only"
                aria-label="Close dialog"
              >
                <X className="icon" />
              </button>
            </div>
            <div className="two" style={{ marginBottom: 18 }}>
              <a className="btn primary" href="#add-reference-upload">
                <UploadCloud className="icon" />
                <span>Upload Media</span>
              </a>
              <a className="btn" href="#add-reference-text">
                <FileText className="icon" />
                <span>Write Text</span>
              </a>
            </div>
            <div className="two">
              <div className="field">
                <div className="label">Reference ID *</div>
                <input
                  className="input"
                  value={refId}
                  onChange={(e) => setRefId(e.target.value)}
                  placeholder="e.g. REF-CHARACTER-03"
                />
              </div>
              <div className="field">
                <div className="label">Descriptive Label *</div>
                <input
                  className="input"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Protagonist Front View"
                />
              </div>
            </div>
            <div className="field">
              <div className="label">Category</div>
              <select
                className="select input"
                value={category}
                onChange={(e) => setCategory(e.target.value as ReferenceCategory)}
              >
                <option value="style">Style Reference</option>
                <option value="character">Character Reference</option>
                <option value="environment">Environment Reference</option>
                <option value="object">Object Reference</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div className="field">
              <div className="label">Assignment Scope</div>
              <select
                className="select input"
                value={mode}
                onChange={(e) => setMode(e.target.value as 'all' | 'selected')}
              >
                <option value="all">All Prompts</option>
                <option value="selected">Selected Prompt IDs</option>
              </select>
            </div>
            {mode === 'selected' && (
              <div className="field">
                <div className="label">Target Prompt IDs (comma-separated)</div>
                <input
                  className="input mono"
                  value={selectedIdsText}
                  onChange={(e) => setSelectedIdsText(e.target.value)}
                  placeholder="IMG-001, IMG-002"
                />
              </div>
            )}
            {entryMethod === 'write' ? (
              <div className="field">
                <div className="label">Text Content *</div>
                <textarea
                  className="textarea"
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  placeholder="Enter reference instructions, style rules, or character descriptions…"
                />
              </div>
            ) : (
              <>
                <div className="label">Reference Media File *</div>
                <div className="dropzone">
                  <Upload className="icon" />
                  <span>Click to select file</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,application/pdf,text/plain,text/markdown,application/json,.txt,.md,.markdown,.json"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    hidden
                  />
                </div>
                <p className="hint">
                  Supported formats: PNG, JPG, JPEG, WebP, GIF, SVG, PDF, TXT, MD, JSON.
                </p>
              </>
            )}
            <div className="modal-footer">
              <button onClick={() => setShowAddModal(false)} className="btn">
                Cancel
              </button>
              <button
                onClick={handleSaveReference}
                disabled={uploading}
                className="btn primary"
              >
                {uploading ? 'Adding...' : 'Add Reference'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Reference Modal */}
      {showEditModal && editRefData && (
        <div className="modal" style={{ display: 'flex' }} role="dialog" aria-modal="true">
          <div className="modal-box narrow">
            <div className="modal-heading">
              <h3>Edit Reference</h3>
              <button
                onClick={handleCancelEditRef}
                className="btn quiet icon-only"
                aria-label="Close dialog"
              >
                <X className="icon" />
              </button>
            </div>
            <div className="field">
              <div className="label">Reference ID *</div>
              <input
                className="input"
                value={editRefData.id}
                onChange={(e) => setEditRefData({ ...editRefData, id: e.target.value })}
              />
            </div>
            <div className="field">
              <div className="label">Descriptive Label *</div>
              <input
                className="input"
                value={editRefData.label}
                onChange={(e) => setEditRefData({ ...editRefData, label: e.target.value })}
              />
            </div>
            <div className="field">
              <div className="label">Category</div>
              <select
                className="select input"
                value={editRefData.category}
                onChange={(e) => setEditRefData({ ...editRefData, category: e.target.value as ReferenceCategory })}
              >
                <option value="style">Style Reference</option>
                <option value="character">Character Reference</option>
                <option value="environment">Environment Reference</option>
                <option value="object">Object Reference</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div className="field">
              <div className="label">Assignment Scope</div>
              <select
                className="select input"
                value={editRefData.mode}
                onChange={(e) => setEditRefData({ ...editRefData, mode: e.target.value as 'all' | 'selected' })}
              >
                <option value="all">All Prompts</option>
                <option value="selected">Selected Prompt IDs</option>
              </select>
            </div>
            {editRefData.mode === 'selected' && (
              <div className="field">
                <div className="label">Target Prompt IDs (comma-separated)</div>
                <input
                  className="input mono"
                  value={editRefData.assignedPromptIds.join(', ')}
                  onChange={(e) =>
                    setEditRefData({
                      ...editRefData,
                      assignedPromptIds: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                    })
                  }
                  placeholder="IMG-001, IMG-003, IMG-005"
                />
              </div>
            )}
            <div className="label">Replace File (optional)</div>
            <div className="dropzone">
              <Upload className="icon" />
              <span>Click to select replacement file</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,application/pdf,text/plain,text/markdown,application/json,.txt,.md,.markdown,.json"
                onChange={(e) => setEditRefData({ ...editRefData, file: e.target.files?.[0] || null })}
                hidden
              />
            </div>
            {editError && (
              <p className="text-[10px] text-red-text">{editError}</p>
            )}
            <div className="modal-footer">
              <button onClick={handleCancelEditRef} className="btn">
                Cancel
              </button>
              <button
                onClick={handleSaveEditRef}
                disabled={uploading}
                className="btn primary"
              >
                {uploading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
