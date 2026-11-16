import { create } from 'zustand';

export type Locale = 'en' | 'fr';

interface RunState {
  locale: Locale;
  elapsedSeconds: number;
  activeGate: string;
  mobileNavOpen: boolean;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  setElapsedSeconds: (seconds: number) => void;
  setActiveGate: (gate: string) => void;
  setMobileNavOpen: (open: boolean) => void;
}

export const useRunStore = create<RunState>((set) => ({
  locale: 'en',
  elapsedSeconds: 0,
  activeGate: '00',
  mobileNavOpen: false,
  setLocale: (locale) => set({ locale }),
  toggleLocale: () =>
    set((state) => ({ locale: state.locale === 'en' ? 'fr' : 'en' })),
  setElapsedSeconds: (elapsedSeconds) => set({ elapsedSeconds }),
  setActiveGate: (activeGate) => set({ activeGate }),
  setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
}));

export function formatRunClock(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const mins = Math.floor(clamped / 60);
  const secs = Math.floor(clamped % 60);
  const hundredths = Math.floor((clamped * 100) % 100);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}
