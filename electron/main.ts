import { app, BrowserWindow, ipcMain, shell, dialog, Menu } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { EnvironmentService } from './services/EnvironmentService';
import { RepositoryService } from './services/RepositoryService';
import { PatchEngineService } from './services/PatchEngineService';
import { BuildService } from './services/BuildService';
import { BinaryCompatibilityService } from './services/BinaryCompatibilityService';
import { SkyrimPathService } from './services/SkyrimPathService';
import {
  PipelinePayload,
  PipelineResult,
  PipelinePhase,
  TransmuteOptions,
  TransmuteResult,
  LogMessage,
} from '../src/shared/types';

let mainWindow: BrowserWindow | null = null;

const envService = new EnvironmentService();
const repoService = new RepositoryService();
const patchService = new PatchEngineService();
const buildService = new BuildService();
const skyrimPathService = new SkyrimPathService();
const binaryService = new BinaryCompatibilityService(skyrimPathService);

let isPipelineRunning = false;

function createWindow() {
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 840,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: '#090a0f',
    title: 'SKSE Forge',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  mainWindow.removeMenu();

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Open external links in default system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handler: Environment Detection
ipcMain.handle('env:detect', async (_, forceRefresh: boolean) => {
  return await envService.detectEnvironment(forceRefresh);
});

// IPC Handler: Validate source path / git url
ipcMain.handle('repo:validate', async (_, source: string) => {
  return await repoService.validateSource(source);
});

// IPC Handler: Directory Picker Dialog
ipcMain.handle('repo:select-dir', async () => {
  return await repoService.selectDirectory(mainWindow);
});

// Helper to broadcast log message to renderer
function emitLog(
  text: string,
  type: LogMessage['type'] = 'info'
) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('pipeline:log', {
      text,
      type,
      timestamp: Date.now(),
    });
  }
}

// Helper to broadcast phase update to renderer
function emitPhase(
  phase: PipelinePhase,
  detail?: string
) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('pipeline:phase', { phase, detail });
  }
}

// IPC Handler: Start Pipeline Execution
ipcMain.handle('pipeline:start', async (_, payload: PipelinePayload): Promise<PipelineResult> => {
  if (isPipelineRunning) {
    throw new Error('Já existe um processo de forjamento em execução.');
  }

  isPipelineRunning = true;

  try {
    const { source, customModName } = payload;
    emitLog('Iniciando pipeline do SKSE Forge...', 'info');

    // Step 0: Ensure environment is ready
    emitLog('Verificando ferramentas do ambiente...', 'info');
    const envReport = await envService.detectEnvironment();

    if (!envReport.msvc.found) {
      throw new Error('Visual Studio com MSVC C++ não foi detectado no sistema.');
    }

    if (!envReport.cmake.found || !envReport.resolvedPaths.cmake) {
      throw new Error('CMake não foi encontrado no PATH nem no diretório do Visual Studio.');
    }

    const cmakeBinary = envReport.resolvedPaths.cmake;
    const gitBinary = envReport.resolvedPaths.git || 'git';
    const vcpkgToolchain = envReport.resolvedPaths.vcpkgToolchain;

    // Step 1: Clone or select local folder
    let workingDir = '';
    const isRemote = source.startsWith('http://') || source.startsWith('https://') || source.startsWith('git@');

    if (isRemote) {
      emitPhase('clone', `Clonando repositório remoto: ${source}`);
      workingDir = await repoService.cloneRepository(source, gitBinary, (line, type) => {
        emitLog(line, type);
      });
    } else {
      emitPhase('clone', `Carregando pasta local do mod...`);
      if (!fs.existsSync(source)) {
        throw new Error(`Pasta local informada não existe: ${source}`);
      }
      workingDir = source;
      emitLog(`Usando diretório local existente: ${workingDir}`, 'info');
    }

    // Determine target mod name
    const finalModName = customModName?.trim() || path.basename(workingDir);
    emitLog(`Mod selecionado: ${finalModName}`, 'info');

    // Step 2 & 3: Scan and patch project with CommonLibSSE-NG
    emitPhase('scan', 'Analisando arquivos CMakeLists.txt e dependências...');
    emitPhase('patch', 'Injetando CommonLibSSE-NG e compatibilizações de build...');
    const patchReport = await patchService.patchProject(workingDir, (line: string, type: 'stdout' | 'stderr' | 'info') => {
      emitLog(line, type);
    });

    // Step 4, 5 & 6: Configure, Build, and Package with BuildService
    emitPhase('configure', 'Gerando arquivos de build x64 com CMake...');
    emitPhase('build', 'Compilando DLL com MSVC (Release x64)...');
    emitPhase('package', 'Localizando binários compilados e empacotando ZIP...');
    const buildResult = await buildService.buildAndPackage(
      {
        projectDir: workingDir,
        sourceDir: patchReport.sourceDir,
        cmakeBinary,
        vcpkgToolchain,
        modName: finalModName,
      },
      (line: string, type: 'stdout' | 'stderr' | 'info' | 'warn' | 'error' | 'success') => emitLog(line, type)
    );

    const pipelineResult: PipelineResult = {
      success: true,
      modName: finalModName,
      dllPath: buildResult.dllPath,
      distDir: buildResult.distDir,
      zipPath: buildResult.zipPath,
      durationMs: buildResult.durationMs,
      filesPackaged: buildResult.filesPackaged,
      patchReport: {
        appliedPatches: patchReport.appliedPatches,
        modifiedFiles: patchReport.modifiedFiles,
      },
      warnings: patchReport.warnings,
    };

    emitPhase('completed', 'Plugin forjado e empacotado com sucesso!');
    emitLog(
      `Processo concluído com êxito em ${(buildResult.durationMs / 1000).toFixed(1)}s! Pacote gerado em: ${buildResult.zipPath}`,
      'success'
    );

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('pipeline:complete', pipelineResult);
    }

    return pipelineResult;
  } catch (err: any) {
    emitPhase('failed', err.message || 'Falha desconhecida no pipeline.');
    emitLog(`Erro fatal: ${err.message}`, 'error');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('pipeline:error', { message: err.message });
    }
    throw err;
  } finally {
    isPipelineRunning = false;
  }
});

// IPC Handler: Cancel Running Pipeline
ipcMain.handle('pipeline:cancel', async () => {
  if (!isPipelineRunning) return false;
  emitLog('Solicitação de cancelamento recebida...', 'warn');
  repoService.cancelCurrentProcess();
  buildService.cancelCurrentBuild();
  isPipelineRunning = false;
  emitPhase('failed', 'Processo cancelado pelo usuário.');
  return true;
});

// IPC Handler: Open destination folder in system explorer
ipcMain.handle('action:open-destination', async (_, targetPath: string) => {
  if (!targetPath) return;
  if (fs.existsSync(targetPath)) {
    shell.showItemInFolder(targetPath);
  } else {
    const parent = path.dirname(targetPath);
    if (fs.existsSync(parent)) {
      shell.openPath(parent);
    }
  }
});

// IPC Handler: Copy to Clipboard
ipcMain.handle('action:copy-clipboard', async (_, text: string) => {
  const { clipboard } = require('electron');
  clipboard.writeText(text);
});

// Helper to broadcast binary logs to renderer
function emitBinaryLog(
  text: string,
  type: LogMessage['type'] = 'info'
) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('binary:log', {
      text,
      type,
      timestamp: Date.now(),
    });
  }
}

// IPC Handlers: Skyrim Path Service & Detection
ipcMain.handle('binary:detect-skyrim', async () => {
  return await skyrimPathService.detectSkyrimInstallations();
});

ipcMain.handle('skyrim:get-saved', async () => {
  return skyrimPathService.getSavedSkyrimPath();
});

ipcMain.handle('skyrim:save-path', async (_, newPath: string) => {
  return skyrimPathService.saveSkyrimPath(newPath);
});

ipcMain.handle('skyrim:select-dir', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Selecione a Pasta de Instalação do Skyrim SE/AE',
    properties: ['openDirectory'],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  const chosen = result.filePaths[0];
  const info = skyrimPathService.inspectDirectory(chosen, 'manual');
  if (!info) {
    throw new Error('A pasta selecionada não contém SkyrimSE.exe.');
  }
  skyrimPathService.saveSkyrimPath(chosen);
  return chosen;
});

// IPC Handler: Binary File Picker (.dll or .zip)
ipcMain.handle('binary:select-file', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Selecione a DLL ou Arquivo ZIP do Mod SKSE',
    properties: ['openFile'],
    filters: [
      { name: 'Mod SKSE (*.dll, *.zip)', extensions: ['dll', 'zip'] },
      { name: 'DLL do Plugin (*.dll)', extensions: ['dll'] },
      { name: 'Arquivo ZIP (*.zip)', extensions: ['zip'] },
      { name: 'Todos os Arquivos (*.*)', extensions: ['*'] },
    ],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

// IPC Handler: Analyze PE Binary
ipcMain.handle('binary:analyze', async (_, filePath: string) => {
  return await binaryService.analyzeBinary(filePath);
});

// IPC Handler: Execute No-Code Transmutation
ipcMain.handle('binary:transmute', async (_, options: TransmuteOptions): Promise<TransmuteResult> => {
  emitBinaryLog(`[Iniciando] Transmutação de compatibilidade binária...`, 'info');
  try {
    const result = await binaryService.transmuteMod(options, (line, type) => {
      emitBinaryLog(line, type);
    });
    return result;
  } catch (err: any) {
    emitBinaryLog(`[ERRO] ${err.message || 'Falha na transmutação.'}`, 'error');
    throw err;
  }
});
