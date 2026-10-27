//! 快速启动：索引开始菜单 / 附加目录 / 命令别名，提供搜索与执行
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::sync::Mutex;

use crate::Shared;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LauncherItem {
    pub name: String,
    pub path: String,
    pub kind: String, // app | file | alias | url
}

pub type Index = Arc<Mutex<Vec<LauncherItem>>>;

fn walk_lnks(dir: &str, out: &mut Vec<LauncherItem>) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for e in entries.flatten() {
            let p = e.path();
            if p.is_file() && p.extension().map(|x| x.eq_ignore_ascii_case("lnk")).unwrap_or(false) {
                if let Some(name) = p.file_stem().and_then(|s| s.to_str()) {
                    out.push(LauncherItem {
                        name: name.to_string(),
                        path: p.to_string_lossy().to_string(),
                        kind: "app".into(),
                    });
                }
            }
        }
    }
}

fn walk_files(dir: &str, out: &mut Vec<LauncherItem>) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for e in entries.flatten() {
            let p = e.path();
            if p.is_file() {
                if let Some(name) = p.file_stem().and_then(|s| s.to_str()) {
                    out.push(LauncherItem {
                        name: name.to_string(),
                        path: p.to_string_lossy().to_string(),
                        kind: "file".into(),
                    });
                }
            }
        }
    }
}

/// 重建索引（命令调用）
pub fn index(shared: &Shared) {
    let mut out: Vec<LauncherItem> = Vec::new();

    // 开始菜单（系统 + 用户）
    let mut start_dirs = vec![
        std::env::var("ProgramData").unwrap_or_default(),
        std::env::var("APPDATA").unwrap_or_default(),
    ];
    start_dirs.retain(|d| !d.is_empty());
    for d in &start_dirs {
        walk_lnks(&format!(r"{d}\Microsoft\Windows\Start Menu\Programs"), &mut out);
    }

    // 附加目录
    let extra = shared.settings.lock().unwrap().launcher.extra_dirs.clone();
    for d in extra {
        walk_files(&d, &mut out);
    }

    // 命令别名
    let aliases = shared.settings.lock().unwrap().launcher.aliases.clone();
    for a in aliases {
        out.push(LauncherItem {
            name: a.name,
            path: a.command,
            kind: "alias".into(),
        });
    }

    *shared.launcher_index.lock().unwrap() = out;
}

/// 简单子串模糊匹配
pub fn search(shared: &Shared, q: &str) -> Vec<LauncherItem> {
    let idx = shared.launcher_index.lock().unwrap();
    let q = q.trim().to_lowercase();
    if q.is_empty() {
        return idx.iter().take(20).cloned().collect();
    }
    idx.iter()
        .filter(|it| it.name.to_lowercase().contains(&q))
        .take(30)
        .cloned()
        .collect()
}

/// 执行选中的项目
pub fn run(item: &LauncherItem) -> Result<(), String> {
    match item.kind.as_str() {
        "alias" => crate::proc::spawn_hidden(&item.path, &[])
            .map(|_| ())
            .map_err(|e| e.to_string()),
        _ => {
            // app / file / url：用系统默认方式打开（处理 .lnk / .exe / URL）
            opener::open(&item.path).map_err(|e| e.to_string())
        }
    }
}
