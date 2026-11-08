import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  FolderOpen,
  Copy,
  Check,
  AlertTriangle,
  FileArchive,
  RefreshCw,
  Sparkles,
  Wrench,
} from 'lucide-react';

interface QuestCompletedModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: {
    zipPath: string;
    dllPath: string;
    distDir: string;
    modName: string;
    durationMs: number;
    filesPackaged: string[];
    patchReport?: {
      appliedPatches: Array<{ id: string; category: string; description: string; filePath: string }>;
      modifiedFiles: string[];
    };
  } | null;
  onOpenFolder: (path: string) => void;
  onCopyPath: (text: string) => void;
}

interface EnvDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  envReport: any;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const SkyrimQuestModal: React.FC<QuestCompletedModalProps> = ({
  isOpen,
  onClose,
  result,
  onOpenFolder,
  onCopyPath,
}) => {
  const { t } = useTranslation();
  const [copied, setCopied] = React.useState(false);

  if (!isOpen || !result) return null;

  const handleCopy = () => {
    onCopyPath(result.zipPath);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-quest-in">
      <div className="relative w-full max-w-2xl bg-[#141721] border-2 border-[#c5a059] p-6 shadow-[0_0_50px_rgba(197,160,89,0.3)] text-[#d1d5db]">
        {/* Corner metallic rivets */}
        <span className="absolute top-1 left-1 w-1.5 h-1.5 bg-[#c5a059]"></span>
        <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-[#c5a059]"></span>
        <span className="absolute bottom-1 left-1 w-1.5 h-1.5 bg-[#c5a059]"></span>
        <span className="absolute bottom-1 right-1 w-1.5 h-1.5 bg-[#c5a059]"></span>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#a8b0bf] hover:text-[#e5c687] transition-colors p-1 border border-transparent hover:border-[#8c7447] cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Quest Completed Banner Header */}
        <div className="text-center pt-2 pb-4">
          <div className="flex items-center justify-center space-x-2 text-[#c5a059] mb-1">
            <span className="text-xs">◆</span>
            <h2 className="font-nordic text-2xl font-bold tracking-[0.25em] uppercase text-[#e5c687] drop-shadow-[0_2px_10px_rgba(197,160,89,0.7)]">
              {t('quest.banner_title', 'MISSÃO CONCLUÍDA')}
            </h2>
            <span className="text-xs">◆</span>
          </div>

          <p className="font-nordic text-xs tracking-widest uppercase text-[#d1d5db] font-semibold mt-1">
            {t('quest.banner_subtitle', 'PLUGIN FORJADO COM SUCESSO')} — {result.modName}
          </p>

          {/* SkyUI Diamond Divider */}
          <div className="flex items-center justify-center my-3 opacity-60">
            <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-[#8c7447] to-transparent"></div>
            <span className="mx-3 text-[#c5a059] text-xs">◆</span>
            <div className="h-[1px] w-full bg-gradient-to-r from-transparent via-[#8c7447] to-transparent"></div>
          </div>

          <p className="text-xs text-[#a8b0bf] px-6 font-sans">
            {t('quest.summary', 'O plugin SKSE foi recompilado com CommonLibSSE-NG e empacotado para instalação direta no Mod Organizer 2 e Vortex.')}
          </p>
        </div>

        {/* Compatibility and Output Artifact Info */}
        <div className="bg-[#0c0e14] border border-[#2e3346] p-4 mb-4 space-y-3">
          <div className="flex items-center justify-between text-xs pb-2 border-b border-[#2e3346]">
            <span className="text-[#a8b0bf] font-nordic tracking-wider uppercase">{t('quest.target_versions', 'COMPATIBILIDADE:')}</span>
            <span className="px-2.5 py-0.5 text-[10px] font-nordic font-bold uppercase bg-[#0c1610] border border-[#1f5c2b] text-[#4ade80]">
              [ ADDRESS LIBRARY FORMATO 5+ ]
            </span>
          </div>

          <div>
            <span className="text-[11px] font-nordic tracking-wider uppercase text-[#c5a059] block mb-1">
              {t('quest.output_file', 'PACOTE FINAL')} (ZIP PARA MO2 / VORTEX):
            </span>
            <div className="flex items-center space-x-2 bg-[#090a0f] p-2.5 border border-[#2e3346]">
              <FileArchive className="w-5 h-5 text-[#c5a059] shrink-0" />
              <span className="font-mono text-xs text-[#e5c687] truncate flex-1">
                {result.zipPath}
              </span>
            </div>
          </div>

          {result.patchReport && result.patchReport.appliedPatches.length > 0 && (
            <div className="pt-2">
              <span className="text-[11px] font-nordic tracking-wider uppercase text-[#a8b0bf] block mb-1">
                {t('patches.title', 'CORREÇÕES APLICADAS')} ({result.patchReport.appliedPatches.length}):
              </span>
              <ul className="text-xs text-[#d1d5db]/80 space-y-1 list-disc list-inside font-sans">
                {result.patchReport.appliedPatches.slice(0, 4).map((p, i) => (
                  <li key={i} className="truncate">
                    <span className="text-[#c5a059] font-mono">[{p.category}]</span> {p.description}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => onOpenFolder(result.zipPath)}
              className="skyrim-btn skyrim-btn-primary px-5 py-2.5 text-xs flex items-center space-x-2"
            >
              <FolderOpen className="w-4 h-4 text-[#c5a059]" />
              <span>{t('quest.open_folder', 'ABRIR PASTA')}</span>
            </button>

            <button
              onClick={handleCopy}
              className="skyrim-btn px-4 py-2.5 text-xs flex items-center space-x-2 text-[#d1d5db]"
            >
              <Copy className="w-3.5 h-3.5 text-[#73a5c6]" />
              <span>{copied ? t('terminal.copied', 'Copiado!') : t('quest.copy_path', 'COPIAR CAMINHO')}</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="skyrim-btn px-6 py-2.5 text-xs font-nordic uppercase tracking-widest text-[#d1d5db]"
          >
            {t('quest.close', 'FECHAR')}
          </button>
        </div>
      </div>
    </div>
  );
};

export const SkyrimEnvModal: React.FC<EnvDiagnosticsModalProps> = ({
  isOpen,
  onClose,
  envReport,
  onRefresh,
  isRefreshing,
}) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  const tools = [
    {
      name: t('env.msvc', 'Visual Studio C++ (MSVC)'),
      status: envReport?.msvc,
      required: true,
      hint: 'Requer suporte a C++ x86/x64 no Visual Studio 2022/2026/Build Tools.',
    },
    {
      name: t('env.cmake', 'CMake Generator'),
      status: envReport?.cmake,
      required: true,
      hint: 'Detectado no PATH ou no diretório embutido do Visual Studio.',
    },
    {
      name: t('env.vcpkg', 'Gerenciador vcpkg'),
      status: envReport?.vcpkg,
      required: true,
      hint: 'Localizado via VCPKG_ROOT, Visual Studio ou diretórios padrão.',
    },
    {
      name: t('env.git', 'Git CLI'),
      status: envReport?.git,
      required: true,
      hint: 'Necessário para clonagem de repositórios e submódulos Git.',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-quest-in">
      <div className="relative w-full max-w-xl bg-[#141721] border border-[#2e3346] p-6 shadow-2xl text-[#d1d5db]">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#a8b0bf] hover:text-[#d1d5db] transition-colors p-1 border border-transparent hover:border-[#8c7447] cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-2.5 pb-2">
          <Wrench className="w-5 h-5 text-[#c5a059]" />
          <h2 className="font-nordic text-lg font-bold tracking-[0.2em] uppercase text-[#c5a059]">
            {t('env.title', 'DIAGNÓSTICO DO AMBIENTE DE FORJA')}
          </h2>
        </div>

        <p className="text-xs text-[#a8b0bf] mb-4 font-sans">
          {t('env.auto_detected', 'Verificação automática de ferramentas de compilação instaladas no sistema.')}
        </p>

        {/* Tools list (Stone Blocks) */}
        <div className="space-y-3 mb-6">
          {tools.map((tool, idx) => {
            const found = tool.status?.found;
            return (
              <div
                key={idx}
                className="bg-[#0c0e14] border border-[#2e3346] p-3 text-xs flex flex-col space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    {found ? (
                      <Check className="w-4 h-4 text-[#4ade80] stroke-[2.5] shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-[#f59e0b] shrink-0" />
                    )}
                    <span className="font-nordic font-bold tracking-wider uppercase text-[#d1d5db]">
                      {tool.name}
                    </span>
                  </div>

                  <span
                    className={`px-2 py-0.5 text-[10px] font-serif uppercase tracking-widest border ${
                      found
                        ? 'bg-[#0c1610] border-[#1f5c2b] text-[#4ade80]'
                        : 'bg-[#1a0a0a] border-[#7f1d1d] text-[#f87171]'
                    }`}
                  >
                    [ {found ? t('env.status_ok', 'PRONTO') : t('env.status_missing', 'AUSENTE')} ]
                  </span>
                </div>

                <div className="text-[11px] font-mono text-[#a8b0bf] pl-6">
                  {found ? (
                    <div>
                      <p className="text-[#d1d5db] font-sans">{tool.status?.version}</p>
                      {tool.status?.path && (
                        <p className="text-[10px] text-[#626877] truncate">
                          {tool.status.path}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-[#f87171]/80 font-sans">{tool.status?.warning || tool.hint}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom bar */}
        <div className="flex items-center justify-between pt-3 border-t border-[#2e3346]">
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="skyrim-btn px-4 py-2 text-xs flex items-center space-x-2 text-[#d1d5db]"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{t('env.refresh', 'ATUALIZAR')}</span>
          </button>

          <button
            onClick={onClose}
            className="skyrim-btn skyrim-btn-primary px-6 py-2 text-xs"
          >
            {t('quest.close', 'FECHAR')}
          </button>
        </div>
      </div>
    </div>
  );
};
