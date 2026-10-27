//! 定时提醒引擎：后台线程周期扫描并触发动作
use chrono::{Datelike, Local};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

use crate::events::EV_REMINDER_FIRED;
use crate::settings::{ReminderAction, ReminderSchedule};
use crate::Shared;
use tauri_plugin_notification::NotificationExt;

/// 每条提醒的触发状态
#[derive(Default, Clone)]
pub struct Fire {
    pub last_day: String, // YYYY-MM-DD，用于每日重置
    pub count: u32,
    pub last_at: i64, // epoch 秒
}

pub type FireMap = Arc<Mutex<HashMap<String, Fire>>>;

fn now_day() -> String {
    let n = Local::now();
    format!("{:04}-{:02}-{:02}", n.year(), n.month(), n.day())
}

fn now_time() -> String {
    Local::now().format("%H:%M").to_string()
}

fn now_weekday() -> u32 {
    Local::now().weekday().num_days_from_monday() + 1 // 1..7 = 周一..周日
}

pub fn tick(shared: &Shared, app: &AppHandle) {
    let reminders = shared.settings.lock().unwrap().reminders.clone();
    if reminders.is_empty() {
        return;
    }
    let day = now_day();
    let time = now_time();
    let wd = now_weekday();
    let now_ts = Local::now().timestamp();

    let mut fires = shared.fires.lock().unwrap();

    for r in &reminders {
        if !r.enabled {
            continue;
        }
        // 每日重置
        let f = fires.entry(r.id.clone()).or_default();
        if f.last_day != day {
            f.last_day = day.clone();
            f.count = 0;
            f.last_at = 0;
        }

        let today_matches = match &r.schedule {
            ReminderSchedule::Once { date, time: t } => date == &day && t == &time,
            ReminderSchedule::Daily { time: t } => t == &time,
            ReminderSchedule::Weekly { weekdays, time: t } => {
                t == &time && weekdays.contains(&wd)
            }
        };

        let fire_now = if r.repeat_times == 0 {
            today_matches && f.count == 0
        } else if f.count == 0 {
            today_matches
        } else {
            // 首次触发后的重复：按间隔
            f.count < r.repeat_times && (now_ts - f.last_at) >= i64::from(r.repeat_interval_sec)
        };

        if !fire_now {
            continue;
        }

        execute(app, &r.action);
        f.count += 1;
        f.last_at = now_ts;
    }
}

fn execute(app: &AppHandle, action: &ReminderAction) {
    match action {
        ReminderAction::Notify { title, body, sound } => {
            let _ = app
                .notification()
                .builder()
                .title(title)
                .body(body)
                .show();
            let _ = app.emit(EV_REMINDER_FIRED, serde_json::json!({ "title": title, "body": body }));
            if *sound {
                // 系统提示音（不经过 shell，不会闪黑窗）
                crate::proc::beep();
            }
        }
        ReminderAction::Exec { command, args } => {
            let _ = crate::proc::spawn_hidden(command, args);
        }
        ReminderAction::Sysaction { code } => {
            if let Some(a) = crate::sysaction::SysAction::from_code(code) {
                let _ = a.exec();
            }
        }
        ReminderAction::Url { url } => {
            let _ = opener::open(url);
        }
    }
}
