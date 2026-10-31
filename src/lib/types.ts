// 与 Rust 端 settings.rs 对齐的配置类型（serde 结构）
export type Theme = "light" | "dark" | "system";

export interface HotkeyAction {
  // exec: 执行命令; url: 打开链接; internal: 内部功能
  type: "exec" | "url" | "internal";
  command?: string;
  args?: string[];
  url?: string;
  target?: string; // internal: launcher | pomodoro-toggle | clipboard
}

export interface Hotkey {
  id: string;
  name: string;
  modifiers: string[]; // "ctrl" | "alt" | "shift" | "super"
  key: string;
  action: HotkeyAction;
}

export type ReminderSchedule =
  | { type: "once"; date: string; time: string }
  | { type: "daily"; time: string }
  | { type: "weekly"; weekdays: number[]; time: string };

export type ReminderAction =
  | { type: "notify"; title: string; body: string; sound: boolean }
  | { type: "exec"; command: string; args: string[] }
  | { type: "sysaction"; code: string } // sleep | shutdown | restart | logoff
  | { type: "url"; url: string };

export interface Reminder {
  id: string;
  name: string;
  schedule: ReminderSchedule;
  repeatTimes: number; // 0 = 单次
  repeatIntervalSec: number;
  action: ReminderAction;
  enabled: boolean;
}

export interface GeneralSettings {
  theme: Theme;
  autostart: boolean;
  lang: "zh-CN" | "en";
  enabled: boolean;
  /** 启动后不显示主窗口，直接缩到托盘 */
  startMinimized: boolean;
}

export interface PomodoroSettings {
  workMin: number;
  shortBreakMin: number;
  longBreakMin: number;
  cyclesBeforeLong: number;
  autoNext: boolean;
}

export interface ClipboardSettings {
  enabled: boolean;
  maxItems: number;
}

export interface MonitorSettings {
  enabled: boolean;
  intervalMs: number;
  trayCpu: boolean;
}

export interface LauncherAlias {
  name: string;
  command: string;
  args?: string[];
}

export interface LauncherSettings {
  extraDirs: string[];
  aliases: LauncherAlias[];
}

export interface AppSettings {
  general: GeneralSettings;
  hotkeys: Hotkey[];
  reminders: Reminder[];
  pomodoro: PomodoroSettings;
  clipboard: ClipboardSettings;
  monitor: MonitorSettings;
  launcher: LauncherSettings;
  version: number;
}

export interface PomodoroState {
  running: boolean;
  phase: "idle" | "work" | "shortBreak" | "longBreak";
  remainingSec: number;
  cycle: number;
}

export interface MonitorSample {
  cpu: number;
  memUsedMb: number;
  memTotalMb: number;
  netUpKbs: number;
  netDownKbs: number;
  timestamp: number;
}

export interface ClipItem {
  id: string;
  text: string;
  pinned: boolean;
  at: number;
}

export interface LauncherItem {
  name: string;
  path: string;
  kind: "app" | "file" | "alias" | "url";
}
