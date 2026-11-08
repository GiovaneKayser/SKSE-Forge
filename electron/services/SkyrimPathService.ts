import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { app } from 'electron';
import {
  SkyrimInstallInfo,
  AddressLibraryBinInfo,
  UserSettings,
} from '../../src/shared/types';

const execAsync = promisify(exec);

export class SkyrimPathService {
  private cachedInstallations: SkyrimInstallInfo[] | null = null;

  /**
   * Returns user settings file location in standard Electron userData
   */
  private getSettingsFilePath(): string {
    let baseDir: string;
    try {
      baseDir = app?.getPath ? app.getPath('userData') : path.join(os.homedir(), '.skse-forge');
    } catch {
      baseDir = path.join(process.env.APPDATA || os.homedir(), 'skse-forge');
    }

    if (!fs.existsSync(baseDir)) {
      try {
        fs.mkdirSync(baseDir, { recursive: true });
      } catch {
        // ignore
      }
    }
    return path.join(baseDir, 'settings.json');
  }

  /**
   * Reads user preferences from userData
   */
  public getUserSettings(): UserSettings {
    try {
      const filePath = this.getSettingsFilePath();
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(raw);
      }
    } catch (err) {
      console.warn('Failed to read user settings:', err);
    }
    return {};
  }

  /**
   * Updates user preferences in userData
   */
  public saveUserSettings(settings: Partial<UserSettings>): void {
    try {
      const current = this.getUserSettings();
      const updated = { ...current, ...settings };
      const filePath = this.getSettingsFilePath();
      fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf8');
    } catch (err) {
      console.warn('Failed to write user settings:', err);
    }
  }

  /**
   * Get previously configured Skyrim path
   */
  public getSavedSkyrimPath(): string | null {
    const settings = this.getUserSettings();
    if (settings.skyrimPath && fs.existsSync(settings.skyrimPath)) {
      return settings.skyrimPath;
    }
    return null;
  }

  /**
   * Save user configured Skyrim path
   */
  public saveSkyrimPath(newPath: string): boolean {
    const info = this.inspectDirectory(newPath, 'saved_settings');
    if (info) {
      this.saveUserSettings({ skyrimPath: newPath });
      this.cachedInstallations = null;
      return true;
    }
    return false;
  }

  /**
   * Queries Windows Registry for a string value
   */
  private async queryRegistry(key: string, valueName: string): Promise<string | null> {
    if (process.platform !== 'win32') return null;

    try {
      const cmd = `reg query "${key}" /v "${valueName}"`;
      const { stdout } = await execAsync(cmd, { windowsHide: true });
      const lines = stdout.split('\n');
      for (const line of lines) {
        if (line.includes(valueName)) {
          const parts = line.trim().split(/\s{2,}/);
          if (parts.length >= 3) {
            return parts[2].trim();
          }
        }
      }
    } catch {
      // Key or value not found
    }
    return null;
  }

  /**
   * Parse Steam libraryfolders.vdf file to locate all Steam game libraries across all drives
   */
  private parseSteamLibraryFolders(vdfPath: string): string[] {
    const libraryPaths: string[] = [];
    if (!fs.existsSync(vdfPath)) return libraryPaths;

    try {
      const content = fs.readFileSync(vdfPath, 'utf8');
      const pathRegex = /"path"\s+"([^"]+)"/gi;
      let match: RegExpExecArray | null;
      while ((match = pathRegex.exec(content)) !== null) {
        if (match[1]) {
          const normalized = match[1].replace(/\\\\/g, '\\');
          if (fs.existsSync(normalized)) {
            libraryPaths.push(normalized);
          }
        }
      }
    } catch (err) {
      console.warn('Error reading Steam libraryfolders.vdf:', err);
    }

    return libraryPaths;
  }

  /**
   * Detect Steam installation directory via Registry or standard locations
   */
  private async getSteamInstallPaths(): Promise<string[]> {
    const paths: string[] = [];

    // Registry keys
    const reg1 = await this.queryRegistry('HKCU\\Software\\Valve\\Steam', 'SteamPath');
    if (reg1) paths.push(path.normalize(reg1));

    const reg2 = await this.queryRegistry('HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath');
    if (reg2) paths.push(path.normalize(reg2));

    const reg3 = await this.queryRegistry('HKLM\\SOFTWARE\\Valve\\Steam', 'InstallPath');
    if (reg3) paths.push(path.normalize(reg3));

    // Common standard paths
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    paths.push(path.join(programFilesX86, 'Steam'));
    paths.push(path.join(programFiles, 'Steam'));

    return Array.from(new Set(paths.filter((p) => fs.existsSync(p))));
  }

  /**
   * Inspect a candidate folder and check if it represents a valid Skyrim SE / AE install
   */
  public inspectDirectory(
    dirPath: string,
    source: SkyrimInstallInfo['source'] = 'manual'
  ): SkyrimInstallInfo | null {
    try {
      if (!dirPath || !fs.existsSync(dirPath)) return null;

      const exePath = path.join(dirPath, 'SkyrimSE.exe');
      if (!fs.existsSync(exePath)) return null;

      const skseExe = path.join(dirPath, 'skse64_loader.exe');
      const hasSkse = fs.existsSync(skseExe);

      // Scan Data/SKSE/Plugins for .bin files
      const pluginsDir = path.join(dirPath, 'Data', 'SKSE', 'Plugins');
      const addressLibraryFiles: AddressLibraryBinInfo[] = [];

      if (fs.existsSync(pluginsDir)) {
        const files = fs.readdirSync(pluginsDir);
        for (const f of files) {
          if (f.endsWith('.bin') && (f.startsWith('version-') || f.startsWith('versionlib-'))) {
            const fullPath = path.join(pluginsDir, f);
            try {
              const stat = fs.statSync(fullPath);
              const fd = fs.openSync(fullPath, 'r');
              const headerBuf = Buffer.alloc(20);
              fs.readSync(fd, headerBuf, 0, 20, 0);
              fs.closeSync(fd);

              const format = headerBuf.readInt32LE(0);
              const version = [
                headerBuf.readUInt32LE(4),
                headerBuf.readUInt32LE(8),
                headerBuf.readUInt32LE(12),
                headerBuf.readUInt32LE(16),
              ].join('.');

              addressLibraryFiles.push({
                fileName: f,
                filePath: fullPath,
                format,
                gameVersion: version,
                sizeBytes: stat.size,
              });
            } catch {
              // ignore unreadable file
            }
          }
        }
      }

      // Detect game version: check skse64_X_Y_Z.dll first, then numeric sorted bin files
      let detectedVersion = '1.7.104.0';
      let skseVersion: string | undefined;

      try {
        const rootFiles = fs.readdirSync(dirPath);
        const skseVerDll = rootFiles.find((f) => f.startsWith('skse64_') && f.endsWith('.dll'));
        if (skseVerDll) {
          const m = skseVerDll.match(/skse64_(\d+)_(\d+)_(\d+)\.dll/);
          if (m) {
            detectedVersion = `${m[1]}.${m[2]}.${m[3]}.0`;
            skseVersion = `${m[1]}.${m[2]}.${m[3]}`;
          }
        } else if (addressLibraryFiles.length > 0) {
          const parseVer = (v: string) => v.split('.').map((n) => parseInt(n, 10) || 0);
          const sorted = [...addressLibraryFiles].sort((a, b) => {
            const va = parseVer(a.gameVersion);
            const vb = parseVer(b.gameVersion);
            for (let i = 0; i < Math.max(va.length, vb.length); i++) {
              const diff = (vb[i] || 0) - (va[i] || 0);
              if (diff !== 0) return diff;
            }
            return 0;
          });
          detectedVersion = sorted[0].gameVersion;
        }
      } catch {
        // fallback
      }

      return {
        path: path.normalize(dirPath),
        executablePath: exePath,
        gameVersion: detectedVersion,
        hasSkse,
        skseVersion,
        addressLibraryFiles,
        isDefaultSteam: dirPath.toLowerCase().includes('steam'),
        source,
      };
    } catch {
      return null;
    }
  }

  /**
   * Universally detect all Skyrim Special Edition / Anniversary Edition installations on the system
   */
  public async detectSkyrimInstallations(forceRefresh = false): Promise<SkyrimInstallInfo[]> {
    if (this.cachedInstallations && !forceRefresh) {
      return this.cachedInstallations;
    }

    const candidateList: { path: string; source: SkyrimInstallInfo['source'] }[] = [];

    // 1. User saved preference in settings.json
    const saved = this.getSavedSkyrimPath();
    if (saved) {
      candidateList.push({ path: saved, source: 'saved_settings' });
    }

    // 2. Windows Registry - Bethesda Softworks Official Key
    const regBethesda1 = await this.queryRegistry(
      'HKLM\\SOFTWARE\\WOW6432Node\\Bethesda Softworks\\Skyrim Special Edition',
      'Installed Path'
    );
    if (regBethesda1) {
      candidateList.push({ path: regBethesda1, source: 'registry' });
    }

    const regBethesda2 = await this.queryRegistry(
      'HKLM\\SOFTWARE\\Bethesda Softworks\\Skyrim Special Edition',
      'Installed Path'
    );
    if (regBethesda2) {
      candidateList.push({ path: regBethesda2, source: 'registry' });
    }

    const regBethesdaCu = await this.queryRegistry(
      'HKCU\\Software\\Bethesda Softworks\\Skyrim Special Edition',
      'Installed Path'
    );
    if (regBethesdaCu) {
      candidateList.push({ path: regBethesdaCu, source: 'registry' });
    }

    // 3. GOG Registry Keys
    const gogKeys = [
      'HKLM\\SOFTWARE\\WOW6432Node\\GOG.com\\Games\\1453480036',
      'HKLM\\SOFTWARE\\GOG.com\\Games\\1453480036',
      'HKLM\\SOFTWARE\\WOW6432Node\\GOG.com\\Games\\1711230643',
    ];
    for (const gk of gogKeys) {
      const gogPath = await this.queryRegistry(gk, 'path');
      if (gogPath) {
        candidateList.push({ path: gogPath, source: 'gog' });
      }
    }

    // 4. Steam libraryfolders.vdf parser
    const steamPaths = await this.getSteamInstallPaths();
    for (const steamDir of steamPaths) {
      const vdfFile = path.join(steamDir, 'steamapps', 'libraryfolders.vdf');
      const libraries = this.parseSteamLibraryFolders(vdfFile);
      libraries.push(steamDir); // Include root Steam dir as well

      for (const lib of libraries) {
        candidateList.push({
          path: path.join(lib, 'steamapps', 'common', 'Skyrim Special Edition'),
          source: 'steam_vdf',
        });
        candidateList.push({
          path: path.join(lib, 'steamapps', 'common', 'Skyrim Anniversary Edition'),
          source: 'steam_vdf',
        });
      }
    }

    // 5. Dynamic logical drive scanning (A: to Z:)
    if (process.platform === 'win32') {
      const driveLetters = 'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
      for (const letter of driveLetters) {
        const driveRoot = `${letter}:\\`;
        try {
          if (!fs.existsSync(driveRoot)) continue;

          candidateList.push({
            path: path.join(driveRoot, 'SteamLibrary', 'steamapps', 'common', 'Skyrim Special Edition'),
            source: 'drive_scan',
          });
          candidateList.push({
            path: path.join(driveRoot, 'Games', 'Skyrim Special Edition'),
            source: 'drive_scan',
          });
          candidateList.push({
            path: path.join(driveRoot, 'GOG Games', 'Skyrim Special Edition GOG'),
            source: 'drive_scan',
          });
        } catch {
          // ignore inaccessible drive
        }
      }
    }

    // Process and inspect all unique candidates
    const results: SkyrimInstallInfo[] = [];
    const seenPaths = new Set<string>();

    for (const item of candidateList) {
      const normalized = path.normalize(item.path).replace(/[\\/]+$/, '');
      const lower = normalized.toLowerCase();
      if (seenPaths.has(lower)) continue;
      seenPaths.add(lower);

      const info = this.inspectDirectory(normalized, item.source);
      if (info) {
        results.push(info);
      }
    }

    this.cachedInstallations = results;
    return results;
  }
}
