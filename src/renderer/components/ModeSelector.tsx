import React from 'react';
import { useTranslation } from 'react-i18next';
import { Flame, Sparkles, Code2, Cpu } from 'lucide-react';

export type ForgeMode = 'forge' | 'binary';

interface ModeSelectorProps {
  activeMode: ForgeMode;
  onSelectMode: (mode: ForgeMode) => void;
  disabled?: boolean;
}

export const ModeSelector: React.FC<ModeSelectorProps> = ({
  activeMode,
  onSelectMode,
  disabled = false,
}) => {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Mode 1: A Forja (The Forge - Recompilação Nativa C++) */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSelectMode('forge')}
        className={`group text-left relative p-5 transition-all duration-200 cursor-pointer overflow-hidden ${
          activeMode === 'forge'
            ? 'bg-[#141721] border border-[#e0631b] shadow-[0_0_24px_rgba(224,99,27,0.22),inset_0_1px_0_rgba(245,158,11,0.3)]'
            : 'bg-[#141721]/80 border border-[#2e3346] hover:border-[#8c7447] opacity-80 hover:opacity-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]'
        } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
      >
        {/* Subtle Charcoal / Ember Glow Background */}
        {activeMode === 'forge' && (
          <div className="absolute inset-0 bg-gradient-to-br from-[#e0631b]/10 via-transparent to-transparent pointer-events-none"></div>
        )}

        {/* Metallic Corner Rivets / Brackets */}
        <span className={`absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 transition-colors ${activeMode === 'forge' ? 'border-[#e0631b]' : 'border-[#434b63]'}`}></span>
        <span className={`absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 transition-colors ${activeMode === 'forge' ? 'border-[#e0631b]' : 'border-[#434b63]'}`}></span>
        <span className={`absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 transition-colors ${activeMode === 'forge' ? 'border-[#e0631b]' : 'border-[#434b63]'}`}></span>
        <span className={`absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 transition-colors ${activeMode === 'forge' ? 'border-[#e0631b]' : 'border-[#434b63]'}`}></span>

        {/* Top Header Row with Fixed Checkbox Position */}
        <div className="flex items-start justify-between relative z-10 gap-3">
          <div className="flex items-center space-x-3.5 min-w-0 flex-1">
            {/* Anvil / Fire Icon Plate */}
            <div
              className={`p-2.5 border transition-colors shrink-0 ${
                activeMode === 'forge'
                  ? 'bg-[#2a170b] border-[#e0631b] text-[#f59e0b] shadow-[0_0_12px_rgba(224,99,27,0.4)]'
                  : 'bg-[#0c0e14] border-[#2e3346] text-[#a8b0bf] group-hover:text-[#c5a059]'
              }`}
            >
              <Flame className="w-6 h-6" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-nordic font-bold text-base tracking-[0.18em] uppercase text-[#e5c687] truncate">
                  {t('modes.forge_title', 'A FORJA')}
                </h3>
                <span className="whitespace-nowrap inline-flex items-center px-2 py-0.5 border border-[#1f5c2b] text-[#4ade80] text-[10px] font-serif uppercase tracking-widest bg-[#0c1610] shrink-0">
                  [ 100% NATIVO ]
                </span>
              </div>
              <p className="text-xs text-[#a8b0bf] font-sans mt-0.5 truncate">
                {t('modes.forge_subtitle', 'Recompilar via Código-Fonte (Recomendado)')}
              </p>
            </div>
          </div>

          {/* Active Skyrim Selection Diamond (Fixed Position) */}
          <div
            className={`w-6 h-6 border flex items-center justify-center font-nordic text-xs transition-all shrink-0 ${
              activeMode === 'forge'
                ? 'border-[#e0631b] bg-[#2a170b] text-[#f59e0b] shadow-[0_0_8px_rgba(224,99,27,0.6)] font-bold'
                : 'border-[#2e3346] bg-[#0c0e14] text-transparent'
            }`}
          >
            ◆
          </div>
        </div>

        <p className="text-xs text-[#d1d5db]/80 mt-3.5 leading-relaxed relative z-10 line-clamp-2">
          {t(
            'modes.forge_desc',
            'Migra para CommonLibSSE-NG e compila uma DLL nativa para Skyrim 1.6.1130+ com estabilidade perfeita e verificação rigorosa em CMake.'
          )}
        </p>

        {/* Technical Requirements / Tags */}
        <div className="mt-3.5 pt-2.5 border-t border-[#2e3346]/80 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-[#a8b0bf] relative z-10">
          <span className="flex items-center space-x-1.5 font-mono whitespace-nowrap">
            <Code2 className="w-3.5 h-3.5 text-[#e5c687]" />
            <span>{t('modes.req_source', 'Código C++ Aberto')}</span>
          </span>
          <span className="flex items-center space-x-1.5 font-mono whitespace-nowrap">
            <Cpu className="w-3.5 h-3.5 text-[#e5c687]" />
            <span>{t('modes.req_tools', 'MSVC + CMake')}</span>
          </span>
        </div>
      </button>

      {/* Mode 2: A Transmutação (The Enchanter - No-Code Binary Transmutation) */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSelectMode('binary')}
        className={`group text-left relative p-5 transition-all duration-200 cursor-pointer overflow-hidden ${
          activeMode === 'binary'
            ? 'bg-[#141721] border border-[#548b9c] shadow-[0_0_24px_rgba(115,165,198,0.22),inset_0_1px_0_rgba(115,165,198,0.3)]'
            : 'bg-[#141721]/80 border border-[#2e3346] hover:border-[#548b9c]/70 opacity-80 hover:opacity-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]'
        } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
      >
        {/* Subtle Arcane Mist Background */}
        {activeMode === 'binary' && (
          <div className="absolute inset-0 bg-gradient-to-br from-[#548b9c]/10 via-transparent to-transparent pointer-events-none"></div>
        )}

        {/* Metallic Corner Rivets / Brackets */}
        <span className={`absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 transition-colors ${activeMode === 'binary' ? 'border-[#73a5c6]' : 'border-[#434b63]'}`}></span>
        <span className={`absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 transition-colors ${activeMode === 'binary' ? 'border-[#73a5c6]' : 'border-[#434b63]'}`}></span>
        <span className={`absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 transition-colors ${activeMode === 'binary' ? 'border-[#73a5c6]' : 'border-[#434b63]'}`}></span>
        <span className={`absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 transition-colors ${activeMode === 'binary' ? 'border-[#73a5c6]' : 'border-[#434b63]'}`}></span>

        {/* Top Header Row with Fixed Checkbox Position & Protected Badge */}
        <div className="flex items-start justify-between relative z-10 gap-3">
          <div className="flex items-center space-x-3.5 min-w-0 flex-1">
            {/* Soul Gem / Rune Plate */}
            <div
              className={`p-2.5 border transition-colors shrink-0 ${
                activeMode === 'binary'
                  ? 'bg-[#0f1d24] border-[#73a5c6] text-[#73a5c6] shadow-[0_0_12px_rgba(115,165,198,0.4)]'
                  : 'bg-[#0c0e14] border-[#2e3346] text-[#a8b0bf] group-hover:text-[#73a5c6]'
              }`}
            >
              <Sparkles className="w-6 h-6" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-nordic font-bold text-base tracking-[0.18em] uppercase text-[#73a5c6] truncate">
                  {t('modes.binary_title', 'A TRANSMUTAÇÃO')}
                </h3>
                <span className="whitespace-nowrap inline-flex items-center px-2 py-0.5 border border-[#355b66] text-[#73a5c6] text-[10px] font-serif uppercase tracking-widest bg-[#0c161c] shrink-0">
                  [ NO-CODE / EXPERIMENTAL ]
                </span>
              </div>
              <p className="text-xs text-[#a8b0bf] font-sans mt-0.5 truncate">
                {t('modes.binary_subtitle', 'Compatibilização de DLL Fechada / Mod Abandonado')}
              </p>
            </div>
          </div>

          {/* Active Skyrim Selection Diamond (Fixed Position) */}
          <div
            className={`w-6 h-6 border flex items-center justify-center font-nordic text-xs transition-all shrink-0 ${
              activeMode === 'binary'
                ? 'border-[#73a5c6] bg-[#0f1d24] text-[#73a5c6] shadow-[0_0_8px_rgba(115,165,198,0.6)] font-bold'
                : 'border-[#2e3346] bg-[#0c0e14] text-transparent'
            }`}
          >
            ◆
          </div>
        </div>

        <p className="text-xs text-[#d1d5db]/80 mt-3.5 leading-relaxed relative z-10 line-clamp-2">
          {t(
            'modes.binary_desc',
            'Moderniza mods abandonados sem código-fonte. Converte Address Library Formato 5 para 2, aplica correções hexadecimais e gera pacotes para MO2/Vortex.'
          )}
        </p>

        {/* Technical Requirements / Tags */}
        <div className="mt-3.5 pt-2.5 border-t border-[#2e3346]/80 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-[#a8b0bf] relative z-10">
          <span className="flex items-center space-x-1.5 font-mono whitespace-nowrap">
            <span className="text-[#73a5c6]">📦</span>
            <span>{t('modes.req_dll_only', 'Entrada: Apenas arquivo .dll ou .zip')}</span>
          </span>
          <span className="flex items-center space-x-1.5 font-mono whitespace-nowrap">
            <span className="text-[#73a5c6]">⚡</span>
            <span>{t('modes.no_msvc', 'Sem MSVC / Sem Compilador')}</span>
          </span>
        </div>
      </button>
    </div>
  );
};
