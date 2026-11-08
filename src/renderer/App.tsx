import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Header } from './components/Header';
import { ModeSelector, ForgeMode } from './components/ModeSelector';
import { ForgePanel } from './components/ForgePanel';
import { ProgressStepper } from './components/ProgressStepper';
import { TransmutationPanel } from './components/TransmutationPanel';
import { ConsoleTerminal } from './components/ConsoleTerminal';
import { DirectoryFooter } from './components/DirectoryFooter';
import { SkyrimQuestModal, SkyrimEnvModal } from './components/SkyrimModal';
import { playQuestCompletedSound } from './utils/skyrimAudio';
import {
  PipelinePhase,
  LogMessage,
  EnvironmentReport,
  ValidationResult,
  PipelineResult,
} from '../shared/types';

export const App: React.FC = () => {
  const { t } = useTranslation();

  // Active Mode: 'forge' (Source Recompilation) | 'binary' (No-Code Binary Transmutation)
  const [activeMode, setActiveMode] = useState<ForgeMode>('forge');

  // Environment state
  const [envReport, setEnvReport] = useState<EnvironmentReport | null>(null);
  const [isCheckingEnv, setIsCheckingEnv] = useState<boolean>(false);
  const [isEnvModalOpen, setIsEnvModalOpen] = useState<boolean>(false);

  // Forge mode state
  const [source, setSource] = useState<string>('');
  const [modName, setModName] = useState<string>('');
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [validationInfo, setValidationInfo] = useState<ValidationResult | null>(null);

  // Pipeline execution state
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [currentPhase, setCurrentPhase] = useState<PipelinePhase>('idle');
  const [phaseDetail, setPhaseDetail] = useState<string>('');
  const [logs, setLogs] = useState<LogMessage[]>([]);

  // Binary mode state
  const [isTransmuting, setIsTransmuting] = useState<boolean>(false);

  // Quest Completed result modal (Forge Mode)
  const [completedResult, setCompletedResult] = useState<PipelineResult | null>(null);
  const [isQuestModalOpen, setIsQuestModalOpen] = useState<boolean>(false);

  // Check environment on mount
  const checkEnvironment = async (forceRefresh = false) => {
    if (!window.electronAPI) return;
    setIsCheckingEnv(true);
    try {
      const report = await window.electronAPI.detectEnvironment(forceRefresh);
      setEnvReport(report);
    } catch (err) {
      console.error('Environment check failed:', err);
    } finally {
      setIsCheckingEnv(false);
    }
  };

  useEffect(() => {
    checkEnvironment();
  }, []);

  // Listen to IPC events from Electron Main
  useEffect(() => {
    if (!window.electronAPI) return;

    const unsubPhase = window.electronAPI.onPhaseChange((data) => {
      setCurrentPhase(data.phase);
      if (data.detail) {
        setPhaseDetail(data.detail);
      }
    });

    const unsubLog = window.electronAPI.onLog((logMsg) => {
      setLogs((prev) => [...prev, logMsg]);
    });

    const unsubBinaryLog = window.electronAPI.onBinaryLog?.((logMsg) => {
      setLogs((prev) => [...prev, logMsg]);
    });

    const unsubComplete = window.electronAPI.onComplete((result) => {
      setIsRunning(false);
      setCurrentPhase('completed');
      setCompletedResult(result);
      setIsQuestModalOpen(true);
      playQuestCompletedSound();
    });

    const unsubError = window.electronAPI.onError((errData) => {
      setIsRunning(false);
      setCurrentPhase('failed');
      setPhaseDetail(errData.message);
    });

    return () => {
      unsubPhase();
      unsubLog();
      unsubBinaryLog?.();
      unsubComplete();
      unsubError();
    };
  }, []);

  // Debounced validation of source input
  useEffect(() => {
    if (!source.trim() || !window.electronAPI) {
      setValidationInfo(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsValidating(true);
      try {
        const val = await window.electronAPI.validateSource(source.trim());
        setValidationInfo(val);
        if (val.isValid && val.modName && !modName) {
          setModName(val.modName);
        }
      } catch (err) {
        console.error('Validation error:', err);
      } finally {
        setIsValidating(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [source]);

  // Browse local directory for Forge mode
  const handleBrowseFolder = async () => {
    if (!window.electronAPI) return;
    try {
      const selected = await window.electronAPI.selectDirectory();
      if (selected) {
        setSource(selected);
      }
    } catch (err) {
      console.error('Directory picker failed:', err);
    }
  };

  // Start the Forge pipeline
  const handleStartForge = async () => {
    if (!source.trim() || !window.electronAPI || isRunning) return;

    setLogs([]);
    setIsRunning(true);
    setCurrentPhase('clone');
    setPhaseDetail('');
    setCompletedResult(null);

    try {
      await window.electronAPI.startPipeline({
        source: source.trim(),
        customModName: modName.trim() || undefined,
      });
    } catch (err: any) {
      setIsRunning(false);
      setCurrentPhase('failed');
      setPhaseDetail(err.message || 'Erro durante a execução.');
    }
  };

  // Cancel running pipeline
  const handleCancelForge = async () => {
    if (!window.electronAPI) return;
    try {
      await window.electronAPI.cancelPipeline();
      setIsRunning(false);
      setCurrentPhase('failed');
      setPhaseDetail('Operação cancelada pelo usuário.');
    } catch (err) {
      console.error('Cancel failed:', err);
    }
  };

  // Open destination folder
  const handleOpenDestination = (filePath: string) => {
    if (window.electronAPI) {
      window.electronAPI.openDestination(filePath);
    }
  };

  // Copy to clipboard
  const handleCopyPath = (text: string) => {
    if (window.electronAPI) {
      window.electronAPI.copyToClipboard(text);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#090a0f] text-[#d1d5db] font-sans select-none">
      {/* Skyrim Header with Leveled Language and Environment Badges */}
      <Header
        onOpenEnvModal={() => setIsEnvModalOpen(true)}
        envReady={Boolean(envReport?.isReady)}
        isCheckingEnv={isCheckingEnv}
      />

      {/* Main Scrollable Content Area */}
      <main className="flex-1 flex flex-col p-6 overflow-y-auto space-y-4 max-w-7xl w-full mx-auto">
        {/* Mode Selector (A Forja vs A Transmutação) */}
        <ModeSelector
          activeMode={activeMode}
          onSelectMode={(mode) => setActiveMode(mode)}
          disabled={isRunning || isTransmuting}
        />

        {/* Conditional Mode Panels */}
        {activeMode === 'forge' ? (
          <>
            {/* Input & Action Panel */}
            <ForgePanel
              source={source}
              onSourceChange={setSource}
              modName={modName}
              onModNameChange={setModName}
              onBrowseFolder={handleBrowseFolder}
              onStartForge={handleStartForge}
              onCancelForge={handleCancelForge}
              isRunning={isRunning}
              isValidating={isValidating}
              validationInfo={validationInfo}
            />

            {/* Themed Progress Stepper (Mathematically Centered Horizontal Lines) */}
            <ProgressStepper currentPhase={currentPhase} phaseDetail={phaseDetail} />
          </>
        ) : (
          /* Binary No-Code Transmutation Panel */
          <TransmutationPanel
            onOpenFolder={handleOpenDestination}
            onCopyPath={handleCopyPath}
            isTransmuting={isTransmuting}
            setIsTransmuting={setIsTransmuting}
          />
        )}

        {/* Embedded Real-Time Skyrim Console Terminal */}
        <ConsoleTerminal logs={logs} onClear={() => setLogs([])} />
      </main>

      {/* Universal Skyrim Status Footer */}
      <DirectoryFooter />

      {/* Quest Completed Modal (Forge Mode) */}
      <SkyrimQuestModal
        isOpen={isQuestModalOpen}
        onClose={() => setIsQuestModalOpen(false)}
        result={completedResult}
        onOpenFolder={handleOpenDestination}
        onCopyPath={handleCopyPath}
      />

      {/* Environment Diagnostics Modal */}
      <SkyrimEnvModal
        isOpen={isEnvModalOpen}
        onClose={() => setIsEnvModalOpen(false)}
        envReport={envReport}
        onRefresh={() => checkEnvironment(true)}
        isRefreshing={isCheckingEnv}
      />
    </div>
  );
};
