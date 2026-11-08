import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Database, ShieldCheck, Gamepad2, HardDrive } from 'lucide-react';
import { SkyrimInstallInfo } from '../../shared/types';

interface DirectoryFooterProps {
  onBrowseSkyrim?: () => void;
}

export const DirectoryFooter: React.FC<DirectoryFooterProps> = () => {
  const { t } = useTranslation();
  const [activeInstall, setActiveInstall] = useState<SkyrimInstallInfo | null>(null);

  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.detectSkyrim().then((installs) => {
      if (installs && installs.length > 0) {
        setActiveInstall(installs[0]);
      }
    });
  }, []);

  return (
    <footer className="w-full bg-[#0a0c12] border-t border-[#2e3346] px-6 py-2 select-none z-20">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Left: Active Game Installation */}
        <div className="flex items-center space-x-2 text-[#a8b0bf]">
          <HardDrive className="w-3.5 h-3.5 text-[#c5a059]" />
          <span className="font-nordic text-[11px] tracking-wider uppercase text-[#c5a059]">
            {t('footer.skyrim_env', 'AMBIENTE SKYRIM:')}
          </span>
          <span className="font-mono text-[#d1d5db] truncate max-w-md">
            {activeInstall?.path || t('footer.no_install', 'Nenhuma instalação detectada')}
          </span>
        </div>

        {/* Right: Game Version, SKSE Status, and Address Library Count */}
        <div className="flex items-center space-x-4 font-mono text-[11px]">
          {/* Game Version Badge */}
          {activeInstall?.gameVersion && (
            <div className="flex items-center space-x-1.5 text-[#73a5c6]">
              <Gamepad2 className="w-3.5 h-3.5" />
              <span>Skyrim v{activeInstall.gameVersion}</span>
            </div>
          )}

          {/* SKSE Status */}
          <div className="flex items-center space-x-1.5 text-[#4ade80]">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>
              {activeInstall?.hasSkse
                ? activeInstall.skseVersion
                  ? `SKSE64 v${activeInstall.skseVersion}`
                  : 'SKSE64 Ativo'
                : 'SKSE Ausente'}
            </span>
          </div>

          {/* Address Library Database Count */}
          {activeInstall && activeInstall.addressLibraryFiles.length > 0 && (
            <div className="flex items-center space-x-1.5 text-[#e5c687]">
              <Database className="w-3.5 h-3.5" />
              <span>{activeInstall.addressLibraryFiles.length} Bases AL</span>
            </div>
          )}
        </div>
      </div>
    </footer>
  );
};

