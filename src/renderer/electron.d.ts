import { ElectronAPI } from '../shared/types';

export * from '../shared/types';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
