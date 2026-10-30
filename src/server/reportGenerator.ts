import { RunManifest } from '../types/index.ts';

/**
 * Escapes HTML characters to prevent XSS.
 */
export function escapeHtml(unsafe: string | null | undefined): string {
  if (unsafe === null || unsafe === undefined) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Formats milliseconds into human-readable duration string.
 */
export function formatDuration(ms?: number | null): string {
  if (ms === undefined || ms === null || isNaN(ms)) return '—';
  if (ms < 1000) return `${ms}ms`;
  const seconds = (ms / 1000).toFixed(1);
  if (ms < 60000) return `${seconds}s`;
  const minutes = Math.floor(ms / 60000);
  const remainingSecs = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${remainingSecs}s`;
}

/**
 * Formats ISO date to readable string.
 */
export function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return iso;
  }
}

/**
 * Generates a completely self-contained, offline-compatible HTML report.
 */
export function generateHtmlReport(manifest: RunManifest): string {
  const generatedAt = new Date().toISOString();

  const statusColorMap: Record<string, { bg: string; text: string; border: string }> = {
    SAVED: { bg: 'rgba(34, 197, 94, 0.15)', text: '#4ade80', border: 'rgba(34, 197, 94, 0.3)' },
    NEEDS_REVIEW: { bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24', border: 'rgba(245, 158, 11, 0.3)' },
    FAILED: { bg: 'rgba(239, 68, 68, 0.15)', text: '#f87171', border: 'rgba(239, 68, 68, 0.3)' },
    PAUSED: { bg: 'rgba(148, 163, 184, 0.15)', text: '#cbd5e1', border: 'rgba(148, 163, 184, 0.3)' },
    PAUSED_PROVIDER_LIMIT: { bg: 'rgba(234, 88, 12, 0.15)', text: '#fb923c', border: 'rgba(234, 88, 12, 0.3)' },
    BLOCKED_AUTH: { bg: 'rgba(217, 70, 239, 0.15)', text: '#e879f9', border: 'rgba(217, 70, 239, 0.3)' },
    SKIPPED: { bg: 'rgba(100, 116, 139, 0.15)', text: '#94a3b8', border: 'rgba(100, 116, 139, 0.3)' },
    CANCELLED: { bg: 'rgba(100, 116, 139, 0.15)', text: '#94a3b8', border: 'rgba(100, 116, 139, 0.3)' },
    PENDING: { bg: 'rgba(148, 163, 184, 0.1)', text: '#94a3b8', border: 'rgba(148, 163, 184, 0.2)' },
  };

  const rowsHtml = manifest.items
    .map((item) => {
      const colors = statusColorMap[item.status] || {
        bg: 'rgba(148, 163, 184, 0.1)',
        text: '#cbd5e1',
        border: 'rgba(148, 163, 184, 0.2)',
      };
      const refTags = item.referenceIds && item.referenceIds.length > 0
        ? item.referenceIds.map((r) => `<span class="ref-pill">${escapeHtml(r)}</span>`).join(' ')
        : '<span class="muted">None</span>';

      return `
      <tr class="item-row" data-status="${escapeHtml(item.status)}">
        <td class="col-seq">${item.sequence}</td>
        <td class="col-id"><strong>${escapeHtml(item.id)}</strong></td>
        <td class="col-prompt" title="${escapeHtml(item.prompt)}">${escapeHtml(item.prompt)}</td>
        <td class="col-status">
          <span class="status-badge" style="background:${colors.bg};color:${colors.text};border:1px solid ${colors.border}">
            ${escapeHtml(item.status)}
          </span>
        </td>
        <td class="col-time">${formatDate(item.generationStartTime)}</td>
        <td class="col-num">${formatDuration(item.generationDurationMs)}</td>
        <td class="col-num">${formatDuration(item.downloadDurationMs)}</td>
        <td class="col-num">${formatDuration(item.totalDurationMs)}</td>
        <td class="col-file">
          ${item.outputFile ? `<code>${escapeHtml(item.outputFile)}</code>` : '<span class="muted">—</span>'}
          ${item.sha256 ? `<br><small style="color:#64748b;font-family:monospace" title="${escapeHtml(item.sha256)}">SHA: ${escapeHtml(item.sha256.slice(0, 12))}...</small>` : ''}
          ${item.artifactType ? `<br><small style="color:${item.artifactType === 'genuine_image' ? '#4ade80' : '#fbbf24'}">${escapeHtml(item.artifactType)}</small>` : ''}
        </td>
        <td class="col-refs">${refTags}</td>
        <td class="col-reason">${item.reviewReason ? escapeHtml(item.reviewReason) : '<span class="muted">—</span>'}</td>
        <td class="col-action">${item.suggestedAction ? escapeHtml(item.suggestedAction) : '<span class="muted">—</span>'}</td>
      </tr>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>AutoGenImg Run Report — ${escapeHtml(manifest.projectName)} (${escapeHtml(manifest.runId)})</title>
  <style>
    :root {
      --bg: #0B0D12;
      --surface: #11151D;
      --card-bg: rgba(255, 255, 255, 0.045);
      --card-border: rgba(255, 255, 255, 0.09);
      --text: #F3F5F9;
      --text-muted: #9CA6B6;
      --accent: #6366f1;
      --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--font-family);
      font-size: 14px;
      line-height: 1.5;
      padding: 32px 24px;
      min-height: 100vh;
    }
    .container {
      max-width: 1400px;
      margin: 0 auto;
    }
    header {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 28px;
      padding-bottom: 24px;
      border-bottom: 1px solid var(--card-border);
    }
    .brand-title {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--accent);
      font-weight: 700;
      margin-bottom: 4px;
    }
    h1 {
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin-bottom: 6px;
    }
    .header-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      color: var(--text-muted);
      font-size: 13px;
    }
    .header-meta strong {
      color: var(--text);
    }
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 14px;
      margin-bottom: 32px;
    }
    .metric-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 10px;
      padding: 16px;
    }
    .metric-label {
      font-size: 12px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 6px;
    }
    .metric-value {
      font-size: 26px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .val-saved { color: #4ade80; }
    .val-review { color: #fbbf24; }
    .val-failed { color: #f87171; }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }
    .search-input {
      background: var(--surface);
      border: 1px solid var(--card-border);
      color: var(--text);
      padding: 8px 14px;
      border-radius: 6px;
      font-size: 13px;
      min-width: 260px;
      outline: none;
    }
    .search-input:focus {
      border-color: var(--accent);
    }
    .filter-buttons {
      display: flex;
      gap: 8px;
    }
    .filter-btn {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      color: var(--text-muted);
      padding: 6px 12px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
    }
    .filter-btn.active, .filter-btn:hover {
      background: rgba(255, 255, 255, 0.1);
      color: var(--text);
    }
    .table-container {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 10px;
      overflow-x: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 13px;
    }
    th {
      background: rgba(0, 0, 0, 0.25);
      color: var(--text-muted);
      font-weight: 600;
      padding: 12px 14px;
      border-bottom: 1px solid var(--card-border);
      white-space: nowrap;
    }
    td {
      padding: 12px 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      vertical-align: top;
    }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: rgba(255, 255, 255, 0.02); }
    .col-seq { width: 40px; color: var(--text-muted); text-align: center; }
    .col-id { width: 90px; }
    .col-prompt { max-width: 320px; word-break: break-word; color: #e2e8f0; }
    .col-status { width: 120px; white-space: nowrap; }
    .col-time, .col-num { white-space: nowrap; color: var(--text-muted); }
    .col-file { max-width: 180px; word-break: break-all; }
    .col-file code { font-family: monospace; font-size: 12px; color: #38bdf8; }
    .col-refs { max-width: 140px; }
    .col-reason { max-width: 200px; color: #fbbf24; }
    .col-action { max-width: 180px; color: #a5b4fc; }
    .status-badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.02em;
    }
    .ref-pill {
      display: inline-block;
      background: rgba(99, 102, 241, 0.15);
      color: #a5b4fc;
      border: 1px solid rgba(99, 102, 241, 0.3);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 11px;
      margin: 1px 2px;
    }
    .muted { color: var(--text-muted); }
    footer {
      margin-top: 32px;
      text-align: center;
      color: var(--text-muted);
      font-size: 12px;
      border-top: 1px solid var(--card-border);
      padding-top: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <div class="brand-title">AutoGenImg Studio — Execution Run Report</div>
        <h1>${escapeHtml(manifest.projectName)}</h1>
        <div class="header-meta">
          <span>Run ID: <strong>${escapeHtml(manifest.runId)}</strong></span>
          <span>Provider: <strong>${escapeHtml(manifest.provider)}</strong></span>
          <span>Overall Status: <strong>${escapeHtml(manifest.overallStatus)}</strong></span>
          <span>Started: <strong>${formatDate(manifest.startTime)}</strong></span>
          <span>Ended: <strong>${formatDate(manifest.endTime)}</strong></span>
        </div>
      </div>
      <div style="text-align: right; color: var(--text-muted); font-size: 12px;">
        <div>Output Folder:</div>
        <code style="color: #38bdf8; font-size: 12px;">${escapeHtml(manifest.outputPath)}</code>
        <div style="margin-top: 4px;">Report Generated: ${formatDate(generatedAt)}</div>
      </div>
    </header>

    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-label">Total Prompts</div>
        <div class="metric-value">${manifest.totalPrompts}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Processed</div>
        <div class="metric-value">${manifest.processedCount}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Saved Images</div>
        <div class="metric-value val-saved">${manifest.savedCount}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Needs Review</div>
        <div class="metric-value val-review">${manifest.reviewCount}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Failed / Skipped</div>
        <div class="metric-value val-failed">${manifest.failedCount + manifest.skippedCount}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Wall-Clock Duration</div>
        <div class="metric-value" style="font-size: 20px;">${formatDuration(manifest.wallClockDurationMs)}</div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Active Time</div>
        <div class="metric-value" style="font-size: 20px;">${formatDuration(manifest.activeProcessingDurationMs)}</div>
      </div>
    </div>

    <div class="toolbar">
      <input type="text" id="searchInput" class="search-input" placeholder="Search by prompt ID, text, or output file..."/>
      <div class="filter-buttons">
        <button class="filter-btn active" data-filter="ALL">All (${manifest.items.length})</button>
        <button class="filter-btn" data-filter="SAVED">Saved (${manifest.savedCount})</button>
        <button class="filter-btn" data-filter="NEEDS_REVIEW">Needs Review (${manifest.reviewCount})</button>
        <button class="filter-btn" data-filter="FAILED">Failed (${manifest.failedCount})</button>
      </div>
    </div>

    <div class="table-container">
      <table id="promptsTable">
        <thead>
          <tr>
            <th class="col-seq">#</th>
            <th class="col-id">Prompt ID</th>
            <th class="col-prompt">Prompt Text</th>
            <th class="col-status">Status</th>
            <th class="col-time">Start Time</th>
            <th class="col-num">Gen Time</th>
            <th class="col-num">Download</th>
            <th class="col-num">Total Time</th>
            <th class="col-file">Saved File</th>
            <th class="col-refs">References</th>
            <th class="col-reason">Review / Error Reason</th>
            <th class="col-action">Suggested Action</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>

    <footer>
      AutoGenImg Studio &bull; Fully self-contained report &bull; Viewable offline in any modern browser without remote dependencies.
    </footer>
  </div>

  <script>
    (function() {
      const searchInput = document.getElementById('searchInput');
      const filterButtons = document.querySelectorAll('.filter-btn');
      const rows = document.querySelectorAll('.item-row');
      let currentFilter = 'ALL';

      function applyFilter() {
        const query = (searchInput.value || '').toLowerCase().trim();
        rows.forEach(row => {
          const status = row.getAttribute('data-status');
          const text = row.textContent.toLowerCase();
          const matchesFilter = (currentFilter === 'ALL') || (status === currentFilter);
          const matchesSearch = !query || text.includes(query);
          row.style.display = (matchesFilter && matchesSearch) ? '' : 'none';
        });
      }

      searchInput.addEventListener('input', applyFilter);

      filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          filterButtons.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          currentFilter = btn.getAttribute('data-filter') || 'ALL';
          applyFilter();
        });
      });
    })();
  </script>
</body>
</html>`;
}
