import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { app, dialog, BrowserWindow } from 'electron';

export interface RepositoryValidationResult {
  isValid: boolean;
  isGitRepo: boolean;
  hasCMake: boolean;
  modName: string;
  sourcePath: string;
  error?: string;
}

export class RepositoryService {
  private activeProcess: ChildProcess | null = null;
  private isCancelled = false;

  /**
   * Determine workspace storage path for cloned repositories.
   * Standardized in user settings directory (userData/workspaces).
   */
  getWorkspacesDir(): string {
    const baseDir = app?.getPath ? app.getPath('userData') : path.join(process.cwd(), '.workspaces');
    const workspaces = path.join(baseDir, 'workspaces');
    if (!fs.existsSync(workspaces)) {
      try {
        fs.mkdirSync(workspaces, { recursive: true });
      } catch {
        // fallback to temp directory
        const tempFallback = path.join(os.tmpdir(), 'skse-forge-workspaces');
        if (!fs.existsSync(tempFallback)) {
          fs.mkdirSync(tempFallback, { recursive: true });
        }
        return tempFallback;
      }
    }
    return workspaces;
  }

  /**
   * Cancel currently running repository action
   */
  cancelCurrentProcess(): void {
    this.isCancelled = true;
    if (this.activeProcess && this.activeProcess.pid) {
      const pid = this.activeProcess.pid;
      try {
        if (process.platform === 'win32') {
          spawn('taskkill', ['/F', '/T', '/PID', pid.toString()]);
        } else {
          this.activeProcess.kill('SIGKILL');
        }
      } catch (err) {
        console.error('Failed to kill process tree:', err);
      }
      this.activeProcess = null;
    }
  }

  /**
   * Clone a remote git repository recursively
   */
  async cloneRepository(
    gitUrl: string,
    gitBinary = 'git',
    onLog: (line: string, type: 'stdout' | 'stderr' | 'info') => void
  ): Promise<string> {
    this.isCancelled = false;

    // Sanitize repo name from URL with compact naming to avoid Windows MAX_PATH limits
    const urlParts = gitUrl.trim().replace(/\.git$/, '').split(/[/:]/);
    const rawRepoName = urlParts[urlParts.length - 1] || 'skse-plugin';
    const repoName = rawRepoName.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16);
    const timestamp = Date.now().toString(36).slice(-6);
    const destination = path.join(this.getWorkspacesDir(), `${repoName}_${timestamp}`);

    onLog(`Iniciando clone de ${gitUrl}...`, 'info');
    onLog(`Diretório de destino: ${destination}`, 'info');

    return new Promise((resolve, reject) => {
      const args = ['clone', '--recursive', '--progress', gitUrl.trim(), destination];
      const child = spawn(gitBinary, args, {
        windowsHide: true,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      });

      this.activeProcess = child;

      child.stdout.on('data', (data) => {
        const text = data.toString();
        onLog(text, 'stdout');
      });

      child.stderr.on('data', (data) => {
        const text = data.toString();
        onLog(text, 'stderr');
      });

      child.on('error', (err) => {
        this.activeProcess = null;
        if (this.isCancelled) {
          reject(new Error('Clonagem cancelada pelo usuário.'));
        } else {
          reject(new Error(`Falha ao executar Git: ${err.message}`));
        }
      });

      child.on('close', (code) => {
        this.activeProcess = null;
        if (this.isCancelled) {
          // Clean up partial folder if aborted
          try {
            if (fs.existsSync(destination)) {
              fs.rmSync(destination, { recursive: true, force: true });
            }
          } catch {
            // ignore cleanup error
          }
          reject(new Error('Clonagem cancelada pelo usuário.'));
          return;
        }

        if (code === 0) {
          onLog(`Repositório clonado com sucesso em: ${destination}`, 'info');
          resolve(destination);
        } else {
          reject(new Error(`git clone terminou com código de erro ${code}. Verifique a URL e suas permissões.`));
        }
      });
    });
  }

  /**
   * Validate a local path or repository URL
   */
  async validateSource(source: string): Promise<RepositoryValidationResult> {
    const trimmed = source.trim();

    // Check if it's a URL
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('git@')) {
      const urlParts = trimmed.replace(/\.git$/, '').split(/[/:]/);
      const modName = urlParts[urlParts.length - 1] || 'SKSEPlugin';
      return {
        isValid: true,
        isGitRepo: true,
        hasCMake: true, // Will be verified upon clone
        modName,
        sourcePath: trimmed,
      };
    }

    // Check if it's a local filesystem path
    if (fs.existsSync(trimmed)) {
      const stat = fs.statSync(trimmed);
      if (!stat.isDirectory()) {
        return {
          isValid: false,
          isGitRepo: false,
          hasCMake: false,
          modName: '',
          sourcePath: trimmed,
          error: 'O caminho selecionado não é um diretório.',
        };
      }

      const hasCMake = fs.existsSync(path.join(trimmed, 'CMakeLists.txt'));
      const isGitRepo = fs.existsSync(path.join(trimmed, '.git'));
      const folderName = path.basename(trimmed);

      let modName = folderName;
      if (hasCMake) {
        try {
          const cmakeContent = fs.readFileSync(path.join(trimmed, 'CMakeLists.txt'), 'utf8');
          const projectMatch = cmakeContent.match(/project\s*\(\s*([A-Za-z0-9_-]+)/i);
          if (projectMatch && projectMatch[1]) {
            modName = projectMatch[1];
          }
        } catch {
          // fallback to folderName
        }
      }

      return {
        isValid: true,
        isGitRepo,
        hasCMake,
        modName,
        sourcePath: trimmed,
      };
    }

    return {
      isValid: false,
      isGitRepo: false,
      hasCMake: false,
      modName: '',
      sourcePath: trimmed,
      error: 'Caminho local inexistente ou formato de URL inválido.',
    };
  }

  /**
   * Open native folder picker dialog
   */
  async selectDirectory(window?: BrowserWindow | null): Promise<string | null> {
    const result = await dialog.showOpenDialog(window || undefined as any, {
      properties: ['openDirectory'],
      title: 'Selecione a pasta do projeto do plugin SKSE',
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  }
}

