import { create } from "zustand";
import { api, events } from "../lib/tauri";
import type { ClipItem, MonitorSample, PomodoroState } from "../lib/types";

// 运行时状态：番茄钟 / 系统监控 / 剪贴板历史（由后端事件驱动）
interface RuntimeState {
  pomodoro: PomodoroState | null;
  monitor: MonitorSample | null;
  monitorHistory: MonitorSample[];
  clips: ClipItem[];
  inited: boolean;
  init: () => Promise<void>;
  refreshClips: () => Promise<void>;
  pin: (id: string, pinned: boolean) => Promise<void>;
  del: (id: string) => Promise<void>;
  clearClips: () => Promise<void>;
  pomodoroStart: (phase: string) => Promise<void>;
  pomodoroPause: () => Promise<void>;
  pomodoroReset: () => Promise<void>;
}

const MAX_HISTORY = 60;

export const useRuntime = create<RuntimeState>((set, get) => ({
  pomodoro: null,
  monitor: null,
  monitorHistory: [],
  clips: [],
  inited: false,
  init: async () => {
    if (get().inited) return;
    const [pomodoro, clips] = await Promise.all([api.pomodoroGet(), api.clipGet()]);
    set({ pomodoro, clips, inited: true });

    await Promise.all([
      events.onPomodoro((s) => set({ pomodoro: s })),
      events.onClipboard((items) => set({ clips: items })),
      events.onMonitor((sample) =>
        set((st) => ({
          monitor: sample,
          monitorHistory: [...st.monitorHistory, sample].slice(-MAX_HISTORY),
        })),
      ),
    ]);
  },
  refreshClips: async () => set({ clips: await api.clipGet() }),
  pin: async (id, pinned) => {
    await api.clipPin(id, pinned);
    await get().refreshClips();
  },
  del: async (id) => {
    await api.clipDelete(id);
    await get().refreshClips();
  },
  clearClips: async () => {
    await api.clipClear();
    await get().refreshClips();
  },
  pomodoroStart: async (phase) => api.pomodoroStart(phase),
  pomodoroPause: async () => api.pomodoroPause(),
  pomodoroReset: async () => api.pomodoroReset(),
}));
