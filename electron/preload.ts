import { contextBridge, ipcRenderer } from 'electron';
import {
  ElectronAPI,
  LogMessage,
  PhaseUpdate,
  EnvironmentReport,
  ValidationResult,
  PipelinePayload,
  PipelineResult,
  SkyrimInstallInfo,
  PeAnalysisReport,
  TransmuteOptions,
  TransmuteResult,
} from '../src/shared/types';

export * from '../src/shared/types';

const api: ElectronAPI = {
  // Forge mode
  detectEnvironment: (forceRefresh) => ipcRenderer.invoke('env:detect', forceRefresh),
  validateSource: (source) => ipcRenderer.invoke('repo:validate', source),
  selectDirectory: () => ipcRenderer.invoke('repo:select-dir'),
  startPipeline: (payload) => ipcRenderer.invoke('pipeline:start', payload),
  cancelPipeline: () => ipcRenderer.invoke('pipeline:cancel'),
  openDestination: (targetPath) => ipcRenderer.invoke('action:open-destination', targetPath),
  copyToClipboard: (text) => ipcRenderer.invoke('action:copy-clipboard', text),

  onPhaseChange: (callback) => {
    const handler = (_: any, data: PhaseUpdate) => callback(data);
    ipcRenderer.on('pipeline:phase', handler);
    return () => ipcRenderer.removeListener('pipeline:phase', handler);
  },
  onLog: (callback) => {
    const handler = (_: any, data: LogMessage) => callback(data);
    ipcRenderer.on('pipeline:log', handler);
    return () => ipcRenderer.removeListener('pipeline:log', handler);
  },
  onComplete: (callback) => {
    const handler = (_: any, data: PipelineResult) => callback(data);
    ipcRenderer.on('pipeline:complete', handler);
    return () => ipcRenderer.removeListener('pipeline:complete', handler);
  },
  onError: (callback) => {
    const handler = (_: any, data: { message: string }) => callback(data);
    ipcRenderer.on('pipeline:error', handler);
    return () => ipcRenderer.removeListener('pipeline:error', handler);
  },

  // Binary mode (No-Code Transmutation) & Universal Skyrim Detection
  detectSkyrim: () => ipcRenderer.invoke('binary:detect-skyrim'),
  getSavedSkyrimPath: () => ipcRenderer.invoke('skyrim:get-saved'),
  saveSkyrimPath: (newPath) => ipcRenderer.invoke('skyrim:save-path', newPath),
  selectSkyrimDirectory: () => ipcRenderer.invoke('skyrim:select-dir'),
  selectBinaryFile: () => ipcRenderer.invoke('binary:select-file'),
  analyzeBinary: (filePath) => ipcRenderer.invoke('binary:analyze', filePath),
  transmuteMod: (options) => ipcRenderer.invoke('binary:transmute', options),
  onBinaryLog: (callback) => {
    const handler = (_: any, data: LogMessage) => callback(data);
    ipcRenderer.on('binary:log', handler);
    return () => ipcRenderer.removeListener('binary:log', handler);
  },
};

contextBridge.exposeInMainWorld('electronAPI', api);
