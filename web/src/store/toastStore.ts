import { create } from 'zustand';

/** 목업 toast() — 하단 중앙에 1.9초간 노출. */
interface ToastState {
  msg: string;
  seq: number;
  show: (m: string) => void;
  clear: () => void;
}

export const useToastStore = create<ToastState>((set, get) => ({
  msg: '',
  seq: 0,
  show: (m) => set({ msg: m, seq: get().seq + 1 }),
  clear: () => set({ msg: '' }),
}));

export const toast = (m: string) => useToastStore.getState().show(m);
