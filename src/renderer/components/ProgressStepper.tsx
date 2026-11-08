import React from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Loader2 } from 'lucide-react';
import { PipelinePhase } from '../../shared/types';

interface ProgressStepperProps {
  currentPhase: PipelinePhase;
  phaseDetail?: string;
}

const PHASES: { id: PipelinePhase; key: string }[] = [
  { id: 'clone', key: 'phases.clone' },
  { id: 'scan', key: 'phases.scan' },
  { id: 'patch', key: 'phases.patch' },
  { id: 'configure', key: 'phases.configure' },
  { id: 'build', key: 'phases.build' },
  { id: 'package', key: 'phases.package' },
];

export const ProgressStepper: React.FC<ProgressStepperProps> = ({
  currentPhase,
  phaseDetail,
}) => {
  const { t } = useTranslation();

  const getPhaseIndex = (phase: PipelinePhase): number => {
    switch (phase) {
      case 'idle':
        return -1;
      case 'clone':
        return 0;
      case 'scan':
        return 1;
      case 'patch':
        return 2;
      case 'configure':
        return 3;
      case 'build':
        return 4;
      case 'package':
        return 5;
      case 'completed':
        return 6;
      case 'failed':
        return 999;
      default:
        return -1;
    }
  };

  const activeIdx = getPhaseIndex(currentPhase);
  const isFailed = currentPhase === 'failed';
  const isCompleted = currentPhase === 'completed';

  // Calculate overall percentage
  let percentage = 0;
  if (isCompleted) {
    percentage = 100;
  } else if (activeIdx >= 0 && activeIdx < PHASES.length) {
    percentage = Math.round(((activeIdx + 0.5) / PHASES.length) * 100);
  }

  return (
    <div className="w-full my-3 flex flex-col space-y-3">
      {/* 
        Step Track: Math-centered alignment between number boxes and connecting tracks.
        By structuring the boxes and horizontal bars in a single flex items-center row,
        the line passes exactly through the vertical center (14px) of the 28px boxes.
      */}
      <div className="flex flex-col px-1">
        {/* Row 1: The Number Boxes and Centered Connecting Lines */}
        <div className="flex items-center w-full">
          {PHASES.map((phase, idx) => {
            const isDone = isCompleted || activeIdx > idx;
            const isCurrent = activeIdx === idx && !isFailed;

            return (
              <React.Fragment key={phase.id}>
                {/* Node Square Box (28px x 28px) */}
                <div
                  className={`w-7 h-7 shrink-0 flex items-center justify-center font-nordic text-xs transition-all duration-200 border ${
                    isDone
                      ? 'border-[#c5a059] bg-[#2a2012] text-[#e5c687] shadow-[0_0_10px_rgba(197,160,89,0.4)]'
                      : isCurrent
                      ? 'border-[#e0631b] bg-[#2c1508] text-[#f59e0b] shadow-[0_0_12px_rgba(224,99,27,0.5)] font-bold'
                      : 'border-[#2e3346] bg-[#0c0e14] text-[#626877]'
                  }`}
                >
                  {isDone ? (
                    <Check className="w-3.5 h-3.5 text-[#e5c687] stroke-[2.5]" />
                  ) : isCurrent ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#f59e0b]" />
                  ) : (
                    <span>{idx + 1}</span>
                  )}
                </div>

                {/* Connecting Track (Strictly Centered Vertically with the Box) */}
                {idx < PHASES.length - 1 && (
                  <div className="flex-1 mx-2 h-[2px] bg-[#1c1f2b] self-center overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        isDone
                          ? 'w-full bg-[#c5a059] shadow-[0_0_6px_rgba(197,160,89,0.5)]'
                          : isCurrent
                          ? 'w-1/2 bg-[#e0631b] shadow-[0_0_6px_rgba(224,99,27,0.5)]'
                          : 'w-0'
                      }`}
                    ></div>
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Row 2: Labels aligned under each box */}
        <div className="flex justify-between w-full mt-1.5">
          {PHASES.map((phase, idx) => {
            const isDone = isCompleted || activeIdx > idx;
            const isCurrent = activeIdx === idx && !isFailed;

            return (
              <div
                key={phase.id}
                className="w-16 -ml-4.5 first:ml-0 last:mr-0 text-center flex flex-col items-center"
              >
                <span
                  className={`font-nordic text-[10px] tracking-widest uppercase transition-colors whitespace-nowrap ${
                    isDone
                      ? 'text-[#c5a059] font-semibold'
                      : isCurrent
                      ? 'text-[#f59e0b] font-bold drop-shadow-[0_0_6px_rgba(224,99,27,0.6)]'
                      : 'text-[#626877]'
                  }`}
                >
                  {t(phase.key)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Skyrim Solid Frame Progress Bar */}
      <div className="relative w-full h-4 bg-[#0a0c12] border border-[#2e3346] p-0.5 shadow-inner overflow-hidden">
        {/* Fill bar */}
        <div
          className={`h-full transition-all duration-300 relative ${
            isFailed
              ? 'bg-[#991b1b] shadow-[0_0_12px_rgba(153,27,27,0.8)]'
              : isCompleted
              ? 'skyrim-bar-gold'
              : 'skyrim-bar-forge'
          }`}
          style={{ width: `${percentage}%` }}
        >
          {/* Subtle reflection */}
          {activeIdx >= 0 && !isCompleted && !isFailed && (
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse"></div>
          )}
        </div>
      </div>

      {/* Phase Detail & Failure Status */}
      <div className="flex items-center justify-between text-xs px-1">
        <span className="text-[#a8b0bf] font-mono truncate max-w-xl">
          {phaseDetail || (activeIdx >= 0 && t(`phases_desc.${PHASES[activeIdx]?.id}`)) || t('phases_desc.idle')}
        </span>
        <span className="font-nordic tracking-widest text-[11px] text-[#c5a059] font-bold shrink-0 ml-2">
          {isFailed ? t('phases.failed') : `${percentage}%`}
        </span>
      </div>
    </div>
  );
};

// Also export SkyrimProgressBar for backwards compatibility
export const SkyrimProgressBar = ProgressStepper;
