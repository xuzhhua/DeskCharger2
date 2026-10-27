// Tauri 封装：invoke 命令与事件监听的统一入口
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AppSettings,
  ClipItem,
  LauncherItem,
  MonitorSample,
  PomodoroState,
} from "./types";

/** 热键注册失败的 (热键 id, 错误原因) 列表 */
export type HotkeyConflict = [string, string];

// ---- Commands ----
export const api = {
  // 配置：save_settings 是唯一写入口（落盘 + 按需同步热键/自启 + 广播 settings-changed）
  loadSettings: () => invoke<AppSettings>("load_settings"),
  saveSettings: (s: AppSettings) =>
    invoke<HotkeyConflict[]>("save_settings", { settings: s }),
  resetSettings: () => invoke<AppSettings>("reset_settings"),

  pomodoroStart: (phase: string) => invoke<void>("pomodoro_start", { phase }),
  pomodoroPause: () => invoke<void>("pomodoro_pause"),
  pomodoroReset: () => invoke<void>("pomodoro_reset"),
  pomodoroGet: () => invoke<PomodoroState>("pomodoro_get"),

  clipGet: () => invoke<ClipItem[]>("clip_get"),
  clipCopy: (text: string) => invoke<void>("clip_copy", { text }),
  clipPin: (id: string, pinned: boolean) => invoke<void>("clip_pin", { id, pinned }),
  clipDelete: (id: string) => invoke<void>("clip_delete", { id }),
  clipClear: () => invoke<void>("clip_clear"),

  monitorGet: () => invoke<MonitorSample>("monitor_get"),

  launcherIndex: () => invoke<void>("launcher_index"),
  launcherSearch: (q: string) => invoke<LauncherItem[]>("launcher_search", { q }),
  launcherRun: (item: LauncherItem) => invoke<void>("launcher_run", { item }),

  showMain: () => invoke<void>("show_main"),
  exitApp: () => invoke<void>("exit_app"),
};

// ---- Events ----
export const events = {
  async onMonitor(listener: (s: MonitorSample) => void): Promise<UnlistenFn> {
    return listen<MonitorSample>("monitor-sample", (e) => listener(e.payload));
  },
  async onPomodoro(listener: (s: PomodoroState) => void): Promise<UnlistenFn> {
    return listen<PomodoroState>("pomodoro-state", (e) => listener(e.payload));
  },
  async onClipboard(listener: (items: ClipItem[]) => void): Promise<UnlistenFn> {
    return listen<ClipItem[]>("clipboard-updated", (e) => listener(e.payload));
  },
  async onReminderFired(
    listener: (r: { title: string; body: string }) => void,
  ): Promise<UnlistenFn> {
    return listen("reminder-fired", (e) => listener(e.payload as { title: string; body: string }));
  },
  /** 后端改了配置（托盘等）后广播，前端据此同步，避免两端状态漂移 */
  async onSettings(listener: (s: AppSettings) => void): Promise<UnlistenFn> {
    return listen<AppSettings>("settings-changed", (e) => listener(e.payload));
  },
};
