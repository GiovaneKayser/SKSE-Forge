/**
 * SKSE Forge - Shared TypeScript Interfaces & Contracts
 * Strictly decoupled definitions shared between Electron Main, Preload, and React Renderer.
 */

export interface ToolStatus {
  name: string;
  found: boolean;
  path?: string;
  version?: string;
  warning?: string;
}

export interface EnvironmentReport {
  isReady: boolean;
  git: ToolStatus;
  cmake: ToolStatus;
  msvc: ToolStatus;
  vcpkg: ToolStatus;
  resolvedPaths: {
    git?: string;
    cmake?: string;
    vcpkgToolchain?: string;
    vsInstallDir?: string;
  };
}

export interface LogMessage {
  text: string;
  type: 'stdout' | 'stderr' | 'info' | 'warn' | 'error' | 'success';
  timestamp: number;
}

export type PipelinePhase =
  | 'idle'
  | 'clone'
  | 'scan'
  | 'patch'
  | 'configure'
  | 'build'
  | 'package'
  | 'completed'
  | 'failed';

export interface PhaseUpdate {
  phase: PipelinePhase;
  detail?: string;
}

export interface ValidationResult {
  isValid: boolean;
  isGitRepo: boolean;
  hasCMake: boolean;
  modName: string;
  error?: string;
}

export interface PipelinePayload {
  source: string;
  customModName?: string;
}

export interface PipelineResult {
  success: boolean;
  modName: string;
  dllPath: string;
  distDir: string;
  zipPath: string;
  durationMs: number;
  filesPackaged: string[];
  patchReport?: {
    appliedPatches: Array<{
      id: string;
      category: string;
      description: string;
      filePath: string;
    }>;
    modifiedFiles: string[];
  };
  warnings?: string[];
}

export interface RiskSymbol {
  symbol: string;
  category: 'ui' | 'memory' | 'standard' | 'hook';
  risk: 'low' | 'medium' | 'high';
  reason: string;
}

export interface PatchItem {
  offsetHex: string;
  originalBytes: string;
  replacementBytes: string;
  comment?: string;
}

export interface PatchRecipe {
  id: string;
  name: string;
  targetSha256?: string;
  patternHex?: string;
  description: string;
  gameVersionTarget: string;
  patches: PatchItem[];
}

export interface PeAnalysisReport {
  fileName: string;
  fileSize: number;
  sha256: string;
  architecture: 'x64' | 'x86' | 'unknown';
  isSksePlugin: boolean;
  skseExports: string[];
  importedDlls: string[];
  detectedSymbols: RiskSymbol[];
  riskLevel: 'low' | 'medium' | 'high';
  riskScore: number; // 0 to 100
  riskSummary: string;
  matchedRecipe?: PatchRecipe;
}

export interface AddressLibraryBinInfo {
  fileName: string;
  filePath: string;
  format: number;
  gameVersion: string;
  sizeBytes: number;
}

export interface SkyrimInstallInfo {
  path: string;
  executablePath: string;
  gameVersion?: string;
  hasSkse: boolean;
  skseVersion?: string;
  addressLibraryFiles: AddressLibraryBinInfo[];
  isDefaultSteam: boolean;
  source: 'registry' | 'steam_vdf' | 'gog' | 'drive_scan' | 'saved_settings' | 'manual';
}

export interface AddressLibraryConversionResult {
  success: boolean;
  sourceFile: string;
  outputFile: string;
  companionFile?: string;
  sourceFormat: number; // 5
  targetFormat: number; // 2
  gameVersion: string;
  pointerSize: number;
  totalAddresses: number;
  outputBytes: number;
  durationMs: number;
}

export interface TransmuteOptions {
  inputFilePath: string;
  skyrimDir?: string;
  gameVersion?: string;
  convertAddressLibrary?: boolean;
  applyHexPatches?: boolean;
  createZipPackage?: boolean;
  outputDir?: string;
}

export interface TransmuteResult {
  success: boolean;
  modName: string;
  targetDllPath: string;
  analysis: PeAnalysisReport;
  appliedPatches: {
    recipeName: string;
    patchesApplied: number;
  } | null;
  convertedAddressLibrary?: AddressLibraryConversionResult;
  zipPackagePath?: string;
  generatedArtifacts: string[];
  durationMs: number;
}

export interface UserSettings {
  skyrimPath?: string;
  language?: string;
  lastUsedMode?: 'forge' | 'binary';
}

export interface ElectronAPI {
  // Forge mode
  detectEnvironment: (forceRefresh?: boolean) => Promise<EnvironmentReport>;
  validateSource: (source: string) => Promise<ValidationResult>;
  selectDirectory: () => Promise<string | null>;
  startPipeline: (payload: PipelinePayload) => Promise<PipelineResult>;
  cancelPipeline: () => Promise<boolean>;
  openDestination: (targetPath: string) => Promise<void>;
  copyToClipboard: (text: string) => Promise<void>;

  onPhaseChange: (callback: (data: PhaseUpdate) => void) => () => void;
  onLog: (callback: (data: LogMessage) => void) => () => void;
  onComplete: (callback: (data: PipelineResult) => void) => () => void;
  onError: (callback: (data: { message: string }) => void) => () => void;

  // Binary mode (No-Code Transmutation)
  detectSkyrim: () => Promise<SkyrimInstallInfo[]>;
  getSavedSkyrimPath: () => Promise<string | null>;
  saveSkyrimPath: (newPath: string) => Promise<boolean>;
  selectSkyrimDirectory: () => Promise<string | null>;
  selectBinaryFile: () => Promise<string | null>;
  analyzeBinary: (filePath: string) => Promise<PeAnalysisReport>;
  transmuteMod: (options: TransmuteOptions) => Promise<TransmuteResult>;
  onBinaryLog: (callback: (data: LogMessage) => void) => () => void;
}
