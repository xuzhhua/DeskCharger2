//! 类型化配置：加载 / 保存 / 重置 / 默认值
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

// ---------- 通用 ----------
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GeneralSettings {
    pub theme: String,     // light | dark | system
    pub autostart: bool,
    pub lang: String,      // zh-CN | en
    pub enabled: bool,     // 全局功能开关
}

// ---------- 热键 ----------
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum HotkeyAction {
    Exec {
        command: String,
        #[serde(default)]
        args: Vec<String>,
    },
    Url { url: String },
    Internal { target: String },
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Hotkey {
    pub id: String,
    pub name: String,
    pub modifiers: Vec<String>, // ctrl | alt | shift | super
    pub key: String,            // 单键，如 K / F1 / Digit1
    pub action: HotkeyAction,
}

// ---------- 定时提醒 ----------
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum ReminderSchedule {
    Once { date: String, time: String },   // date=YYYY-MM-DD, time=HH:MM
    Daily { time: String },
    Weekly { weekdays: Vec<u32>, time: String }, // 1..7 = 周一..周日
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum ReminderAction {
    Notify { title: String, body: String, sound: bool },
    Exec {
        command: String,
        #[serde(default)]
        args: Vec<String>,
    },
    Sysaction { code: String }, // sleep | shutdown | restart | logoff
    Url { url: String },
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Reminder {
    pub id: String,
    pub name: String,
    pub schedule: ReminderSchedule,
    #[serde(rename = "repeatTimes")]
    pub repeat_times: u32,             // 0 = 单次
    #[serde(rename = "repeatIntervalSec")]
    pub repeat_interval_sec: u32,
    pub action: ReminderAction,
    pub enabled: bool,
}

// ---------- 番茄钟 ----------
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PomodoroSettings {
    pub work_min: u32,
    pub short_break_min: u32,
    pub long_break_min: u32,
    pub cycles_before_long: u32,
    pub auto_next: bool,
}

// ---------- 剪贴板 ----------
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardSettings {
    pub enabled: bool,
    pub max_items: usize,
}

// ---------- 系统监控 ----------
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MonitorSettings {
    pub enabled: bool,
    pub interval_ms: u64,
    pub tray_cpu: bool,
}

// ---------- 快速启动 ----------
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LauncherAlias {
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LauncherSettings {
    pub extra_dirs: Vec<String>,
    pub aliases: Vec<LauncherAlias>,
}

// ---------- 顶层 ----------
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub general: GeneralSettings,
    pub hotkeys: Vec<Hotkey>,
    pub reminders: Vec<Reminder>,
    pub pomodoro: PomodoroSettings,
    pub clipboard: ClipboardSettings,
    pub monitor: MonitorSettings,
    pub launcher: LauncherSettings,
    pub version: u32,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            general: GeneralSettings {
                theme: "system".into(),
                autostart: false,
                lang: "zh-CN".into(),
                enabled: true,
            },
            hotkeys: vec![
                Hotkey {
                    id: "hk-notepad".into(),
                    name: "打开记事本".into(),
                    modifiers: vec!["ctrl".into(), "alt".into()],
                    key: "N".into(),
                    action: HotkeyAction::Exec { command: "notepad.exe".into(), args: vec![] },
                },
                Hotkey {
                    id: "hk-launcher".into(),
                    name: "快速启动面板".into(),
                    modifiers: vec!["ctrl".into(), "alt".into()],
                    key: "K".into(),
                    action: HotkeyAction::Internal { target: "launcher".into() },
                },
            ],
            reminders: vec![],
            pomodoro: PomodoroSettings {
                work_min: 25,
                short_break_min: 5,
                long_break_min: 15,
                cycles_before_long: 4,
                auto_next: false,
            },
            clipboard: ClipboardSettings { enabled: true, max_items: 100 },
            monitor: MonitorSettings { enabled: true, interval_ms: 1000, tray_cpu: true },
            launcher: LauncherSettings {
                extra_dirs: vec![],
                aliases: vec![
                    LauncherAlias { name: "shutdown".into(), command: "shutdown".into(), args: vec!["/s".into()] },
                    LauncherAlias { name: "restart".into(), command: "shutdown".into(), args: vec!["/r".into()] },
                ],
            },
            version: 1,
        }
    }
}

// ---------- 持久化 ----------
pub fn settings_path(app: &AppHandle) -> PathBuf {
    let dir = app.path().app_data_dir().expect("app data dir");
    dir.join("settings.json")
}

pub fn load(app: &AppHandle) -> AppSettings {
    let path = settings_path(app);
    match fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str(&text).unwrap_or_default(),
        Err(_) => AppSettings::default(),
    }
}

pub fn save(app: &AppHandle, settings: &AppSettings) -> std::io::Result<()> {
    let path = settings_path(app);
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let text = serde_json::to_string_pretty(settings).expect("serialize settings");
    fs::write(path, text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_settings_serde_roundtrip() {
        let s = AppSettings::default();
        let json = serde_json::to_string(&s).unwrap();
        let back: AppSettings = serde_json::from_str(&json).unwrap();
        assert_eq!(s, back);
    }

    #[test]
    fn serde_uses_camel_case_and_tagged_enums() {
        let r = Reminder {
            id: "r1".into(),
            name: "提醒".into(),
            schedule: ReminderSchedule::Daily { time: "09:00".into() },
            repeat_times: 2,
            repeat_interval_sec: 60,
            action: ReminderAction::Notify {
                title: "标题".into(),
                body: "正文".into(),
                sound: true,
            },
            enabled: true,
        };
        let v = serde_json::to_value(r).unwrap();
        assert_eq!(v["schedule"]["type"], "daily");
        assert_eq!(v["action"]["type"], "notify");
        assert_eq!(v["repeatTimes"], 2);
        assert_eq!(v["repeatIntervalSec"], 60);
    }

    #[test]
    fn unknown_fields_are_ignored() {
        let json = r#"{
            "general":{"theme":"dark","autostart":false,"lang":"zh-CN","enabled":true,"extra":1},
            "hotkeys":[],"reminders":[],"pomodoro":{"workMin":25,"shortBreakMin":5,"longBreakMin":15,"cyclesBeforeLong":4,"autoNext":false},
            "clipboard":{"enabled":true,"maxItems":100},"monitor":{"enabled":true,"intervalMs":1000,"trayCpu":true},
            "launcher":{"extraDirs":[],"aliases":[]},"version":1
        }"#;
        let s: AppSettings = serde_json::from_str(json).unwrap();
        assert_eq!(s.general.theme, "dark");
        assert_eq!(s.version, 1);
    }
}
