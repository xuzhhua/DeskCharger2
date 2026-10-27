//! 前后端事件名常量（与前端 src/lib/tauri.ts 对齐）
pub const EV_MONITOR: &str = "monitor-sample";
pub const EV_POMODORO: &str = "pomodoro-state";
pub const EV_CLIPBOARD: &str = "clipboard-updated";
pub const EV_REMINDER_FIRED: &str = "reminder-fired";
/// 设置变更（后端为唯一写入口，改完广播给前端，保证两端一致）
pub const EV_SETTINGS: &str = "settings-changed";
