import React, { useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Terminal, Copy, Trash2, ArrowDownCircle, Check } from 'lucide-react';
import { LogMessage } from '../../shared/types';

interface ConsoleTerminalProps {
  logs: LogMessage[];
  onClear: () => void;
}

export const ConsoleTerminal: React.FC<ConsoleTerminalProps> = ({ logs, onClear }) => {
  const { t } = useTranslation();
  const [autoscroll, setAutoscroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState<'all' | 'info' | 'warn' | 'error'>('all');
  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  // Filter logs
  const filteredLogs = logs.filter((log) => {
    if (filter === 'all') return true;
    if (filter === 'error') return log.type === 'error' || log.text.toLowerCase().includes('error');
    if (filter === 'warn') return log.type === 'warn' || log.text.toLowerCase().includes('warning');
    if (filter === 'info') return log.type === 'info' || log.type === 'stdout' || log.type === 'success';
    return true;
  });

  // Auto-scroll logic
  useEffect(() => {
    if (autoscroll && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoscroll]);

  // Copy logs to clipboard
  const handleCopy = () => {
    const raw = logs.map((l) => `[${new Date(l.timestamp).toLocaleTimeString()}] ${l.text}`).join('\n');
    navigator.clipboard.writeText(raw);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Line color styling (Skyrim Authentic Palette)
  const getLogStyle = (log: LogMessage) => {
    const textLower = log.text.toLowerCase();
    if (log.type === 'error' || textLower.includes('error:') || textLower.includes('fatal:') || textLower.includes('[erro]')) {
      return 'text-[#f87171] bg-[#1a0a0a]/60 border-l border-[#7f1d1d]';
    }
    if (log.type === 'warn' || textLower.includes('warning:') || textLower.includes('[aviso]')) {
      return 'text-[#f59e0b] bg-[#1e1708]/40 border-l border-[#8c7447]';
    }
    if (log.type === 'success' || textLower.includes('sucesso') || textLower.includes('succeeded')) {
      return 'text-[#4ade80] font-semibold';
    }
    if (textLower.includes('[patch]') || textLower.includes('[transmutação')) {
      return 'text-[#e5c687] font-medium';
    }
    if (textLower.includes('[cmake') || textLower.includes('[msbuild]') || textLower.includes('[empacotamento]')) {
      return 'text-[#73a5c6]';
    }
    return 'text-[#d1d5db]/85';
  };

  return (
    <div className="bg-[#141721] border border-[#2e3346] flex flex-col flex-1 shadow-[0_4px_20px_rgba(0,0,0,0.6)] overflow-hidden">
      {/* Terminal Title Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#0c0e14] border-b border-[#2e3346] select-none">
        <div className="flex items-center space-x-2.5">
          <Terminal className="w-4 h-4 text-[#c5a059]" />
          <span className="font-nordic text-xs font-bold uppercase tracking-[0.18em] text-[#e5c687]">
            {t('terminal.title', 'TERMINAL NÓRDICO & REGISTRO DE EVENTOS')}
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 bg-[#090a0f] border border-[#2e3346] text-[#a8b0bf]">
            [ {logs.length} LINHAS ]
          </span>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-2">
          {/* Severity filter (Straight Forged Tags) */}
          <div className="flex items-center bg-[#090a0f] border border-[#2e3346] p-0.5 text-[10px] font-nordic tracking-wider uppercase">
            <button
              onClick={() => setFilter('all')}
              className={`px-2 py-0.5 transition-colors cursor-pointer ${
                filter === 'all'
                  ? 'bg-[#1e2330] text-[#e5c687] font-bold border border-[#434b63]'
                  : 'text-[#a8b0bf] hover:text-[#d1d5db]'
              }`}
            >
              {t('terminal.filter_all', 'TODOS')}
            </button>
            <button
              onClick={() => setFilter('warn')}
              className={`px-2 py-0.5 transition-colors cursor-pointer ${
                filter === 'warn'
                  ? 'bg-[#2a1b08] text-[#f59e0b] font-bold border border-[#8c7447]'
                  : 'text-[#a8b0bf] hover:text-[#f59e0b]'
              }`}
            >
              {t('terminal.filter_warn', 'AVISOS')}
            </button>
            <button
              onClick={() => setFilter('error')}
              className={`px-2 py-0.5 transition-colors cursor-pointer ${
                filter === 'error'
                  ? 'bg-[#240c0c] text-[#f87171] font-bold border border-[#7f1d1d]'
                  : 'text-[#a8b0bf] hover:text-[#f87171]'
              }`}
            >
              {t('terminal.filter_error', 'ERROS')}
            </button>
          </div>

          {/* Autoscroll toggle */}
          <button
            onClick={() => setAutoscroll(!autoscroll)}
            className={`p-1.5 border text-xs transition-colors cursor-pointer ${
              autoscroll
                ? 'border-[#73a5c6] text-[#73a5c6] bg-[#0f1d24]'
                : 'border-[#2e3346] text-[#a8b0bf] hover:text-[#d1d5db]'
            }`}
            title={t('terminal.autoscroll', 'Rolar Automaticamente')}
          >
            <ArrowDownCircle className="w-3.5 h-3.5" />
          </button>

          {/* Copy logs */}
          <button
            onClick={handleCopy}
            disabled={logs.length === 0}
            className="p-1.5 border border-[#2e3346] text-[#a8b0bf] hover:text-[#d1d5db] hover:border-[#c5a059] transition-colors disabled:opacity-30 cursor-pointer"
            title={t('terminal.copy', 'Copiar Registro')}
          >
            {copied ? <Check className="w-3.5 h-3.5 text-[#4ade80]" /> : <Copy className="w-3.5 h-3.5 text-[#a8b0bf]" />}
          </button>

          {/* Clear logs */}
          <button
            onClick={onClear}
            disabled={logs.length === 0}
            className="p-1.5 border border-[#2e3346] text-[#a8b0bf] hover:text-[#f87171] hover:border-[#7f1d1d] transition-colors disabled:opacity-30 cursor-pointer"
            title={t('terminal.clear', 'Limpar Terminal')}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Terminal Output Area (Stone Slate) */}
      <div className="flex-1 p-4 font-mono text-[12px] leading-relaxed overflow-y-auto select-text bg-[#090a0f] min-h-[220px]">
        {filteredLogs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-[#626877] space-y-2 py-10 select-none">
            <Terminal className="w-8 h-8 opacity-40 text-[#c5a059]" />
            <p className="font-nordic uppercase tracking-wider text-xs">
              {t('terminal.empty', 'Nenhum evento registrado ainda. Inicie um processo para acompanhar o progresso.')}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {filteredLogs.map((log, index) => (
              <div
                key={index}
                className={`py-0.5 px-2 font-mono flex items-start space-x-2.5 transition-colors ${getLogStyle(log)}`}
              >
                <span className="text-[#626877] text-[10px] select-none shrink-0 pt-0.5">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span className="break-all whitespace-pre-wrap flex-1">{log.text}</span>
              </div>
            ))}
            <div ref={terminalEndRef} />
          </div>
        )}
      </div>
    </div>
  );
};

// Also export SkyrimTerminal for backwards compatibility
export const SkyrimTerminal = ConsoleTerminal;

