import React from 'react';
import { useTranslation } from 'react-i18next';
import { FolderOpen, GitBranch, Flame, X } from 'lucide-react';
import { ValidationResult } from '../../shared/types';

interface ForgePanelProps {
  source: string;
  onSourceChange: (val: string) => void;
  modName: string;
  onModNameChange: (val: string) => void;
  onBrowseFolder: () => void;
  onStartForge: () => void;
  onCancelForge: () => void;
  isRunning: boolean;
  isValidating: boolean;
  validationInfo?: ValidationResult | null;
}

export const ForgePanel: React.FC<ForgePanelProps> = ({
  source,
  onSourceChange,
  modName,
  onModNameChange,
  onBrowseFolder,
  onStartForge,
  onCancelForge,
  isRunning,
  isValidating,
  validationInfo,
}) => {
  const { t } = useTranslation();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isRunning && source.trim()) {
      onStartForge();
    }
  };

  const isRemoteGit =
    source.startsWith('http://') ||
    source.startsWith('https://') ||
    source.startsWith('git@');

  return (
    <div className="bg-[#141721] border border-[#2e3346] p-5 shadow-[0_4px_20px_rgba(0,0,0,0.6)] relative overflow-hidden">
      {/* Subtle background ember glow */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-[#e0631b]/5 rounded-none blur-3xl pointer-events-none -mr-20 -mt-20"></div>

      <div className="flex flex-col space-y-4 relative z-10">
        {/* Top Input Row: Source Path / Remote Git URL */}
        <div>
          <label className="text-xs font-nordic tracking-[0.18em] uppercase text-[#c5a059] mb-1.5 flex items-center justify-between">
            <span className="flex items-center space-x-2">
              <span>{t('input.label', 'REPOSITÓRIO GIT OU PASTA LOCAL DO MOD')}</span>
              {isRemoteGit && (
                <span className="whitespace-nowrap inline-flex items-center text-[10px] uppercase font-mono text-[#73a5c6] bg-[#0f1d24] border border-[#355b66] px-2 py-0.5">
                  [ REPOSITÓRIO REMOTO ]
                </span>
              )}
            </span>
            {source && (
              <button
                type="button"
                disabled={isRunning}
                onClick={() => {
                  onSourceChange('');
                  onModNameChange('');
                }}
                className="text-[11px] text-[#a8b0bf] hover:text-[#d1d5db] transition-colors underline cursor-pointer"
              >
                {t('input.clear', 'Limpar')}
              </button>
            )}
          </label>

          {/* Input & Browse Button Paired with Matching Height (h-10) and Center Alignment */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 h-10 flex items-center">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#a8b0bf]">
                {isRemoteGit ? (
                  <GitBranch className="w-4 h-4 text-[#73a5c6]" />
                ) : (
                  <FolderOpen className="w-4 h-4 text-[#c5a059]" />
                )}
              </div>

              <input
                type="text"
                value={source}
                onChange={(e) => onSourceChange(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isRunning}
                placeholder={t(
                  'input.placeholder',
                  'Cole a URL do repositório Git ou selecione pasta local...'
                )}
                className="w-full h-10 bg-[#0c0e14] border border-[#2e3346] hover:border-[#434b63] focus:border-[#c5a059] text-[#d1d5db] text-xs pl-10 pr-4 outline-none transition-all placeholder-[#626877] font-mono shadow-inner disabled:opacity-50"
              />

              {isValidating && (
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                  <span className="animate-spin w-4 h-4 border border-[#73a5c6] border-t-transparent" />
                </div>
              )}
            </div>

            {/* Browse Local Folder Button (Locked to h-10) */}
            <button
              type="button"
              onClick={onBrowseFolder}
              disabled={isRunning}
              className="skyrim-btn h-10 px-4 text-xs inline-flex items-center justify-center gap-2 text-[#d1d5db] shrink-0"
              title={t('input.browse', 'Procurar Pasta Local')}
            >
              <FolderOpen className="w-4 h-4 text-[#c5a059]" />
              <span className="hidden sm:inline font-nordic tracking-wider uppercase">
                {t('input.browse', 'PROCURAR')}
              </span>
            </button>
          </div>
        </div>

        {/* 
          Bottom Row: Mod Name Input + Action Button (Forjar Plugin)
          Structured with items-end and matching h-10 height so both sit on the exact same baseline!
        */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          {/* Mod Name Customization */}
          <div className="md:col-span-2 flex flex-col justify-end">
            <label className="block text-[11px] font-nordic tracking-wider uppercase text-[#a8b0bf] mb-1.5">
              {t('input.mod_name', 'NOME DO MOD')} (DLL & PACOTE ZIP)
            </label>
            <input
              type="text"
              value={modName}
              onChange={(e) => onModNameChange(e.target.value)}
              disabled={isRunning}
              placeholder={t('input.mod_name_placeholder', 'Auto-detectado pelo repositório ou CMakeLists')}
              className="w-full h-10 bg-[#0c0e14] border border-[#2e3346] focus:border-[#c5a059] text-[#d1d5db] text-xs px-3 outline-none transition-all placeholder-[#626877] font-mono"
            />
          </div>

          {/* Action Button: Start or Cancel Forge (Locked to h-10 with perfect baseline alignment) */}
          <div className="flex flex-col justify-end">
            {isRunning ? (
              <button
                type="button"
                onClick={onCancelForge}
                className="skyrim-btn w-full h-10 bg-[#1a0a0a] border-[#7f1d1d] text-[#f87171] hover:border-[#dc2626] hover:text-white px-6 text-xs inline-flex items-center justify-center gap-2 shadow-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
                <span className="font-nordic tracking-wider uppercase font-bold">
                  {t('input.cancel', 'CANCELAR')}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onStartForge}
                disabled={!source.trim() || isValidating}
                className={`skyrim-btn-primary w-full h-10 px-6 text-xs inline-flex items-center justify-center gap-2 shadow-lg transition-all ${
                  !source.trim() || isValidating
                    ? 'opacity-40 cursor-not-allowed'
                    : 'cursor-pointer hover:shadow-[0_0_15px_rgba(224,99,27,0.4)]'
                }`}
              >
                <Flame className="w-4 h-4 text-[#f59e0b]" />
                <span className="font-nordic tracking-widest uppercase font-bold">
                  {t('input.start', 'FORJAR PLUGIN')}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Also export SkyrimInput for backwards compatibility
export const SkyrimInput = ForgePanel;

