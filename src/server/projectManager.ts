import fs from 'node:fs';
import path from 'path';
import crypto from 'node:crypto';
import {
  ProjectConfig,
  RunManifest,
  LogEvent,
  ReferenceFile,
  ProjectSummary,
  RecentSuggestions,
} from '../types/index.ts';

export class ProjectManager {
  private baseDir: string;
  private activeProjectFile: string;
  private suggestionsFile: string;
  private knownProjectsFile: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || path.resolve(process.cwd(), 'projects');
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
    this.activeProjectFile = path.join(this.baseDir, 'active-project.json');
    this.suggestionsFile = path.join(this.baseDir, 'suggestions.json');
    this.knownProjectsFile = path.join(this.baseDir, 'known-projects.json');
  }

  public getBaseDir(): string {
    return this.baseDir;
  }

  /**
   * Validates if a user-supplied directory path is safe, absolute, and writable.
   */
  public validateOutputPath(targetPath: string): { valid: boolean; resolvedPath: string; error?: string } {
    if (!targetPath || typeof targetPath !== 'string' || !targetPath.trim()) {
      return { valid: false, resolvedPath: '', error: 'Output path cannot be blank.' };
    }

    try {
      const resolved = path.resolve(targetPath);
      // Ensure directory can be created or written to
      if (!fs.existsSync(resolved)) {
        fs.mkdirSync(resolved, { recursive: true });
      }
      // Check write test
      const testFile = path.join(resolved, `.write-test-${Date.now()}.tmp`);
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);

      return { valid: true, resolvedPath: resolved };
    } catch (err: any) {
      return { valid: false, resolvedPath: targetPath, error: `Directory not writable: ${err.message}` };
    }
  }

  /**
   * Initializes standard directory tree for a project, including run isolation directories.
   */
  public initializeProjectDirs(projectPath: string, runId?: string) {
    const dirs = [
      projectPath,
      path.join(projectPath, 'input'),
      path.join(projectPath, 'assets'),
      path.join(projectPath, 'references'),
      path.join(projectPath, 'output'),
      path.join(projectPath, 'output', 'images'),
      path.join(projectPath, 'output', 'reports'),
      path.join(projectPath, 'output', 'logs'),
      path.join(projectPath, 'project-data'),
      path.join(projectPath, 'runs'),
    ];

    if (runId) {
      dirs.push(
        path.join(projectPath, 'runs', runId),
        path.join(projectPath, 'runs', runId, 'images'),
        path.join(projectPath, 'runs', runId, 'logs'),
        path.join(projectPath, 'runs', runId, 'reports')
      );
    }

    for (const d of dirs) {
      if (!fs.existsSync(d)) {
        fs.mkdirSync(d, { recursive: true });
      }
    }
  }

  /**
   * Persists project configuration, prompt bundle, and references.
   * Records project in known projects registry and suggestion store.
   */
  public saveProjectConfig(project: ProjectConfig, bundle?: any, references?: ReferenceFile[]) {
    const projectPath = project.outputPath;
    this.initializeProjectDirs(projectPath);

    const projectDataDir = path.join(projectPath, 'project-data');
    fs.writeFileSync(
      path.join(projectDataDir, 'project.json'),
      JSON.stringify(project, null, 2),
      'utf-8'
    );

    if (bundle) {
      const inputDir = path.join(projectPath, 'input');
      fs.writeFileSync(
        path.join(inputDir, 'prompt-bundle.json'),
        JSON.stringify(bundle, null, 2),
        'utf-8'
      );
    }

    if (references) {
      fs.writeFileSync(
        path.join(projectDataDir, 'references.json'),
        JSON.stringify(references, null, 2),
        'utf-8'
      );
    }

    this.registerKnownProject(project.id, projectPath);
    this.recordSuggestions(project);
  }

  /**
   * Loads project configuration, prompt bundle, and references.
   */
  public loadProjectConfig(projectPath: string): {
    project: ProjectConfig | null;
    bundle: any | null;
    references: ReferenceFile[];
  } {
    try {
      const projectFile = path.join(projectPath, 'project-data', 'project.json');
      if (!fs.existsSync(projectFile)) return { project: null, bundle: null, references: [] };

      const project = JSON.parse(fs.readFileSync(projectFile, 'utf-8'));

      const bundleFile = path.join(projectPath, 'input', 'prompt-bundle.json');
      const bundle = fs.existsSync(bundleFile) ? JSON.parse(fs.readFileSync(bundleFile, 'utf-8')) : null;

      const refFile = path.join(projectPath, 'project-data', 'references.json');
      let references: ReferenceFile[] = fs.existsSync(refFile)
        ? JSON.parse(fs.readFileSync(refFile, 'utf-8'))
        : [];

      // Validate references and resolve local paths if needed
      references = references.map((ref) => {
        if (!ref.path || !fs.existsSync(ref.path)) {
          const candidateInAssets = path.join(projectPath, 'assets', ref.name);
          const candidateInRefs = path.join(projectPath, 'references', ref.name);
          if (fs.existsSync(candidateInAssets)) {
            ref.path = candidateInAssets;
            ref.size = fs.statSync(candidateInAssets).size;
          } else if (fs.existsSync(candidateInRefs)) {
            ref.path = candidateInRefs;
            ref.size = fs.statSync(candidateInRefs).size;
          }
        }
        return ref;
      });

      return { project, bundle, references };
    } catch {
      return { project: null, bundle: null, references: [] };
    }
  }

  /**
   * Saves a media reference asset file to the project's assets directory.
   */
  public saveMediaAsset(
    projectPath: string,
    fileName: string,
    buffer: Buffer
  ): { path: string; size: number; sha256: string } {
    const assetsDir = path.join(projectPath, 'assets');
    if (!fs.existsSync(assetsDir)) {
      fs.mkdirSync(assetsDir, { recursive: true });
    }

    // Sanitize filename
    const safeName = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
    const targetPath = path.join(assetsDir, safeName);
    fs.writeFileSync(targetPath, buffer);

    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    return {
      path: targetPath,
      size: buffer.length,
      sha256,
    };
  }

  /**
   * Saves run manifest under run-scoped directory AND updates project pointer.
   */
  public saveManifest(projectPath: string, manifest: RunManifest) {
    this.initializeProjectDirs(projectPath, manifest.runId);

    // 1. Run-scoped manifest
    const runDir = path.join(projectPath, 'runs', manifest.runId);
    const runManifestFile = path.join(runDir, 'manifest.json');
    fs.writeFileSync(runManifestFile, JSON.stringify(manifest, null, 2), 'utf-8');

    // 2. Project-level pointer for active manifest
    const projectManifestFile = path.join(projectPath, 'project-data', 'manifest.json');
    fs.writeFileSync(projectManifestFile, JSON.stringify(manifest, null, 2), 'utf-8');
  }

  /**
   * Loads manifest for a specific run or the latest run.
   */
  public loadManifest(projectPath: string, runId?: string): RunManifest | null {
    try {
      if (runId) {
        const runManifestFile = path.join(projectPath, 'runs', runId, 'manifest.json');
        if (fs.existsSync(runManifestFile)) {
          return JSON.parse(fs.readFileSync(runManifestFile, 'utf-8'));
        }
      }

      const manifestFile = path.join(projectPath, 'project-data', 'manifest.json');
      if (fs.existsSync(manifestFile)) {
        return JSON.parse(fs.readFileSync(manifestFile, 'utf-8'));
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Lists all execution runs for a project.
   */
  public listProjectRuns(projectPath: string): RunManifest[] {
    const runsDir = path.join(projectPath, 'runs');
    if (!fs.existsSync(runsDir)) return [];

    try {
      const entries = fs.readdirSync(runsDir, { withFileTypes: true });
      const runs: RunManifest[] = [];

      for (const e of entries) {
        if (e.isDirectory()) {
          const runManifestFile = path.join(runsDir, e.name, 'manifest.json');
          if (fs.existsSync(runManifestFile)) {
            try {
              const parsed = JSON.parse(fs.readFileSync(runManifestFile, 'utf-8'));
              runs.push(parsed);
            } catch {}
          }
        }
      }

      // Sort newest first
      return runs.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
    } catch {
      return [];
    }
  }

  /**
   * Safely deletes all artifacts for a specific run without touching project templates.
   */
  public deleteRunArtifacts(
    projectPath: string,
    runId: string
  ): { success: boolean; deletedFilesCount: number; error?: string } {
    try {
      let deletedCount = 0;
      const runDir = path.join(projectPath, 'runs', runId);

      if (fs.existsSync(runDir)) {
        const countFiles = (dir: string): number => {
          let count = 0;
          for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, item.name);
            if (item.isDirectory()) {
              count += countFiles(p);
            } else {
              count += 1;
            }
          }
          return count;
        };

        deletedCount = countFiles(runDir);
        fs.rmSync(runDir, { recursive: true, force: true });
      }

      // If active manifest points to this run, clear or restore previous run
      const projectManifestFile = path.join(projectPath, 'project-data', 'manifest.json');
      if (fs.existsSync(projectManifestFile)) {
        try {
          const currentManifest: RunManifest = JSON.parse(fs.readFileSync(projectManifestFile, 'utf-8'));
          if (currentManifest.runId === runId) {
            const remainingRuns = this.listProjectRuns(projectPath);
            if (remainingRuns.length > 0) {
              fs.writeFileSync(projectManifestFile, JSON.stringify(remainingRuns[0], null, 2), 'utf-8');
            } else {
              fs.unlinkSync(projectManifestFile);
            }
          }
        } catch {}
      }

      return { success: true, deletedFilesCount: deletedCount };
    } catch (err: any) {
      return { success: false, deletedFilesCount: 0, error: err.message };
    }
  }

  public saveRunState(projectPath: string, runState: any) {
    this.initializeProjectDirs(projectPath);
    const stateFile = path.join(projectPath, 'project-data', 'run-state.json');
    fs.writeFileSync(stateFile, JSON.stringify(runState, null, 2), 'utf-8');
  }

  public loadRunState(projectPath: string): any | null {
    const stateFile = path.join(projectPath, 'project-data', 'run-state.json');
    if (!fs.existsSync(stateFile)) return null;
    try {
      return JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    } catch {
      return null;
    }
  }

  public appendEvent(projectPath: string, event: LogEvent) {
    try {
      this.initializeProjectDirs(projectPath, event.runId);

      // Project-level event log
      const eventsFile = path.join(projectPath, 'project-data', 'events.jsonl');
      fs.appendFileSync(eventsFile, JSON.stringify(event) + '\n', 'utf-8');

      const logFile = path.join(projectPath, 'output', 'logs', 'run.log');
      const readableLine = `[${event.timestamp}] [${event.severity.toUpperCase()}] [${event.type}] ${event.promptId ? `[${event.promptId}] ` : ''}${event.message}\n`;
      fs.appendFileSync(logFile, readableLine, 'utf-8');

      // Run-scoped event log if runId is set
      if (event.runId) {
        const runLogDir = path.join(projectPath, 'runs', event.runId, 'logs');
        if (fs.existsSync(runLogDir)) {
          fs.appendFileSync(path.join(runLogDir, 'events.jsonl'), JSON.stringify(event) + '\n', 'utf-8');
          fs.appendFileSync(path.join(runLogDir, 'run.log'), readableLine, 'utf-8');
        }
      }
    } catch {
      // ignore logging failures
    }
  }

  public loadRecentEvents(projectPath: string, limit = 100): LogEvent[] {
    try {
      const eventsFile = path.join(projectPath, 'project-data', 'events.jsonl');
      if (!fs.existsSync(eventsFile)) return [];
      const content = fs.readFileSync(eventsFile, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      const parsed: LogEvent[] = [];
      for (let i = Math.max(0, lines.length - limit); i < lines.length; i++) {
        try {
          parsed.push(JSON.parse(lines[i]));
        } catch {}
      }
      return parsed;
    } catch {
      return [];
    }
  }

  /**
   * Reconciles files on disk with the manifest after restart.
   * Scopes candidate files to the run-isolated directory first to prevent stale-file interference.
   */
  public reconcileFilesWithManifest(projectPath: string, manifest: RunManifest): RunManifest {
    // Isolated images directory for this specific run
    const runImagesDir = path.join(projectPath, 'runs', manifest.runId, 'images');
    const defaultImagesDir = path.join(projectPath, 'output', 'images');
    const imagesDir = fs.existsSync(runImagesDir) ? runImagesDir : defaultImagesDir;

    const inFlightStatuses = ['PREPARING', 'SUBMITTING', 'GENERATING', 'DOWNLOADING'];

    const updatedItems = manifest.items.map((item) => {
      const candidateNames = [
        item.outputFile ? path.basename(item.outputFile) : null,
        `${item.id}.png`,
        `${item.id}.jpg`,
        `${item.id}.jpeg`,
        `${item.id}.webp`,
        `${item.id}.svg`,
      ].filter(Boolean) as string[];

      let foundPath: string | null = null;
      let foundSize = 0;

      // 1. Check if item.outputFile directly exists and has non-zero size
      if (item.outputFile && fs.existsSync(item.outputFile)) {
        const sz = fs.statSync(item.outputFile).size;
        if (sz > 0) {
          foundPath = item.outputFile;
          foundSize = sz;
        }
      }

      // 2. Search candidate filenames across runImagesDir and defaultImagesDir
      if (!foundPath) {
        for (const name of candidateNames) {
          for (const dir of [runImagesDir, defaultImagesDir]) {
            const p = path.join(dir, name);
            if (fs.existsSync(p)) {
              const sz = fs.statSync(p).size;
              if (sz > 0) {
                foundPath = p;
                foundSize = sz;
                break;
              }
            }
          }
          if (foundPath) break;
        }
      }

      if (item.status === 'SAVED') {
        if (!foundPath || foundSize === 0) {
          return {
            ...item,
            status: 'NEEDS_REVIEW' as const,
            outputFile: null,
            fileSize: null,
            reviewReason: 'Saved image file not found on disk during startup reconciliation.',
            suggestedAction: 'Inspect output directory or re-run prompt.',
          };
        } else {
          return {
            ...item,
            outputFile: foundPath,
            fileSize: foundSize,
          };
        }
      }

      // Check if previous in-flight operation was interrupted
      if (inFlightStatuses.includes(item.status)) {
        if (foundPath && foundSize > 0) {
          return {
            ...item,
            status: 'SAVED' as const,
            outputFile: foundPath,
            fileSize: foundSize,
            reviewReason: undefined,
            suggestedAction: undefined,
          };
        } else {
          return {
            ...item,
            status: 'NEEDS_REVIEW' as const,
            reviewReason: `Interrupted in-flight operation (${item.status}) detected upon startup. No output image on disk.`,
            suggestedAction: 'Verify whether image was generated in provider UI before retrying.',
          };
        }
      }

      return item;
    });

    const terminalStatuses = ['SAVED', 'NEEDS_REVIEW', 'FAILED', 'SKIPPED', 'CANCELLED'];
    const savedCount = updatedItems.filter((i) => i.status === 'SAVED').length;
    const reviewCount = updatedItems.filter((i) => i.status === 'NEEDS_REVIEW').length;
    const failedCount = updatedItems.filter((i) => i.status === 'FAILED').length;
    const skippedCount = updatedItems.filter((i) => i.status === 'SKIPPED').length;
    const cancelledCount = updatedItems.filter((i) => i.status === 'CANCELLED').length;
    const processedCount = updatedItems.filter((i) => terminalStatuses.includes(i.status)).length;

    let overallStatus = manifest.overallStatus;
    if (overallStatus === 'RUNNING') {
      overallStatus = processedCount === updatedItems.length ? 'COMPLETED' : 'PAUSED';
    }

    return {
      ...manifest,
      overallStatus,
      items: updatedItems,
      totalPrompts: updatedItems.length,
      processedCount,
      savedCount,
      reviewCount,
      failedCount,
      skippedCount,
      cancelledCount,
    };
  }

  /**
   * Lists all existing projects in project storage with rich summary metrics.
   */
  public listProjects(): ProjectSummary[] {
    const knownPaths = this.getKnownProjectPaths();
    const projects: ProjectSummary[] = [];
    const seenIds = new Set<string>();

    for (const projPath of knownPaths) {
      if (fs.existsSync(projPath)) {
        const config = this.loadProjectConfig(projPath);
        if (config.project && !seenIds.has(config.project.id)) {
          seenIds.add(config.project.id);
          const manifest = this.loadManifest(projPath);
          projects.push({
            id: config.project.id,
            name: config.project.name,
            outputPath: projPath,
            provider: config.project.provider,
            createdAt: config.project.createdAt || new Date().toISOString(),
            updatedAt: config.project.updatedAt || new Date().toISOString(),
            promptCount: config.bundle?.prompts?.length || 0,
            referenceCount: config.references?.length || 0,
            lastRunStatus: manifest?.overallStatus,
            lastRunId: manifest?.runId,
            savedCount: manifest?.savedCount || 0,
          });
        }
      }
    }

    return projects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  /**
   * Duplicates an existing project into a reusable new template project.
   * Copies configuration, prompt bundle, and reference assets, but resets execution run outputs.
   */
  public duplicateProject(
    sourceProjectId: string,
    newName?: string
  ): { success: boolean; project?: ProjectConfig; error?: string } {
    try {
      const allProjects = this.listProjects();
      const source = allProjects.find((p) => p.id === sourceProjectId);
      if (!source) {
        return { success: false, error: `Source project "${sourceProjectId}" not found.` };
      }

      const sourceData = this.loadProjectConfig(source.outputPath);
      if (!sourceData.project) {
        return { success: false, error: 'Could not load source project configuration.' };
      }

      const newId = `proj-${Date.now()}`;
      const projectName = newName || `Copy of ${sourceData.project.name}`;
      const slug = projectName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
      const newPath = path.join(this.baseDir, `${slug}-${Date.now().toString().slice(-4)}`);

      this.initializeProjectDirs(newPath);

      // Copy assets if they exist
      const srcAssets = path.join(source.outputPath, 'assets');
      const dstAssets = path.join(newPath, 'assets');
      if (fs.existsSync(srcAssets)) {
        for (const file of fs.readdirSync(srcAssets)) {
          fs.copyFileSync(path.join(srcAssets, file), path.join(dstAssets, file));
        }
      }

      // Remap references to new asset paths
      const newReferences = sourceData.references.map((r) => {
        const copy = { ...r };
        const localAsset = path.join(dstAssets, r.name);
        if (fs.existsSync(localAsset)) {
          copy.path = localAsset;
        }
        return copy;
      });

      const newProject: ProjectConfig = {
        ...sourceData.project,
        id: newId,
        name: projectName,
        outputPath: newPath,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      this.saveProjectConfig(newProject, sourceData.bundle, newReferences);
      return { success: true, project: newProject };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Deletes a project completely and removes from registries.
   */
  public deleteProject(projectId: string): { success: boolean; error?: string } {
    try {
      const allProjects = this.listProjects();
      const proj = allProjects.find((p) => p.id === projectId);
      if (!proj) {
        return { success: false, error: `Project "${projectId}" not found.` };
      }

      if (fs.existsSync(proj.outputPath)) {
        fs.rmSync(proj.outputPath, { recursive: true, force: true });
      }

      this.unregisterKnownProject(projectId);

      // Clear active project if it was the one deleted
      const active = this.getActiveProjectRecord();
      if (active && active.activeProjectId === projectId) {
        this.clearActiveProjectRecord();
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Active project persistence across reboots.
   */
  public getActiveProjectRecord(): { activeProjectId: string; activeProjectPath: string } | null {
    try {
      if (fs.existsSync(this.activeProjectFile)) {
        return JSON.parse(fs.readFileSync(this.activeProjectFile, 'utf-8'));
      }
    } catch {}
    return null;
  }

  public setActiveProjectRecord(projectId: string, projectPath: string) {
    try {
      fs.writeFileSync(
        this.activeProjectFile,
        JSON.stringify({ activeProjectId: projectId, activeProjectPath: projectPath }, null, 2),
        'utf-8'
      );
    } catch {}
  }

  public clearActiveProjectRecord() {
    try {
      if (fs.existsSync(this.activeProjectFile)) {
        fs.unlinkSync(this.activeProjectFile);
      }
    } catch {}
  }

  /**
   * Autocomplete and last-used suggestions persistence.
   */
  public getSuggestions(): RecentSuggestions {
    try {
      if (fs.existsSync(this.suggestionsFile)) {
        return JSON.parse(fs.readFileSync(this.suggestionsFile, 'utf-8'));
      }
    } catch {}

    return {
      conversationUrls: [
        'https://chatgpt.com/c/my-session-id',
        'https://gemini.google.com/app',
      ],
      outputPaths: ['./project-data/my-project'],
      styleDescriptions: [
        'Cinematic 35mm film grain, moody chiaroscuro lighting, photorealistic textures',
        'Minimalist hand-drawn illustration style, simple clean black outlines, pastel accents',
        'Vibrant anime style, studio quality, detailed backgrounds, dramatic volumetric lighting',
      ],
      instructions: [
        'Ensure consistent protagonist clothing and appearance across all scenes.',
        'Maintain exact color palette, camera framing, and lighting direction.',
      ],
    };
  }

  public recordSuggestions(project: ProjectConfig) {
    try {
      const current = this.getSuggestions();
      const addUnique = (arr: string[], val?: string) => {
        if (!val || !val.trim()) return arr;
        const trimmed = val.trim();
        const filtered = arr.filter((x) => x !== trimmed);
        return [trimmed, ...filtered].slice(0, 8); // Keep top 8 recent
      };

      const updated: RecentSuggestions = {
        conversationUrls: addUnique(current.conversationUrls, project.conversationUrl),
        outputPaths: addUnique(current.outputPaths, project.outputPath),
        styleDescriptions: addUnique(current.styleDescriptions, project.styleDescription),
        instructions: addUnique(current.instructions, project.instructions),
      };

      fs.writeFileSync(this.suggestionsFile, JSON.stringify(updated, null, 2), 'utf-8');
    } catch {}
  }

  private getKnownProjectPaths(): string[] {
    const paths = new Set<string>();

    // 1. Scan baseDir
    if (fs.existsSync(this.baseDir)) {
      for (const entry of fs.readdirSync(this.baseDir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          const subDir = path.join(this.baseDir, entry.name);
          if (fs.existsSync(path.join(subDir, 'project-data', 'project.json'))) {
            paths.add(subDir);
          }
        }
      }
    }

    // 2. Read known registry
    if (fs.existsSync(this.knownProjectsFile)) {
      try {
        const raw = JSON.parse(fs.readFileSync(this.knownProjectsFile, 'utf-8'));
        if (Array.isArray(raw)) {
          for (const p of raw) {
            if (typeof p === 'string' && fs.existsSync(p)) {
              paths.add(path.resolve(p));
            }
          }
        }
      } catch {}
    }

    return Array.from(paths);
  }

  private registerKnownProject(id: string, projectPath: string) {
    try {
      const currentPaths = this.getKnownProjectPaths();
      const normalized = path.resolve(projectPath);
      if (!currentPaths.includes(normalized)) {
        currentPaths.push(normalized);
      }
      fs.writeFileSync(this.knownProjectsFile, JSON.stringify(currentPaths, null, 2), 'utf-8');
    } catch {}
  }

  private unregisterKnownProject(id: string) {
    try {
      const all = this.listProjects();
      const remainingPaths = all.filter((p) => p.id !== id).map((p) => p.outputPath);
      fs.writeFileSync(this.knownProjectsFile, JSON.stringify(remainingPaths, null, 2), 'utf-8');
    } catch {}
  }
}
