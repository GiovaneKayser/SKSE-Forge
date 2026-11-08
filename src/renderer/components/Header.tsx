import React from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Wrench, Check, AlertTriangle } from 'lucide-react';

interface HeaderProps {
  onOpenEnvModal: () => void;
  envReady: boolean;
  isCheckingEnv: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenEnvModal,
  envReady,
  isCheckingEnv,
}) => {
  const { t, i18n } = useTranslation();

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    i18n.changeLanguage(e.target.value);
  };

  return (
    <header className="relative w-full border-b border-[#2e3346] bg-[#0c0e14] px-6 pt-4 pb-3 shadow-[0_4px_24px_rgba(0,0,0,0.8)] select-none">
      <div className="flex items-center justify-between">
        {/* Left: Ancient Imperial / Blacksmith Emblem + Titles */}
        <div className="flex items-center space-x-4">
          {/* Forged Emblem Shield */}
          <div className="relative flex items-center justify-center w-12 h-12 border border-[#8c7447]/60 bg-[#141721] shadow-[0_0_15px_rgba(197,160,89,0.2)] shrink-0">
            {/* Skyrim Imperial Dragon / Diamond Emblem */}
            <svg
              className="w-7 h-7 text-[#c5a059] drop-shadow-[0_0_8px_rgba(197,160,89,0.5)]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2L4 7v6c0 5 4 8 8 9 4-1 8-4 8-9V7l-8-5z" />
              <path d="M12 6l-4 4 4 4 4-4-4-4z" fill="#c5a059" fillOpacity="0.25" />
              <path d="M12 14v4" />
              <path d="M9 11h6" />
            </svg>
            {/* Corner metallic rivets */}
            <span className="absolute top-0.5 left-0.5 w-1 h-1 bg-[#8c7447]/70"></span>
            <span className="absolute top-0.5 right-0.5 w-1 h-1 bg-[#8c7447]/70"></span>
            <span className="absolute bottom-0.5 left-0.5 w-1 h-1 bg-[#8c7447]/70"></span>
            <span className="absolute bottom-0.5 right-0.5 w-1 h-1 bg-[#8c7447]/70"></span>
          </div>

          <div>
            <div className="flex items-center space-x-3">
              <h1 className="font-nordic text-2xl font-bold tracking-[0.2em] uppercase text-[#c5a059] drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
                {t('app.title', 'SKSE FORGE')}
              </h1>
              <span className="whitespace-nowrap inline-flex items-center px-2 py-0.5 border border-[#3d4457] text-[#c5a059] text-[10px] font-serif uppercase tracking-widest bg-[#0a0c12]">
                [ 100% NATIVO ]
              </span>
            </div>
            <p className="text-xs text-[#a8b0bf] font-sans tracking-wide mt-0.5">
              {t('app.subtitle', 'Forja & Transmutação de Plugins SKSE')} —{' '}
              <span className="text-[#8c7447]">{t('app.description', 'Skyrim 1.6.1130+ & 1.7+')}</span>
            </p>
          </div>
        </div>

        {/* Right: Environment Diagnostic Rune + Language Switcher (Uniform Height & Baseline Alignment) */}
        <div className="flex items-center space-x-3">
          {/* Environment Status Button */}
          <button
            type="button"
            onClick={onOpenEnvModal}
            className={`h-9 px-3.5 inline-flex items-center justify-center gap-2 text-xs font-nordic tracking-widest uppercase border transition-all duration-200 cursor-pointer whitespace-nowrap ${
              isCheckingEnv
                ? 'border-[#2e3346] text-[#a8b0bf] bg-[#141721]'
                : envReady
                ? 'border-[#1f5c2b] text-[#4ade80] bg-[#0c1610] hover:border-[#2e8540] shadow-[0_0_10px_rgba(46,133,64,0.2)]'
                : 'border-[#7f1d1d] text-[#f87171] bg-[#1a0a0a] hover:border-[#dc2626] shadow-[0_0_10px_rgba(220,38,38,0.2)]'
            }`}
            title="Diagnóstico de compiladores e ferramentas"
          >
            {isCheckingEnv ? (
              <span className="animate-spin w-3.5 h-3.5 border border-[#a8b0bf] border-t-transparent" />
            ) : envReady ? (
              <Check className="w-3.5 h-3.5 text-[#4ade80]" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 text-[#f87171]" />
            )}
            <span className="whitespace-nowrap inline-flex items-center">[ {t('nav.environment', 'AMBIENTE')} ]</span>
            <Wrench className="w-3.5 h-3.5 opacity-60 ml-0.5" />
          </button>

          {/* Language Selector Dropdown (Exact Same Height h-9) */}
          <div className="relative h-9 inline-flex items-center">
            <div className="absolute left-2.5 pointer-events-none text-[#c5a059] flex items-center justify-center">
              <Globe className="w-3.5 h-3.5" />
            </div>
            <select
              value={i18n.language}
              onChange={handleLanguageChange}
              className="h-9 appearance-none bg-[#141721] hover:bg-[#1a1e2b] border border-[#2e3346] hover:border-[#c5a059]/70 text-[#d1d5db] font-nordic text-xs pl-8 pr-7 focus:outline-none focus:border-[#c5a059] transition-colors cursor-pointer tracking-wider uppercase inline-flex items-center"
            >
              <option value="pt-BR">Português (BR)</option>
              <option value="en-US">English (US)</option>
              <option value="es-ES">Español (ES)</option>
            </select>
            <div className="absolute right-2 pointer-events-none text-[#a8b0bf] text-[10px] flex items-center">
              ▼
            </div>
          </div>
        </div>
      </div>

      {/* SkyUI Diamond Divider */}
      <div className="flex items-center justify-center mt-3 opacity-60">
        <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-[#8c7447] to-transparent"></div>
        <span className="mx-3 text-[#c5a059] text-xs">◆</span>
        <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-[#8c7447] to-transparent"></div>
      </div>
    </header>
  );
};

// Also export SkyrimHeader for backwards compatibility
export const SkyrimHeader = Header;
