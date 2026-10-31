import { Router, Request, Response } from 'express';
import { QueueOrchestrator } from './queueOrchestrator.ts';
import { ProjectManager } from './projectManager.ts';
import { SettingsManager } from './settingsManager.ts';
import { ChromeSessionManager, defaultChromeSessionManager } from './browser/chromeSessionManager.ts';
import { validatePromptBundle, validateReferenceFile } from './validator.ts';
import { ZipArchive } from './zipArchive.ts';
import { ProjectConfig, PromptBundle, ReferenceFile, ReferenceType } from '../types/index.ts';
import fs from 'node:fs';
import path from 'path';

export function createApiRouter(
  orchestrator: QueueOrchestrator,
  projectManager: ProjectManager,
  sessionManager: ChromeSessionManager = defaultChromeSessionManager,
  settingsManager: SettingsManager = orchestrator.getSettingsManager()
): Router {
  const router = Router();

  // 1. Runtime Capabilities Check
  router.get('/status', async (req: Request, res: Response) => {
    const adapter = orchestrator.getAdapter();
    const adapterCheck = await adapter.isAvailable();
    const currentProject = orchestrator.getCurrentProject();
    const provider = currentProject?.provider || adapter.id || 'chatgpt';

    const chromeStatus = await sessionManager.getStatus({
      configuredChromePath: settingsManager.getSettings().chromePath,
      profileDir: settingsManager.getSettings().resolvedProfileDir,
      port: settingsManager.getSettings().debugPort,
      provider,
    });

    res.json({
      platform: process.platform,
      nodeVersion: process.version,
      browserAutomationAvailable: adapterCheck.available,
      adapterReason: adapterCheck.reason,
      activeAdapterId: adapter.id,
      activeAdapterName: adapter.name,
      isDemoMode: adapter.isDemo,
      hasActiveProject: Boolean(currentProject),
      activeProject: currentProject,
      chromeStatus,
    });
  });

  // 2. Settings Endpoints
  router.get('/settings', (req: Request, res: Response) => {
    const settings = settingsManager.getSettings();
    res.json(settings);
  });

  router.post('/settings', (req: Request, res: Response) => {
    const isRunning = orchestrator.getProgressState().overallStatus === 'RUNNING';
    const result = settingsManager.updateSettings(req.body, isRunning);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    res.json(result.settings);
  });

  // 3. Browser Session Control Endpoints
  router.get('/browser/status', async (req: Request, res: Response) => {
    const currentProject = orchestrator.getCurrentProject();
    const settings = settingsManager.getSettings();
    const provider = (req.query.provider as string) || currentProject?.provider || 'chatgpt';

    const status = await sessionManager.getStatus({
      configuredChromePath: settings.chromePath,
      profileDir: settings.resolvedProfileDir,
      port: settings.debugPort,
      provider,
    });
    res.json(status);
  });

  router.post('/browser/detect', (req: Request, res: Response) => {
    const { chromePath } = req.body || {};
    const settings = settingsManager.getSettings();
    const result = sessionManager.detectChrome(chromePath || settings.chromePath);
    res.json(result);
  });

  router.post('/browser/launch', async (req: Request, res: Response) => {
    const settings = settingsManager.getSettings();
    const currentProject = orchestrator.getCurrentProject();
    const { conversationUrl, provider } = req.body || {};

    const targetUrl =
      conversationUrl ||
      currentProject?.conversationUrl ||
      (provider === 'gemini' ? 'https://gemini.google.com' : 'https://chatgpt.com');

    const result = await sessionManager.launchChrome({
      conversationUrl: targetUrl,
      profileDir: settings.resolvedProfileDir,
      chromePath: settings.chromePath,
      debugPort: settings.debugPort,
      startupTimeoutMs: settings.startupTimeoutMs,
      connectionTimeoutMs: settings.connectionTimeoutMs,
      provider: provider || currentProject?.provider || 'chatgpt',
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  });

  router.post('/browser/connect', async (req: Request, res: Response) => {
    const settings = settingsManager.getSettings();
    const currentProject = orchestrator.getCurrentProject();
    const { conversationUrl, provider } = req.body || {};

    const targetUrl = conversationUrl || currentProject?.conversationUrl;

    try {
      await sessionManager.connectPlaywright({
        conversationUrl: targetUrl,
        debugPort: settings.debugPort,
        connectionTimeoutMs: settings.connectionTimeoutMs,
      });

      const status = await sessionManager.getStatus({
        configuredChromePath: settings.chromePath,
        profileDir: settings.resolvedProfileDir,
        port: settings.debugPort,
        provider: provider || currentProject?.provider || 'chatgpt',
      });

      res.json({ success: true, status });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post('/browser/check', async (req: Request, res: Response) => {
    const currentProject = orchestrator.getCurrentProject();
    const settings = settingsManager.getSettings();
    const provider = req.body?.provider || currentProject?.provider || 'chatgpt';

    const readiness = await sessionManager.checkProviderReadiness(provider);
    const status = await sessionManager.getStatus({
      configuredChromePath: settings.chromePath,
      profileDir: settings.resolvedProfileDir,
      port: settings.debugPort,
      provider,
    });

    res.json({
      success: true,
      readiness,
      status,
    });
  });

  router.post('/browser/navigate', async (req: Request, res: Response) => {
    const { url } = req.body || {};
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Target URL is required.' });
    }

    const result = await sessionManager.navigateTo(url);
    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json(result);
  });

  router.post('/browser/disconnect', async (req: Request, res: Response) => {
    await sessionManager.disconnect();
    res.json({
      success: true,
      message: 'Controller safely disconnected from Google Chrome. Chrome window remains open.',
    });
  });

  // 4. Project Library & Active Project Endpoints
  router.get('/projects', (req: Request, res: Response) => {
    const list = projectManager.listProjects();
    res.json(list);
  });

  // 4b. Project Preview Image Endpoint
  router.get('/projects/:id/preview', (req: Request, res: Response) => {
    const projectId = req.params.id;
    const allProjects = projectManager.listProjects();
    const project = allProjects.find((p) => p.id === projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    const loaded = projectManager.loadProjectConfig(project.outputPath);
    const manifest = loaded.manifest || projectManager.loadManifest(project.outputPath);
    if (!manifest || !manifest.items) {
      return res.json({ imageUrl: null, savedCount: 0 });
    }

    const savedItems = manifest.items
      .filter((item: any) => item.status === 'SAVED' && item.outputFile)
      .sort((a: any, b: any) => (a.sequence || 0) - (b.sequence || 0));

    if (savedItems.length === 0) {
      return res.json({ imageUrl: null, savedCount: 0 });
    }

    const firstItem = savedItems[0];
    const filename = path.basename(firstItem.outputFile);
    const runId = manifest.runId || '';
    const imageUrl = `/api/images/${projectId}/${encodeURIComponent(filename)}?run=${encodeURIComponent(runId)}`;

    res.json({
      imageUrl,
      savedCount: savedItems.length,
      firstPromptId: firstItem.id,
    });
  });

  router.get('/projects/active', (req: Request, res: Response) => {
    // If orchestrator already has active project, return it
    let project = orchestrator.getCurrentProject();
    let bundle = orchestrator.getCurrentBundle();
    let references = orchestrator.getCurrentReferences();
    let manifest = orchestrator.getActiveManifest();

    if (!project) {
      // Check durable active project record from disk
      const activeRecord = projectManager.getActiveProjectRecord();
      if (activeRecord && fs.existsSync(activeRecord.activeProjectPath)) {
        const loaded = projectManager.loadProjectConfig(activeRecord.activeProjectPath);
        if (loaded.project) {
          project = loaded.project;
          bundle = loaded.bundle;
          references = loaded.references;
          orchestrator.setProject(project, bundle || undefined, references);
          manifest = orchestrator.getActiveManifest();
        }
      }
    }

    if (project) {
      res.json({
        active: true,
        project,
        bundle,
        references,
        manifest,
      });
    } else {
      res.json({ active: false });
    }
  });

  router.post('/projects/active', (req: Request, res: Response) => {
    const { projectId } = req.body;
    if (!projectId) return res.status(400).json({ error: 'projectId is required.' });

    const projects = projectManager.listProjects();
    const target = projects.find((p) => p.id === projectId);
    if (!target) return res.status(404).json({ error: `Project "${projectId}" not found.` });

    const loaded = projectManager.loadProjectConfig(target.outputPath);
    if (!loaded.project) {
      return res.status(500).json({ error: 'Failed to load project configuration from disk.' });
    }

    orchestrator.setProject(loaded.project, loaded.bundle, loaded.references);
    projectManager.setActiveProjectRecord(loaded.project.id, loaded.project.outputPath);

    res.json({
      success: true,
      project: loaded.project,
      bundle: loaded.bundle,
      references: loaded.references,
      manifest: orchestrator.getActiveManifest(),
    });
  });

  router.post('/projects/init', (req: Request, res: Response) => {
    const { project, bundle, references } = req.body;
    if (!project || !project.name) {
      return res.status(400).json({ error: 'Project configuration is required.' });
    }

    const pathValidation = projectManager.validateOutputPath(project.outputPath);
    if (!pathValidation.valid) {
      return res.status(400).json({ error: pathValidation.error });
    }

    project.outputPath = pathValidation.resolvedPath;
    orchestrator.setProject(project, bundle, references);

    res.json({
      success: true,
      project,
      manifest: orchestrator.getActiveManifest(),
    });
  });

  router.post('/projects/duplicate', (req: Request, res: Response) => {
    const { projectId, newName } = req.body;
    if (!projectId) return res.status(400).json({ error: 'projectId is required.' });

    const result = projectManager.duplicateProject(projectId, newName);
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  });

  router.delete('/projects/:id', (req: Request, res: Response) => {
    const projectId = req.params.id;
    const currentProject = orchestrator.getCurrentProject();
    if (currentProject && currentProject.id === projectId) {
      // Pause any running queue and clear in-memory active project so it
      // cannot resurrect on the next state refresh after disk deletion.
      orchestrator.pauseRun('Active project is being deleted.');
      orchestrator.clearActiveProject();
    }
    const result = projectManager.deleteProject(projectId);
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  });

  // Export Project Archive (Portable ZIP)
  router.get('/projects/:id/export', (req: Request, res: Response) => {
    const projectId = req.params.id;
    const projects = projectManager.listProjects();
    const target = projects.find((p) => p.id === projectId);
    if (!target) return res.status(404).send('Project not found.');

    const config = projectManager.loadProjectConfig(target.outputPath);
    if (!config.project) return res.status(404).send('Project files not found.');

    try {
      const zipBuffer = ZipArchive.exportProject(
        config.project,
        config.bundle,
        config.references,
        target.outputPath
      );

      const safeFilename = `${config.project.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_export.zip`;
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
      res.send(zipBuffer);
    } catch (err: any) {
      res.status(500).json({ error: `Export failed: ${err.message}` });
    }
  });

  // Import Project Archive (Portable ZIP)
  router.post('/projects/import', (req: Request, res: Response) => {
    try {
      const { archiveBase64, name } = req.body || {};
      if (!archiveBase64) {
        return res.status(400).json({ error: 'archiveBase64 is required for project import.' });
      }

      const buffer = Buffer.from(archiveBase64, 'base64');
      const newId = `proj-${Date.now()}`;
      const projectName = name ? name.trim() : undefined;
      const slug = (projectName || 'imported-project')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-');
      const targetDir = path.join(projectManager.getBaseDir(), `${slug}-${Date.now().toString().slice(-4)}`);

      const imported = ZipArchive.importProject(buffer, targetDir, newId, projectName);
      projectManager.saveProjectConfig(imported.project, imported.bundle, imported.references);
      orchestrator.setProject(imported.project, imported.bundle || undefined, imported.references);

      res.json({
        success: true,
        project: imported.project,
        bundle: imported.bundle,
        references: imported.references,
      });
    } catch (err: any) {
      res.status(400).json({ success: false, error: `Import failed: ${err.message}` });
    }
  });

  // Media Reference File Upload
  router.post('/references/upload', (req: Request, res: Response) => {
    try {
      const { fileName, fileBase64, category, label, mode, assignedPromptIds, refId } = req.body;
      if (!fileName || !fileBase64) {
        return res.status(400).json({ error: 'fileName and fileBase64 are required.' });
      }

      // Enforce max reference count (P-001 requirement: max 20 unique active references)
      const settings = settingsManager.getSettings();
      const maxCount = settings.maxReferenceCount || 20;
      const currentRefs = orchestrator.getCurrentReferences();
      if (currentRefs.length >= maxCount) {
        return res.status(400).json({
          success: false,
          error: `Maximum ${maxCount} references reached. Remove an existing reference before adding a new one.`,
        });
      }

      const currentProject = orchestrator.getCurrentProject();
      if (!currentProject) {
        return res.status(400).json({ error: 'No active project configured. Save project first.' });
      }

      const buffer = Buffer.from(fileBase64, 'base64');

      // Supported file types for reference assets
      const ext = path.extname(fileName).toLowerCase();
      const supportedExtensions = [
        '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.pdf', '.txt', '.md', '.json', '.mp4',
      ];
      if (!supportedExtensions.includes(ext)) {
        return res.status(400).json({
          success: false,
          error: `Unsupported file type "${ext}". Supported: PNG, JPG, JPEG, WebP, GIF, SVG, PDF, TXT, MD, JSON, MP4.`,
        });
      }

      let mimeType = 'application/octet-stream';
      let refType: ReferenceType = 'media';
      if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
      else if (ext === '.png') mimeType = 'image/png';
      else if (ext === '.webp') mimeType = 'image/webp';
      else if (ext === '.gif') mimeType = 'image/gif';
      else if (ext === '.svg') mimeType = 'image/svg+xml';
      else if (ext === '.pdf') mimeType = 'application/pdf';
      else if (ext === '.txt') { mimeType = 'text/plain'; refType = 'text'; }
      else if (ext === '.md') { mimeType = 'text/markdown'; refType = 'text'; }
      else if (ext === '.json') { mimeType = 'application/json'; refType = 'json'; }
      else if (ext === '.mp4') { mimeType = 'video/mp4'; refType = 'video'; }

      const savedAsset = projectManager.saveMediaAsset(currentProject.outputPath, fileName, buffer);

      // Format-aware server-side validation of the saved asset
      const validation = validateReferenceFile(savedAsset.path, mimeType);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: `File validation failed: ${validation.error}`,
        });
      }

      const newRef: ReferenceFile = {
        id: refId || `REF-${(category || 'custom').toUpperCase()}-${Date.now().toString().slice(-4)}`,
        name: path.basename(savedAsset.path),
        category: category || 'custom',
        label: label || fileName,
        size: savedAsset.size,
        type: mimeType,
        refType,
        path: savedAsset.path,
        checksum: savedAsset.sha256,
        assignedMode: mode || 'all',
        assignedPromptIds: assignedPromptIds || [],
        uploadedAt: new Date().toISOString(),
      };

      const updatedRefs = [...orchestrator.getCurrentReferences(), newRef];
      orchestrator.setReferences(updatedRefs);

      res.json({
        success: true,
        reference: newRef,
        asset: savedAsset,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Repeat-use suggestions
  router.get('/suggestions', (req: Request, res: Response) => {
    const suggestions = projectManager.getSuggestions();
    res.json({ suggestions });
  });

  // 5. Prompt Bundle Endpoints
  router.post('/bundle/validate', (req: Request, res: Response) => {
    const { bundle, references } = req.body;
    const result = validatePromptBundle(bundle, references || orchestrator.getCurrentReferences());
    res.json(result);
  });

  router.post('/bundle/save', (req: Request, res: Response) => {
    const { bundle } = req.body;
    if (!bundle) return res.status(400).json({ error: 'Bundle data missing.' });
    orchestrator.setBundle(bundle);
    res.json({ success: true });
  });

  // 5c. Get canonical bundle JSON from disk
  router.get('/bundle/json', (req: Request, res: Response) => {
    const currentProject = orchestrator.getCurrentProject();
    if (!currentProject) {
      return res.status(400).json({ error: 'No active project.' });
    }
    const bundlePath = path.join(currentProject.outputPath, 'input', 'prompt-bundle.json');
    if (!fs.existsSync(bundlePath)) {
      return res.status(404).json({ error: 'Bundle JSON not found on disk.' });
    }
    try {
      const content = fs.readFileSync(bundlePath, 'utf-8');
      res.json({ success: true, content });
    } catch (err: any) {
      return res.status(500).json({ error: `Failed to read bundle JSON: ${err.message}` });
    }
  });

  // 5d. Save edited bundle JSON to disk
  router.post('/bundle/save-json', (req: Request, res: Response) => {
    const currentProject = orchestrator.getCurrentProject();
    if (!currentProject) {
      return res.status(400).json({ error: 'No active project.' });
    }
    const { content } = req.body;
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'Bundle JSON content missing.' });
    }

    // Validate JSON syntax first
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch (err: any) {
      return res.status(400).json({
        success: false,
        error: `Invalid JSON syntax: ${err.message}`,
      });
    }

    // Validate against Prompt Bundle schema
    const currentRefs = orchestrator.getCurrentReferences();
    const validation = validatePromptBundle(parsed, currentRefs);
    if (!validation.valid) {
      const blocking = validation.errors.filter((e) => e.severity === 'error');
      if (blocking.length > 0) {
        return res.status(400).json({
          success: false,
          error: `Validation failed: ${blocking.map((e) => e.message).join('; ')}`,
        });
      }
    }

    const bundlePath = path.join(currentProject.outputPath, 'input', 'prompt-bundle.json');
    try {
      // Create backup before overwriting
      const backupPath = bundlePath + '.bak';
      if (fs.existsSync(bundlePath)) {
        fs.copyFileSync(bundlePath, backupPath);
      }
      fs.writeFileSync(bundlePath, content, 'utf-8');

      // Update in-memory state
      orchestrator.setBundle(parsed);

      res.json({
        success: true,
        message: 'Bundle JSON saved successfully.',
        warnings: validation.errors.filter((e) => e.severity === 'warning').map((e) => e.message),
      });
    } catch (err: any) {
      return res.status(500).json({ error: `Failed to save bundle JSON: ${err.message}` });
    }
  });
  // 6. References Endpoints
  router.post('/references/save', (req: Request, res: Response) => {
    const { references } = req.body;
    if (!Array.isArray(references)) return res.status(400).json({ error: 'References must be an array.' });
    orchestrator.setReferences(references);
    res.json({ success: true, count: references.length });
  });

  // 6c. Sync References - Reconcile stale reference IDs between bundle and registry
  router.post('/references/sync', (req: Request, res: Response) => {
    const currentProject = orchestrator.getCurrentProject();
    if (!currentProject) {
      return res.status(400).json({ error: 'No active project.' });
    }

    const { references, bundle } = req.body;
    if (!Array.isArray(references)) {
      return res.status(400).json({ success: false, error: 'References must be an array.' });
    }

    const currentBundle = orchestrator.getCurrentBundle();

    // Build a map of reference ID -> reference for quick lookup
    const refMap = new Map<string, ReferenceFile>();
    for (const ref of references) {
      refMap.set(ref.id, ref);
    }

    // 1. Check for duplicate IDs
    const seenIds = new Set<string>();
    const duplicates: string[] = [];
    for (const ref of references) {
      if (seenIds.has(ref.id)) {
        duplicates.push(ref.id);
      }
      seenIds.add(ref.id);
    }
    if (duplicates.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Duplicate reference IDs found: ${duplicates.join(', ')}`,
      });
    }

    // 2. Check prompt-specific reference assignments exist
    const bundlePromptIds = new Set((bundle?.prompts || []).map((p: any) => p.id));
    const invalidPromptRefs: string[] = [];
    for (const ref of references) {
      if (ref.assignedMode === 'selected' && ref.assignedPromptIds) {
        for (const pid of ref.assignedPromptIds) {
          if (!bundlePromptIds.has(pid)) {
            invalidPromptRefs.push(`${ref.id} -> ${pid}`);
          }
        }
      }
    }
    if (invalidPromptRefs.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Invalid prompt references: ${invalidPromptRefs.join(', ')}`,
      });
    }

    // 3. Collect all reference IDs used by prompts in the bundle
    const usedRefIds = new Set<string>();
    for (const p of bundle?.prompts || []) {
      for (const rid of p.referenceIds || []) {
        usedRefIds.add(rid);
      }
    }

    // 4. Find outdated reference IDs (used by prompts but not in registry)
    const outdatedIds: string[] = [];
    for (const rid of usedRefIds) {
      if (!refMap.has(rid)) {
        outdatedIds.push(rid);
      }
    }

    // 5. Build reconciliation - update stale reference IDs using prompt-specific assignments
    let updatedCount = 0;
    const unresolvedMappings: string[] = [];
    const updatedPrompts = (bundle?.prompts || []).map((p: any) => {
      const newRefIds: string[] = [];
      let changed = false;
      for (const rid of p.referenceIds || []) {
        if (refMap.has(rid)) {
          // Reference exists in registry - keep it
          newRefIds.push(rid);
        } else {
          // Stale reference ID - try to find a replacement
          const replacement = findReplacementRef(rid, references);
          if (replacement) {
            newRefIds.push(replacement.id);
            changed = true;
            updatedCount++;
          } else {
            // No replacement found - this is an unresolved mapping
            unresolvedMappings.push(`${p.id} -> ${rid}`);
            newRefIds.push(rid); // Keep the stale ID so we don't lose data
          }
        }
      }
      return {
        ...p,
        referenceIds: newRefIds,
      };
    });

    // 6. Build updated bundle
    const updatedBundle: any = {
      ...bundle,
      prompts: updatedPrompts,
    };

    // 7. Persist updated bundle to disk
    const bundlePath = path.join(currentProject.outputPath, 'input', 'prompt-bundle.json');
    try {
      // Create backup before overwriting
      const backupPath = bundlePath + '.bak';
      if (fs.existsSync(bundlePath)) {
        fs.copyFileSync(bundlePath, backupPath);
      }
      fs.writeFileSync(bundlePath, JSON.stringify(updatedBundle, null, 2), 'utf-8');
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: `Failed to persist synchronized bundle: ${err.message}`,
      });
    }

    // 8. Update in-memory state
    orchestrator.setBundle(updatedBundle);
    orchestrator.setReferences(references);

    // 9. Persist references via projectManager
    try {
      projectManager.saveProjectConfig(currentProject, undefined, references);
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: `Failed to persist references: ${err.message}`,
      });
    }

    res.json({
      success: true,
      referenceCount: references.length,
      referencesChecked: references.length,
      outdatedIdsDetected: outdatedIds.length,
      outdatedIds: outdatedIds,
      referencesUpdated: updatedCount,
      unresolvedMappings: unresolvedMappings,
      saved: true,
      message: `Sync complete. Checked ${references.length} reference(s), detected ${outdatedIds.length} outdated ID(s), updated ${updatedCount} assignment(s).`,
    });
  });

  // Helper: Find a replacement reference for a stale ID
  function findReplacementRef(staleId: string, references: ReferenceFile[]): ReferenceFile | null {
    // Try to extract category prefix from stale ID (e.g., REF-STYLE-01 -> STYLE)
    const match = staleId.match(/^REF-([A-Z]+)-/i);
    if (match) {
      const category = match[1].toLowerCase();
      // Look for a reference with matching category
      for (const ref of references) {
        if (ref.category === category) {
          return ref;
        }
      }
    }
    // Fallback: return first available reference
    if (references.length > 0) {
      return references[0];
    }
    return null;
  }

  // 6b. Reference count endpoint (enforces max 20 limit)
  router.get('/references/count', (req: Request, res: Response) => {
    const settings = settingsManager.getSettings();
    const currentRefs = orchestrator.getCurrentReferences();
    const maxCount = settings.maxReferenceCount || 20;
    res.json({
      count: currentRefs.length,
      max: maxCount,
      remaining: Math.max(0, maxCount - currentRefs.length),
      atLimit: currentRefs.length >= maxCount,
    });
  });

  // 7. Queue Controls
  router.post('/queue/start', async (req: Request, res: Response) => {
    const { regenerateAll } = req.body || {};
    const result = await orchestrator.startRun({ regenerateAll: Boolean(regenerateAll) });
    res.json(result);
  });

  router.post('/queue/regenerate-all', async (req: Request, res: Response) => {
    const result = await orchestrator.regenerateAll();
    res.json(result);
  });

  router.post('/queue/pause', (req: Request, res: Response) => {
    const { reason } = req.body;
    const result = orchestrator.pauseRun(reason);
    res.json(result);
  });

  router.post('/queue/resume', (req: Request, res: Response) => {
    const result = orchestrator.resumeRun();
    res.json(result);
  });

  router.post('/queue/stop', async (req: Request, res: Response) => {
    const result = await orchestrator.stopRun();
    res.json(result);
  });

  // 8. Review Center Actions
  router.post('/queue/regenerate', async (req: Request, res: Response) => {
    const { promptId } = req.body;
    if (!promptId) return res.status(400).json({ error: 'promptId is required.' });
    const result = await orchestrator.regeneratePrompt(promptId);
    res.json(result);
  });

  router.post('/queue/retry-download', async (req: Request, res: Response) => {
    const { promptId } = req.body;
    if (!promptId) return res.status(400).json({ error: 'promptId is required.' });
    const result = await orchestrator.retryDownload(promptId);
    res.json(result);
  });

  router.post('/queue/mark-reviewed', (req: Request, res: Response) => {
    const { promptId } = req.body;
    if (!promptId) return res.status(400).json({ error: 'promptId is required.' });
    const result = orchestrator.markItemReviewed(promptId);
    res.json(result);
  });

  router.post('/queue/skip-item', (req: Request, res: Response) => {
    const { promptId } = req.body;
    if (!promptId) return res.status(400).json({ error: 'promptId is required.' });
    const result = orchestrator.skipItem(promptId);
    res.json(result);
  });

  // 9. Run Manifest & History
  router.get('/queue/state', (req: Request, res: Response) => {
    res.json(orchestrator.getProgressState());
  });

  router.get('/queue/manifest', (req: Request, res: Response) => {
    const runId = req.query.runId as string | undefined;
    const currentProject = orchestrator.getCurrentProject();
    if (runId && currentProject) {
      const manifest = projectManager.loadManifest(currentProject.outputPath, runId);
      return res.json(manifest || orchestrator.getActiveManifest());
    }
    res.json(orchestrator.getActiveManifest());
  });

  router.get('/runs', (req: Request, res: Response) => {
    const currentProject = orchestrator.getCurrentProject();
    if (!currentProject) return res.json([]);
    const runs = projectManager.listProjectRuns(currentProject.outputPath);
    res.json(runs);
  });

  router.delete('/runs/:runId', (req: Request, res: Response) => {
    const currentProject = orchestrator.getCurrentProject();
    if (!currentProject) return res.status(400).json({ error: 'No active project.' });

    const runId = req.params.runId;
    const result = projectManager.deleteRunArtifacts(currentProject.outputPath, runId);
    res.json(result);
  });

  // 10. Gallery Endpoints
  router.get('/gallery', (req: Request, res: Response) => {
    const currentProject = orchestrator.getCurrentProject();
    if (!currentProject) {
      return res.json([]);
    }

    const manifest = orchestrator.getActiveManifest();
    if (!manifest) {
      return res.json([]);
    }

    const savedItems = manifest.items.filter(
      (item) => item.status === 'SAVED' && item.outputFile,
    );

    // Order by sequence number for deterministic display
    savedItems.sort((a, b) => (a.sequence || 0) - (b.sequence || 0));

    const galleryItems = savedItems.map((item) => {
      const filePath = item.outputFile!;
      let fileSize = item.fileSize || 0;
      let fileExists = false;
      try {
        fileExists = fs.existsSync(filePath);
        if (fileExists && fileSize === 0) {
          const stats = fs.statSync(filePath);
          fileSize = stats.size;
        }
      } catch {}

      // Include runId in imageUrl for cache-busting and run-aware serving.
      // This ensures the browser fetches the correct image for the active run
      // instead of serving a cached version from a previous run.
      const runId = manifest.runId || '';
      return {
        id: item.id,
        sequence: item.sequence,
        prompt: item.prompt,
        outputFile: filePath,
        fileSize,
        sha256: item.sha256,
        completedAt: item.completedAt,
        generationDurationMs: item.generationDurationMs,
        downloadDurationMs: item.downloadDurationMs,
        totalDurationMs: item.totalDurationMs,
        fileExists,
        runId,
        // Serve via /api/images/:projectId/:filename with runId cache-buster
        imageUrl: `/api/images/${currentProject.id}/${encodeURIComponent(
          path.basename(filePath),
        )}?run=${encodeURIComponent(runId)}`,
      };
    });

    // Log gallery fetch for debugging
    console.log(
      `[api/gallery] Project: ${currentProject.id}, Run: ${manifest.runId}, Images: ${galleryItems.length}, SavedCount: ${manifest.savedCount}`
    );

    res.json({
      runId: manifest.runId,
      project: {
        id: currentProject.id,
        name: currentProject.name,
        outputPath: currentProject.outputPath,
        createdAt: currentProject.createdAt,
        updatedAt: currentProject.updatedAt,
        aspectRatio: currentProject.aspectRatio,
      },
      items: galleryItems,
    });
  });

  // Serve individual gallery images safely through the app (no raw filesystem paths exposed).
  router.get('/images/:projectId/:filename', (req: Request, res: Response) => {
    // Look up project by ID (supports both active and non-active projects for previews)
    const projectId = req.params.projectId;
    let project = orchestrator.getCurrentProject();
    if (!project || project.id !== projectId) {
      const allProjects = projectManager.listProjects();
      const found = allProjects.find((p) => p.id === projectId);
      if (found) {
        const loaded = projectManager.loadProjectConfig(found.outputPath);
        if (loaded.project) {
          project = loaded.project;
        }
      }
    }
    if (!project || project.id !== projectId) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const filename = req.params.filename;
    // Prevent path traversal attacks.
    if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Invalid filename.' });
    }

    // Run-aware image resolution: prefer the specific run directory if runId is provided
    const requestedRunId = req.query.run as string | undefined;

    // Build search directories: prefer the specific run first, then output/images, then all other runs
    const searchDirs: string[] = [];

    // 1. If runId provided, search that specific run's directory FIRST
    if (requestedRunId) {
      const specificRunDir = path.join(project.outputPath, 'runs', requestedRunId, 'images');
      if (fs.existsSync(specificRunDir)) {
        searchDirs.push(specificRunDir);
      }
    }

    // 2. Search default output/images
    const defaultImagesDir = path.join(project.outputPath, 'output', 'images');
    if (fs.existsSync(defaultImagesDir)) {
      searchDirs.push(defaultImagesDir);
    }

    // 3. Search all run directories (excluding the one already searched)
    try {
      const runsDir = path.join(project.outputPath, 'runs');
      if (fs.existsSync(runsDir)) {
        for (const runDir of fs.readdirSync(runsDir)) {
          if (runDir === requestedRunId) continue; // Already searched
          const runImagesDir = path.join(runsDir, runDir, 'images');
          if (fs.existsSync(runImagesDir)) {
            searchDirs.push(runImagesDir);
          }
        }
      }
    } catch {}

    let foundPath: string | null = null;
    for (const dir of searchDirs) {
      const candidate = path.join(dir, filename);
      try {
        if (fs.existsSync(candidate)) {
          foundPath = candidate;
          break;
        }
      } catch {}
    }

    if (!foundPath) {
      return res.status(404).json({ error: 'Image not found.' });
    }

    // Determine content type from extension.
    const ext = path.extname(filename).toLowerCase();
    const contentTypeMap: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
    };
    const contentType = contentTypeMap[ext] || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    // Reduced cache time to prevent stale image serving across runs.
    // Use run-specific cache headers when runId is provided.
    if (requestedRunId) {
      res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache per run (1 hour)
    } else {
      res.setHeader('Cache-Control', 'public, max-age=300'); // Short cache for backward compat (5 min)
    }
    res.sendFile(foundPath);
  });

  // 10. Logs
  router.get('/queue/logs', (req: Request, res: Response) => {
    const currentProject = orchestrator.getCurrentProject();
    if (!currentProject) return res.json([]);
    const events = projectManager.loadRecentEvents(currentProject.outputPath);
    res.json(events);
  });

  // 11. HTML Report Endpoint
  router.get('/queue/report', (req: Request, res: Response) => {
    const currentProject = orchestrator.getCurrentProject();
    if (!currentProject) {
      return res.status(404).send('<h1>No project loaded</h1>');
    }

    const runId = req.query.runId as string | undefined;
    let reportFile = path.join(currentProject.outputPath, 'output', 'reports', 'run-report.html');
    if (runId) {
      const runReport = path.join(currentProject.outputPath, 'runs', runId, 'reports', 'run-report.html');
      if (fs.existsSync(runReport)) reportFile = runReport;
    }

    if (fs.existsSync(reportFile)) {
      res.setHeader('Content-Type', 'text/html');
      return res.send(fs.readFileSync(reportFile, 'utf-8'));
    }
    res.status(404).send('<h1>Report not generated yet</h1><p>Run the queue to generate a report.</p>');
  });

  // 12. Server-Sent Events (SSE) Stream
  router.get('/events', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const unsubscribe = orchestrator.subscribeSSE((event, data) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    });

    const interval = setInterval(() => {
      res.write(': ping\n\n');
    }, 15000);

    req.on('close', () => {
      clearInterval(interval);
      unsubscribe();
    });
  });

  return router;
}
