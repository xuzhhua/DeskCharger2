import { create } from "zustand";
import { api } from "../lib/tauri";
import type { HotkeyConflict } from "../lib/tauri";
import type { AppSettings, Theme } from "../lib/types";
import { applyTheme, useTheme } from "../lib/hooks";

export const defaultSettings = (): AppSettings => ({
  general: { theme: "system", autostart: false, lang: "zh-CN", enabled: true },
  hotkeys: [
    {
      id: "hk-notepad",
      name: "打开记事本",
      modifiers: ["ctrl", "alt"],
      key: "N",
      action: { type: "exec", command: "notepad.exe" },
    },
    {
      id: "hk-launcher",
      name: "快速启动面板",
      modifiers: ["ctrl", "alt"],
      key: "K",
      action: { type: "internal", target: "launcher" },
    },
  ],
  reminders: [],
  pomodoro: { workMin: 25, shortBreakMin: 5, longBreakMin: 15, cyclesBeforeLong: 4, autoNext: false },
  clipboard: { enabled: true, maxItems: 100 },
  monitor: { enabled: true, intervalMs: 1000, trayCpu: true },
  launcher: {
    extraDirs: [],
    aliases: [
      { name: "shutdown", command: "shutdown", args: ["/s"] },
      { name: "restart", command: "shutdown", args: ["/r"] },
    ],
  },
  version: 1,
});

interface SettingsState {
  settings: AppSettings;
  loaded: boolean;
  dirty: boolean;
  load: () => Promise<void>;
  update: (fn: (s: AppSettings) => void) => void;
  /** 保存并返回热键注册冲突（后端为唯一写入口，其余命令不再各自落盘） */
  save: () => Promise<HotkeyConflict[]>;
  reset: () => Promise<void>;
  /** 后端改动配置后同步到前端（托盘菜单等场景） */
  applyFromBackend: (settings: AppSettings) => void;
  setTheme: (t: Theme) => void;
  setLang: (l: "zh-CN" | "en") => void;
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: defaultSettings(),
  loaded: false,
  dirty: false,
  load: async () => {
    const settings = await api.loadSettings();
    set({ settings, loaded: true, dirty: false });
  },
  update: (fn) => {
    const s = structuredClone(get().settings);
    fn(s);
    set({ settings: s, dirty: true });
  },
  save: async () => {
    // 直接读 store 里的最新值，不要用调用方渲染期的快照
    const conflicts = await api.saveSettings(get().settings);
    set({ dirty: false });
    return conflicts ?? [];
  },
  reset: async () => {
    const settings = await api.resetSettings();
    set({ settings, dirty: false });
  },
  applyFromBackend: (settings) => {
    set({ settings, dirty: false });
  },
  setTheme: (t) => {
    get().update((s) => {
      s.general.theme = t;
    });
    // 直接作用到 DOM：不能在渲染外用 Hook
    applyTheme(t);
  },
  setLang: (l) => {
    get().update((s) => {
      s.general.lang = l;
    });
  },
}));

// 用于在组件中应用主题（组件加载时同步一次）
export function useApplyTheme() {
  const theme = useSettings((s) => s.settings.general.theme);
  useTheme(theme);
  return theme;
}
