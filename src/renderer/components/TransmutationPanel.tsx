import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FileText,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  FolderOpen,
  Copy,
  Wand2,
  RefreshCw,
  Layers,
  Database,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import {
  PeAnalysisReport,
  SkyrimInstallInfo,
  TransmuteResult,
} from '../../shared/types';

interface TransmutationPanelProps {
  onOpenFolder: (path: string) => void;
  onCopyPath: (text: string) => void;
  isTransmuting: boolean;
  setIsTransmuting: (val: boolean) => void;
}

export const TransmutationPanel: React.FC<TransmutationPanelProps> = ({
  onOpenFolder,
  onCopyPath,
  isTransmuting,
  setIsTransmuting,
}) => {
  const { t } = useTranslation();

  // Selected file and analysis states
  const [selectedFilePath, setSelectedFilePath] = useState<string>('');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisReport, setAnalysisReport] = useState<PeAnalysisReport | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Skyrim target installation states
  const [skyrimInstalls, setSkyrimInstalls] = useState<SkyrimInstallInfo[]>([]);
  const [selectedSkyrimDir, setSelectedSkyrimDir] = useState<string>('');
  const [isDetectingSkyrim, setIsDetectingSkyrim] = useState<boolean>(false);

  // Configuration options
  const [convertAddressLib, setConvertAddressLib] = useState<boolean>(true);
  const [applyHexPatches, setApplyHexPatches] = useState<boolean>(true);
  const [createZipPackage, setCreateZipPackage] = useState<boolean>(true);

  // Execution result
  const [transmuteResult, setTransmuteResult] = useState<TransmuteResult | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<boolean>(false);

  // Load Skyrim installations on mount
  useEffect(() => {
    loadSkyrimInstalls();
  }, []);

  const loadSkyrimInstalls = async () => {
    if (!window.electronAPI) return;
    setIsDetectingSkyrim(true);
    try {
      const installs = await window.electronAPI.detectSkyrim();
      setSkyrimInstalls(installs);

      const saved = await window.electronAPI.getSavedSkyrimPath();
      if (saved) {
        setSelectedSkyrimDir(saved);
      } else if (installs.length > 0) {
        setSelectedSkyrimDir(installs[0].path);
      }
    } catch (err) {
      console.error('Failed to detect Skyrim installs:', err);
    } finally {
      setIsDetectingSkyrim(false);
    }
  };

  const handleSelectSkyrim = (targetPath: string) => {
    setSelectedSkyrimDir(targetPath);
    if (window.electronAPI) {
      window.electronAPI.saveSkyrimPath(targetPath);
    }
  };

  // Analyze binary
  const handleAnalyzeFile = async (filePath: string) => {
    if (!window.electronAPI || !filePath) return;
    setSelectedFilePath(filePath);
    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisReport(null);
    setTransmuteResult(null);

    try {
      const report = await window.electronAPI.analyzeBinary(filePath);
      setAnalysisReport(report);
    } catch (err: any) {
      setAnalysisError(err.message || 'Falha ao analisar o binário PE.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Browse local binary file
  const handleBrowseFile = async () => {
    if (!window.electronAPI) return;
    try {
      const selected = await window.electronAPI.selectBinaryFile();
      if (selected) {
        handleAnalyzeFile(selected);
      }
    } catch (err) {
      console.error('File selection failed:', err);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      const validExtensions = ['.dll', '.zip'];
      const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      if (validExtensions.includes(ext)) {
        // Electron webUtils.getPathForFile or file.path
        const filePath = (file as any).path || file.name;
        handleAnalyzeFile(filePath);
      } else {
        setAnalysisError(t('binary.invalid_file_type', 'Por favor forneça um arquivo .dll ou .zip válido.'));
      }
    }
  };

  // Browse custom Skyrim directory
  const handleBrowseSkyrim = async () => {
    if (!window.electronAPI) return;
    try {
      const selected = await window.electronAPI.selectSkyrimDirectory();
      if (selected) {
        handleSelectSkyrim(selected);
        loadSkyrimInstalls();
      }
    } catch (err) {
      console.error('Skyrim directory picker failed:', err);
    }
  };

  // Execute Transmutation
  const handleStartTransmutation = async () => {
    if (!selectedFilePath || !window.electronAPI || isTransmuting) return;

    setIsTransmuting(true);
    setTransmuteResult(null);

    try {
      const result = await window.electronAPI.transmuteMod({
        inputFilePath: selectedFilePath,
        skyrimDir: selectedSkyrimDir || undefined,
        convertAddressLibrary: convertAddressLib,
        applyHexPatches: applyHexPatches,
        createZipPackage: createZipPackage,
      });
      setTransmuteResult(result);
    } catch (err: any) {
      setAnalysisError(err.message || 'Erro durante a transmutação do plugin.');
    } finally {
      setIsTransmuting(false);
    }
  };

  const getRiskBadge = (level: 'low' | 'medium' | 'high') => {
    switch (level) {
      case 'low':
        return (
          <span className="whitespace-nowrap inline-flex items-center px-2 py-0.5 border border-[#1f5c2b] text-[#4ade80] text-[10px] font-nordic tracking-wider uppercase bg-[#0c1610]">
            [ {t('binary.risk_low', 'BAIXO (NÓRDICO)')} ]
          </span>
        );
      case 'medium':
        return (
          <span className="whitespace-nowrap inline-flex items-center px-2 py-0.5 border border-[#8c7447] text-[#f59e0b] text-[10px] font-nordic tracking-wider uppercase bg-[#1e1708]">
            [ {t('binary.risk_medium', 'MÉDIO (ESTÁVEL)')} ]
          </span>
        );
      case 'high':
        return (
          <span className="whitespace-nowrap inline-flex items-center px-2 py-0.5 border border-[#7f1d1d] text-[#f87171] text-[10px] font-nordic tracking-wider uppercase bg-[#1a0a0a]">
            [ {t('binary.risk_high', 'ALTO (DAÉDRICO)')} ]
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Banner (Arcane Enchanter Style) */}
      <div className="bg-[#141721] border border-[#2e3346] p-5 shadow-[0_4px_24px_rgba(0,0,0,0.7)] relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-[#548b9c]/5 rounded-none blur-3xl pointer-events-none -mr-20 -mt-20"></div>

        <div className="flex items-center justify-between pb-3 border-b border-[#2e3346] relative z-10">
          <div>
            <h2 className="font-nordic font-bold text-sm tracking-[0.2em] uppercase text-[#73a5c6] flex items-center gap-2">
              <span>{t('binary.view_title', 'A TRANSMUTAÇÃO: COMPATIBILIDADE SEM CÓDIGO')}</span>
            </h2>
            <p className="text-xs text-[#a8b0bf] font-sans mt-0.5">
              {t(
                'binary.view_subtitle',
                'Modernize e torne compatível qualquer plugin SKSE legado (.dll ou .zip) sem necessidade de código-fonte nem compiladores.'
              )}
            </p>
          </div>

          {selectedFilePath && (
            <button
              type="button"
              onClick={() => {
                setSelectedFilePath('');
                setAnalysisReport(null);
                setTransmuteResult(null);
                setAnalysisError(null);
              }}
              className="text-xs text-[#a8b0bf] hover:text-[#f87171] transition-colors font-nordic tracking-wider uppercase flex items-center gap-1 cursor-pointer"
            >
              <span>✕</span>
              <span>{t('binary.clear_file', 'REMOVER ARQUIVO')}</span>
            </button>
          )}
        </div>

        {/* Drag and Drop Zone or Loaded File Indicator */}
        <div className="mt-4 relative z-10">
          {!selectedFilePath ? (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={handleBrowseFile}
              className={`border-2 border-dashed p-8 text-center transition-all cursor-pointer select-none ${
                isDragging
                  ? 'border-[#73a5c6] bg-[#0f1d24]/80 shadow-[0_0_20px_rgba(115,165,198,0.3)]'
                  : 'border-[#2e3346] hover:border-[#548b9c] bg-[#0c0e14]/60 hover:bg-[#0c0e14]'
              }`}
            >
              <UploadCloud className="w-10 h-10 mx-auto text-[#73a5c6] opacity-75 mb-2.5" />
              <h3 className="font-nordic font-bold text-sm text-[#d1d5db] tracking-wider uppercase">
                {t('binary.dropzone_title', 'Arraste e solte o arquivo .DLL ou .ZIP do mod aqui')}
              </h3>
              <p className="text-xs text-[#a8b0bf] font-sans mt-1">
                {t('binary.dropzone_desc', 'Suporta arquivos .dll diretos ou pacotes .zip de mods antigos (Nexus Mods, LoversLab, etc).')}
              </p>
              <div className="mt-4">
                <button
                  type="button"
                  className="skyrim-btn text-xs py-2 px-5 text-[#d1d5db] pointer-events-none inline-flex items-center gap-2"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-[#c5a059]" />
                  <span>{t('binary.browse_btn', 'PROCURAR ARQUIVO LOCAL')}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-[#0c0e14] border border-[#2e3346] p-4 flex items-center justify-between">
              <div className="flex items-center space-x-3.5 min-w-0">
                <div className="p-2.5 border border-[#548b9c] bg-[#0f1d24] text-[#73a5c6]">
                  <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-sm text-[#e5c687] font-bold truncate">
                      {selectedFilePath.split(/[\\/]/).pop()}
                    </span>
                    <span className="whitespace-nowrap inline-flex items-center text-[10px] font-nordic tracking-widest uppercase px-2 py-0.5 border border-[#355b66] text-[#73a5c6] bg-[#0c161c]">
                      [ {selectedFilePath.endsWith('.zip') ? 'PACOTE ZIP' : 'BINÁRIO DLL'} ]
                    </span>
                  </div>
                  <p className="font-mono text-[11px] text-[#a8b0bf] truncate mt-0.5 max-w-xl">
                    {selectedFilePath}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleBrowseFile}
                className="skyrim-btn text-xs py-2 px-3 text-[#d1d5db] shrink-0 font-nordic tracking-wider uppercase cursor-pointer"
              >
                {t('binary.change_file', 'TROCAR ARQUIVO')}
              </button>
            </div>
          )}
        </div>

        {/* Loading Spinner for Analysis */}
        {isAnalyzing && (
          <div className="mt-4 p-6 bg-[#0c0e14] border border-[#2e3346] flex items-center justify-center space-x-3">
            <RefreshCw className="w-4 h-4 animate-spin text-[#73a5c6]" />
            <span className="font-nordic text-xs tracking-wider uppercase text-[#d1d5db]">
              Analisando cabeçalho PE, seções, importações e exports SKSE...
            </span>
          </div>
        )}

        {/* Error Notice */}
        {analysisError && (
          <div className="mt-4 p-3 bg-[#1a0a0a] border border-[#7f1d1d] flex items-start space-x-2.5">
            <AlertTriangle className="w-4 h-4 text-[#f87171] shrink-0 mt-0.5" />
            <span className="text-xs text-[#f87171] font-sans leading-relaxed">{analysisError}</span>
          </div>
        )}
      </div>

      {/* PE Analysis & Diagnostics Panel */}
      {analysisReport && (
        <div className="bg-[#141721] border border-[#2e3346] p-5 shadow-[0_4px_24px_rgba(0,0,0,0.7)] space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#2e3346]">
            <h3 className="font-nordic font-bold text-xs tracking-[0.2em] uppercase text-[#c5a059] flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#c5a059]" />
              <span>{t('binary.diag_title', 'DIAGNÓSTICO PE & ANÁLISE DE COMPATIBILIDADE')}</span>
            </h3>
            <span className="font-mono text-[10px] text-[#a8b0bf]">
              SHA256: {analysisReport.sha256.slice(0, 16)}...
            </span>
          </div>

          {/* Quick Metrics (Nordic Stone Blocks) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-[#0c0e14] p-3 border border-[#2e3346]">
              <span className="text-[10px] font-nordic uppercase tracking-wider text-[#a8b0bf] block">
                {t('binary.architecture', 'ARQUITETURA')}
              </span>
              <span className="text-xs font-mono text-[#d1d5db] font-bold mt-1 block">
                {analysisReport.architecture.toUpperCase()} {analysisReport.architecture === 'x64' ? '✓' : '✗'}
              </span>
            </div>

            <div className="bg-[#0c0e14] p-3 border border-[#2e3346]">
              <span className="text-[10px] font-nordic uppercase tracking-wider text-[#a8b0bf] block">
                {t('binary.skse_plugin', 'PLUGIN SKSE')}
              </span>
              <span className="text-xs font-mono text-[#4ade80] font-bold mt-1 block truncate">
                {analysisReport.isSksePlugin
                  ? t('binary.skse_valid', 'Válido (Exports OK)')
                  : t('binary.skse_unknown', 'Assinatura Padrão')}
              </span>
            </div>

            <div className="bg-[#0c0e14] p-3 border border-[#2e3346]">
              <span className="text-[10px] font-nordic uppercase tracking-wider text-[#a8b0bf] block">
                {t('binary.risk_level', 'NÍVEL DE RISCO')}
              </span>
              <div className="mt-1">{getRiskBadge(analysisReport.riskLevel)}</div>
            </div>

            <div className="bg-[#0c0e14] p-3 border border-[#2e3346]">
              <span className="text-[10px] font-nordic uppercase tracking-wider text-[#a8b0bf] block">
                {t('binary.recipe_matched', 'RECEITA HEX')}
              </span>
              <span className="text-xs font-mono text-[#d1d5db] font-bold mt-1 block truncate">
                {analysisReport.matchedRecipe?.name || t('binary.no_recipe_needed', 'Padrão / Não Requer')}
              </span>
            </div>
          </div>

          {/* Risk Summary Description */}
          <div className="p-3 bg-[#0c0e14] border border-[#2e3346] text-xs leading-relaxed text-[#d1d5db]/90 flex items-start space-x-2">
            <CheckCircle2 className="w-4 h-4 text-[#c5a059] shrink-0 mt-0.5" />
            <span>{analysisReport.riskSummary}</span>
          </div>
        </div>
      )}

      {/* Target Skyrim SE Installation & Pipeline Controls */}
      <div className="bg-[#141721] border border-[#2e3346] p-5 shadow-[0_4px_24px_rgba(0,0,0,0.7)] space-y-4">
        {/* Section Title */}
        <div className="flex items-center justify-between pb-3 border-b border-[#2e3346]">
          <h3 className="font-nordic font-bold text-xs tracking-[0.2em] uppercase text-[#c5a059] flex items-center gap-2">
            <Database className="w-4 h-4 text-[#c5a059]" />
            <span>{t('binary.skyrim_target', 'DIRETÓRIO DO SKYRIM & BASE DA ADDRESS LIBRARY')}</span>
          </h3>
          <button
            type="button"
            onClick={loadSkyrimInstalls}
            disabled={isDetectingSkyrim}
            className="text-[10px] text-[#73a5c6] hover:text-[#d1d5db] font-nordic tracking-wider uppercase flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className={`w-3 h-3 ${isDetectingSkyrim ? 'animate-spin' : ''}`} />
            <span>{t('binary.rescan_skyrim', 'RE-ESCANEAR')}</span>
          </button>
        </div>

        {/* Skyrim Path Selector (Locked to h-10 with perfect items-center alignment) */}
        <div className="space-y-2">
          <label className="block text-xs font-nordic tracking-wider uppercase text-[#c5a059]">
            {t('binary.skyrim_path_label', 'PASTA DE INSTALAÇÃO DO SKYRIM SE/AE')}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={selectedSkyrimDir}
              onChange={(e) => handleSelectSkyrim(e.target.value)}
              placeholder="Caminho da pasta do jogo (onde SkyrimSE.exe está localizado)..."
              className="flex-1 h-10 bg-[#0c0e14] border border-[#2e3346] px-3.5 text-xs font-mono text-[#d1d5db] focus:border-[#73a5c6] focus:outline-none"
            />
            <button
              type="button"
              onClick={handleBrowseSkyrim}
              className="skyrim-btn h-10 text-xs px-4 text-[#d1d5db] shrink-0 inline-flex items-center gap-2 cursor-pointer"
            >
              <FolderOpen className="w-3.5 h-3.5 text-[#c5a059]" />
              <span className="font-nordic tracking-wider uppercase">{t('binary.browse', 'PROCURAR')}</span>
            </button>
          </div>

          {/* Detected Installs Tags (With whitespace-nowrap protection) */}
          {skyrimInstalls.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[11px] text-[#a8b0bf] font-nordic tracking-wider">
                {t('binary.detected_installs', 'INSTALAÇÕES ENCONTRADAS:')}
              </span>
              {skyrimInstalls.map((inst, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSelectSkyrim(inst.path)}
                  className={`text-[10px] px-2.5 py-1 border font-mono transition-colors cursor-pointer whitespace-nowrap inline-flex items-center gap-1 ${
                    selectedSkyrimDir === inst.path
                      ? 'bg-[#0f1d24] border-[#73a5c6] text-[#73a5c6] font-bold shadow-[0_0_8px_rgba(115,165,198,0.3)]'
                      : 'bg-[#0c0e14] border-[#2e3346] text-[#a8b0bf] hover:border-[#434b63]'
                  }`}
                >
                  <span>[</span>
                  <span>{inst.path.split(/[\\/]/).pop()}</span>
                  <span>{inst.gameVersion ? `(v${inst.gameVersion})` : ''}</span>
                  <span>]</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Options Toggles (Stone Blocks) */}
        <div className="pt-2 border-t border-[#2e3346] grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="flex items-start space-x-2.5 p-3 bg-[#0c0e14] border border-[#2e3346] cursor-pointer hover:border-[#434b63] transition-colors">
            <input
              type="checkbox"
              checked={convertAddressLib}
              onChange={(e) => setConvertAddressLib(e.target.checked)}
              className="mt-0.5 accent-[#73a5c6]"
            />
            <div>
              <span className="text-xs font-nordic tracking-wider uppercase text-[#e5c687] block font-bold">
                {t('binary.opt_convert_al', 'Converter Address Library')}
              </span>
              <span className="text-[10px] text-[#a8b0bf] block mt-0.5 font-sans leading-relaxed">
                {t('binary.opt_convert_al_desc', 'Converte Formato 5 para Formato 2 para suporte a 1.6.1130+')}
              </span>
            </div>
          </label>

          <label className="flex items-start space-x-2.5 p-3 bg-[#0c0e14] border border-[#2e3346] cursor-pointer hover:border-[#434b63] transition-colors">
            <input
              type="checkbox"
              checked={applyHexPatches}
              onChange={(e) => setApplyHexPatches(e.target.checked)}
              className="mt-0.5 accent-[#73a5c6]"
            />
            <div>
              <span className="text-xs font-nordic tracking-wider uppercase text-[#e5c687] block font-bold">
                {t('binary.opt_apply_hex', 'Aplicar Receitas Hex')}
              </span>
              <span className="text-[10px] text-[#a8b0bf] block mt-0.5 font-sans leading-relaxed">
                {t('binary.opt_apply_hex_desc', 'Injeta bytes de alinhamento e bypass de checagens legadas')}
              </span>
            </div>
          </label>

          <label className="flex items-start space-x-2.5 p-3 bg-[#0c0e14] border border-[#2e3346] cursor-pointer hover:border-[#434b63] transition-colors">
            <input
              type="checkbox"
              checked={createZipPackage}
              onChange={(e) => setCreateZipPackage(e.target.checked)}
              className="mt-0.5 accent-[#73a5c6]"
            />
            <div>
              <span className="text-xs font-nordic tracking-wider uppercase text-[#e5c687] block font-bold">
                {t('binary.opt_zip_mo2', 'Pacote ZIP para MO2/Vortex')}
              </span>
              <span className="text-[10px] text-[#a8b0bf] block mt-0.5 font-sans leading-relaxed">
                {t('binary.opt_zip_mo2_desc', 'Empacota estrutura SKSE/Plugins em arquivo ZIP instalável')}
              </span>
            </div>
          </label>
        </div>

        {/* Action Button: Start Transmutation */}
        <div className="pt-3 border-t border-[#2e3346] flex items-center justify-end">
          <button
            type="button"
            onClick={handleStartTransmutation}
            disabled={!selectedFilePath || isTransmuting}
            className={`skyrim-btn skyrim-btn-primary px-8 h-12 text-sm tracking-[0.2em] font-bold shadow-lg transition-all inline-flex items-center gap-2 ${
              !selectedFilePath || isTransmuting
                ? 'opacity-40 cursor-not-allowed'
                : 'cursor-pointer hover:shadow-[0_0_20px_rgba(115,165,198,0.5)]'
            }`}
          >
            {isTransmuting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-[#e5c687]" />
                <span className="font-nordic uppercase">{t('binary.transmuting', 'TRANSMUTANDO MOD...')}</span>
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4 text-[#e5c687]" />
                <span className="font-nordic uppercase font-bold">{t('binary.start_transmute', 'TRANSMUTAR MOD AGORA')}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Transmutation Result Banner */}
      {transmuteResult && (
        <div className="bg-[#141721] border-2 border-[#c5a059] p-5 shadow-[0_0_35px_rgba(197,160,89,0.25)] space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#8c7447]/60">
            <div className="flex items-center space-x-3">
              <div className="p-2 border border-[#c5a059] bg-[#2a2012] text-[#e5c687] shadow-[0_0_12px_rgba(197,160,89,0.4)]">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-nordic font-bold text-base text-[#e5c687] tracking-[0.18em] uppercase">
                  {t('binary.success_title', 'TRANSMUTAÇÃO CONCLUÍDA COM SUCESSO!')}
                </h3>
                <p className="text-xs text-[#d1d5db]/80 font-sans">
                  {t(
                    'binary.success_subtitle',
                    'O mod foi adaptado para retrocompatibilidade e empacotado para instalação direta.'
                  )}
                </p>
              </div>
            </div>

            <span className="whitespace-nowrap inline-flex items-center text-xs font-mono text-[#e5c687] font-bold px-3 py-1 bg-[#0c0e14] border border-[#8c7447]">
              [ {(transmuteResult.durationMs / 1000).toFixed(2)}s ]
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="bg-[#0c0e14] p-3 border border-[#2e3346]">
              <span className="text-[10px] text-[#a8b0bf] uppercase tracking-wider font-nordic block">
                {t('binary.result_dll', 'DLL Adaptada')}
              </span>
              <span className="font-mono text-[#d1d5db] block mt-1 truncate">
                {transmuteResult.targetDllPath}
              </span>
            </div>

            {transmuteResult.zipPackagePath && (
              <div className="bg-[#0c0e14] p-3 border border-[#c5a059]/60">
                <span className="text-[10px] text-[#e5c687] uppercase tracking-wider font-nordic block font-bold">
                  {t('binary.result_zip', 'Pacote ZIP para MO2 / Vortex')}
                </span>
                <span className="font-mono text-[#e5c687] block mt-1 truncate font-semibold">
                  {transmuteResult.zipPackagePath}
                </span>
              </div>
            )}
          </div>

          {transmuteResult.convertedAddressLibrary && (
            <div className="p-3 bg-[#0f1d24] border border-[#548b9c] text-xs text-[#73a5c6] flex items-center justify-between font-mono">
              <span className="flex items-center space-x-2">
                <Database className="w-4 h-4 text-[#73a5c6]" />
                <span>
                  Base Address Library: {transmuteResult.convertedAddressLibrary.totalAddresses} endereços mapeados (Formato 5 → Formato 2 isolado) para Skyrim {transmuteResult.convertedAddressLibrary.gameVersion}
                </span>
              </span>
              <span className="whitespace-nowrap inline-flex items-center text-[10px] font-mono text-[#73a5c6]">
                [ {(transmuteResult.convertedAddressLibrary.outputBytes / 1024).toFixed(0)} KB ]
              </span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
            {transmuteResult.zipPackagePath && (
              <button
                type="button"
                onClick={() => {
                  onCopyPath(transmuteResult.zipPackagePath!);
                  setCopyFeedback(true);
                  setTimeout(() => setCopyFeedback(false), 2000);
                }}
                className="skyrim-btn text-xs py-2 px-4 border-[#2e3346] text-[#d1d5db] inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5 text-[#c5a059]" />
                <span className="font-nordic tracking-wider uppercase">
                  {copyFeedback ? 'Copiado!' : 'Copiar Caminho do ZIP'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onOpenFolder(transmuteResult.targetDllPath)}
              className="skyrim-btn text-xs py-2 px-4 border-[#8c7447] text-[#e5c687] inline-flex items-center gap-1.5 cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5 text-[#e5c687]" />
              <span className="font-nordic tracking-wider uppercase font-bold">Abrir Pasta de Destino</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// Also export BinaryModeView for backwards compatibility
export const BinaryModeView = TransmutationPanel;
