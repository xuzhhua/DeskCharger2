//! 剪贴板历史：轮询记录文本，支持固定 / 删除 / 清空 / 回写
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

use crate::events::EV_CLIPBOARD;
use crate::Shared;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClipItem {
    pub id: String,
    pub text: String,
    pub pinned: bool,
    pub at: u64,
}

/// 轮询剪贴板文本变化（后台线程）
pub fn watch(shared: Shared, app: AppHandle) {
    std::thread::spawn(move || {
        let mut cb = match arboard::Clipboard::new() {
            Ok(c) => c,
            Err(_) => return,
        };
        let mut last_seen: Option<String> = None;
        loop {
            std::thread::sleep(Duration::from_millis(500));
            let enabled = shared.settings.lock().unwrap().clipboard.enabled;
            if !enabled {
                continue;
            }
            let Ok(text) = cb.get_text() else { continue };
            let text = text.trim().to_string();
            if text.is_empty() {
                continue;
            }
            if last_seen.as_deref() == Some(text.as_str()) {
                continue;
            }
            last_seen = Some(text.clone());

            let mut items = shared.clips.lock().unwrap();
            // 去重：已存在则移到最前
            if let Some(pos) = items.iter().position(|c| c.text == text) {
                let it = items.remove(pos);
                items.insert(0, it);
            } else {
                let max = shared.settings.lock().unwrap().clipboard.max_items.max(1);
                items.insert(
                    0,
                    ClipItem {
                        id: Uuid::new_v4().to_string(),
                        text,
                        pinned: false,
                        at: chrono::Local::now().timestamp_millis() as u64,
                    },
                );
                items.truncate(max);
            }
            let snapshot = items.clone();
            drop(items);
            let _ = app.emit(EV_CLIPBOARD, snapshot);
        }
    });
}

/// 把文本写入剪贴板（用户点击历史项回填）
pub fn copy_text(text: &str) -> Result<(), String> {
    let mut cb = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    cb.set_text(text).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn pin(shared: &Shared, id: &str, pinned: bool) {
    let mut items = shared.clips.lock().unwrap();
    if let Some(it) = items.iter_mut().find(|c| c.id == id) {
        it.pinned = pinned;
    }
}

pub fn delete(shared: &Shared, id: &str) {
    shared.clips.lock().unwrap().retain(|c| c.id != id);
}

pub fn clear(shared: &Shared) {
    shared.clips.lock().unwrap().clear();
}
