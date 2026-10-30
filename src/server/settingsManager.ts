import fs from 'node:fs';
import path from 'path';

export interface AppSettings {
  chromePath: string;
  profileDir: string;
  debugPort: number;
  startupTimeoutMs: number;
  connectionTimeoutMs: number;
  genTimeoutSeconds: number;
  downloadTimeoutSeconds: number;
  initialObservationDelayMs: number;
  defaultOutputPath: string;
  maxReferenceCount: number;
}

export interface ResolvedAppSettings extends AppSettings {
  resolvedProfileDir: string;
  resolvedDefaultOutputPath: string;
  appRootDir: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  chromePath: '',
  profileDir: './browser-profile',
  debugPort: 9222,
  startupTimeoutMs: 30000,
  connectionTimeoutMs: 15000,
  genTimeoutSeconds: 120,
  downloadTimeoutSeconds: 15,
  initialObservationDelayMs: 18000,
  defaultOutputPath: './project-data',
  maxReferenceCount: 20,
};

export class SettingsManager {
  private storageDir: string;
  private appRootDir: string;
  private settingsFilePath: string;
  private currentSettings: AppSettings;

  constructor(storageDir?: string, appRootDir?: string) {
    this.appRootDir = appRootDir ? path.resolve(appRootDir) : process.cwd();
    this.storageDir = storageDir ? path.resolve(storageDir) : path.join(this.appRootDir, 'project-data');
    this.settingsFilePath = path.join(this.storageDir, 'settings.json');

    if (!fs.existsSync(this.storageDir)) {
      try {
        fs.mkdirSync(this.storageDir, { recursive: true });
      } catch {}
    }

    this.currentSettings = this.loadSettings();
  }

  public getAppRootDir(): string {
    return this.appRootDir;
  }

  public getSettings(): ResolvedAppSettings {
    const raw = { ...this.currentSettings };
    const resolvedProfileDir = path.isAbsolute(raw.profileDir)
      ? path.normalize(raw.profileDir)
      : path.normalize(path.resolve(this.appRootDir, raw.profileDir));

    const resolvedDefaultOutputPath = path.isAbsolute(raw.defaultOutputPath)
      ? path.normalize(raw.defaultOutputPath)
      : path.normalize(path.resolve(this.appRootDir, raw.defaultOutputPath));

    return {
      ...raw,
      resolvedProfileDir,
      resolvedDefaultOutputPath,
      appRootDir: this.appRootDir,
    };
  }

  public updateSettings(
    newSettings: Partial<AppSettings>,
    isQueueRunning = false
  ): { success: boolean; settings?: ResolvedAppSettings; error?: string } {
    try {
      const merged: AppSettings = {
        ...this.currentSettings,
        ...newSettings,
      };

      // Validation 1: Prevent changing profileDir or debugPort during active run
      if (isQueueRunning) {
        if (
          newSettings.profileDir !== undefined &&
          path.normalize(newSettings.profileDir) !== path.normalize(this.currentSettings.profileDir)
        ) {
          return {
            success: false,
            error: 'Cannot modify dedicated browser profile directory while a queue run is active.',
          };
        }
        if (
          newSettings.debugPort !== undefined &&
          Number(newSettings.debugPort) !== this.currentSettings.debugPort
        ) {
          return {
            success: false,
            error: 'Cannot modify CDP debug port while a queue run is active.',
          };
        }
      }

      // Validation 2: Profile directory safety & modern Chrome security restriction
      if (!merged.profileDir || typeof merged.profileDir !== 'string' || !merged.profileDir.trim()) {
        return { success: false, error: 'Browser profile directory cannot be empty.' };
      }

      const resolvedProfile = path.isAbsolute(merged.profileDir)
        ? path.normalize(merged.profileDir)
        : path.normalize(path.resolve(this.appRootDir, merged.profileDir));

      if (this.isDefaultChromeProfile(resolvedProfile)) {
        return {
          success: false,
          error:
            'Security Restriction: Modern Google Chrome restricts remote debugging against the default Chrome profile. You must use a dedicated automation profile directory (e.g. ./browser-profile).',
        };
      }

      // Validation 3: Debug port range
      const port = Number(merged.debugPort);
      if (isNaN(port) || port < 1024 || port > 65535) {
        return {
          success: false,
          error: 'CDP debug port must be a valid port number between 1024 and 65535.',
        };
      }
      merged.debugPort = port;

      // Validation 4: Timeouts
      if (merged.startupTimeoutMs < 2000) {
        merged.startupTimeoutMs = 2000;
      }
      if (merged.connectionTimeoutMs < 1000) {
        merged.connectionTimeoutMs = 1000;
      }
      if (merged.genTimeoutSeconds < 5) {
        merged.genTimeoutSeconds = 5;
      }
      if (merged.downloadTimeoutSeconds < 3) {
        merged.downloadTimeoutSeconds = 3;
      }

      // Validation 5: Max reference count
      if (merged.maxReferenceCount === undefined || merged.maxReferenceCount < 1) {
        merged.maxReferenceCount = 20;
      }
      if (merged.maxReferenceCount > 100) {
        merged.maxReferenceCount = 100;
      }

      // Save to disk
      this.currentSettings = merged;
      this.saveSettings(merged);

      return {
        success: true,
        settings: this.getSettings(),
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  public isDefaultChromeProfile(candidatePath: string): boolean {
    const normCandidate = path.normalize(path.resolve(candidatePath)).toLowerCase();

    // Check Windows standard default user data dir
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      const defaultWinPath = path.normalize(
        path.resolve(localAppData, 'Google', 'Chrome', 'User Data')
      ).toLowerCase();
      if (normCandidate === defaultWinPath || normCandidate.startsWith(defaultWinPath + path.sep)) {
        return true;
      }
    }

    // Check macOS standard default user data dir
    const homeDir = process.env.HOME;
    if (homeDir) {
      const defaultMacPath = path.normalize(
        path.resolve(homeDir, 'Library', 'Application Support', 'Google', 'Chrome')
      ).toLowerCase();
      if (normCandidate === defaultMacPath || normCandidate.startsWith(defaultMacPath + path.sep)) {
        return true;
      }

      // Check Linux standard default user data dir
      const defaultLinuxPath = path.normalize(
        path.resolve(homeDir, '.config', 'google-chrome')
      ).toLowerCase();
      if (normCandidate === defaultLinuxPath || normCandidate.startsWith(defaultLinuxPath + path.sep)) {
        return true;
      }
    }

    return false;
  }

  private loadSettings(): AppSettings {
    try {
      if (fs.existsSync(this.settingsFilePath)) {
        const raw = fs.readFileSync(this.settingsFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
        };
      }
    } catch (err) {
      console.warn(`[SettingsManager] Warning: failed to parse settings file at ${this.settingsFilePath}:`, err);
    }

    // Write default settings file
    this.saveSettings(DEFAULT_SETTINGS);
    return { ...DEFAULT_SETTINGS };
  }

  private saveSettings(settings: AppSettings): void {
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }
      fs.writeFileSync(this.settingsFilePath, JSON.stringify(settings, null, 2), 'utf-8');
    } catch (err) {
      console.error(`[SettingsManager] Error saving settings to ${this.settingsFilePath}:`, err);
    }
  }
}
