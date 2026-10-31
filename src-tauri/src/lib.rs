//! DeskCharger 2 应用入口与命令注册
mod clipboard;
mod events;
mod hotkey;
mod launcher;
mod monitor;
mod pomodoro;
mod proc;
mod reminder;
mod settings;
mod sysaction;
mod tray;

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;

use clipboard::ClipItem;
use launcher::LauncherItem;
use monitor::MonitorSample;
use pomodoro::Pomodoro;
use settings::AppSettings;

/// 应用共享状态（可在命令与后台线程间共享）
#[derive(Clone)]
pub struct Shared {
    pub settings: Arc<Mutex<AppSettings>>,
    pub pomodoro: Pomodoro,
    pub fires: reminder::FireMap,
    pub clips: Arc<Mutex<Vec<ClipItem>>>,
    pub last_monitor: Arc<Mutex<Option<MonitorSample>>>,
    pub launcher_index: launcher::Index,
}

// ---------------- 配置命令 ----------------
#[tauri::command]
fn load_settings(state: State<Shared>) -> AppSettings {
    state.settings.lock().unwrap().clone()
}

#[tauri::command]
fn save_settings(
    state: State<Shared>,
    app: AppHandle,
    settings: AppSettings,
) -> Vec<(String, String)> {
    // 唯一写入口：落盘 + 按需同步热键/自启 + 广播给前端
    let prev = state.settings.lock().unwrap().clone();
    let hotkeys_changed =
        prev.hotkeys != settings.hotkeys || prev.general.enabled != settings.general.enabled;
    let autostart_changed = prev.general.autostart != settings.general.autostart;

    *state.settings.lock().unwrap() = settings.clone();
    let _ = settings::save(&app, &settings);

    // 只有真的变了才重建热键注册（unregister_all -> register 期间热键会短暂失效）
    let conflicts = if hotkeys_changed {
        sync_hotkeys(&app, &settings)
    } else {
        Vec::new()
    };
    if autostart_changed {
        sync_autostart(&app, &settings);
    }
    let _ = app.emit(events::EV_SETTINGS, settings);
    conflicts
}

#[tauri::command]
fn reset_settings(state: State<Shared>, app: AppHandle) -> AppSettings {
    let s = AppSettings::default();
    *state.settings.lock().unwrap() = s.clone();
    let _ = settings::save(&app, &s);
    sync_hotkeys(&app, &s);
    sync_autostart(&app, &s);
    let _ = app.emit(events::EV_SETTINGS, s.clone());
    s
}

// ---------------- 番茄钟命令 ----------------
#[tauri::command]
fn pomodoro_start(state: State<Shared>, phase: String) {
    pomodoro::start(&state, &phase);
}
#[tauri::command]
fn pomodoro_pause(state: State<Shared>) {
    pomodoro::pause(&state);
}
#[tauri::command]
fn pomodoro_reset(state: State<Shared>) {
    pomodoro::reset(&state);
}
#[tauri::command]
fn pomodoro_get(state: State<Shared>) -> pomodoro::PomodoroState {
    state.pomodoro.state.lock().unwrap().clone()
}

// ---------------- 剪贴板命令 ----------------
#[tauri::command]
fn clip_get(state: State<Shared>) -> Vec<ClipItem> {
    state.clips.lock().unwrap().clone()
}
#[tauri::command]
fn clip_pin(state: State<Shared>, app: AppHandle, id: String, pinned: bool) {
    clipboard::pin(&state, &id, pinned);
    let _ = app.emit(events::EV_CLIPBOARD, state.clips.lock().unwrap().clone());
}
#[tauri::command]
fn clip_delete(state: State<Shared>, app: AppHandle, id: String) {
    clipboard::delete(&state, &id);
    let _ = app.emit(events::EV_CLIPBOARD, state.clips.lock().unwrap().clone());
}
#[tauri::command]
fn clip_clear(state: State<Shared>, app: AppHandle) {
    clipboard::clear(&state);
    let _ = app.emit(events::EV_CLIPBOARD, state.clips.lock().unwrap().clone());
}
#[tauri::command]
fn clip_copy(text: String) -> Result<(), String> {
    clipboard::copy_text(&text)
}

// ---------------- 系统监控命令 ----------------
#[tauri::command]
fn monitor_get(state: State<Shared>) -> Option<MonitorSample> {
    state.last_monitor.lock().unwrap().clone()
}

// ---------------- 快速启动命令 ----------------
#[tauri::command]
fn launcher_index(state: State<Shared>) {
    launcher::index(&state);
}
#[tauri::command]
fn launcher_search(state: State<Shared>, q: String) -> Vec<LauncherItem> {
    launcher::search(&state, &q)
}
#[tauri::command]
fn launcher_run(item: LauncherItem) -> Result<(), String> {
    launcher::run(&item)
}

// ---------------- 全局命令 ----------------
#[tauri::command]
fn show_main(app: AppHandle) {
    hotkey::show_main(&app);
}
#[tauri::command]
fn exit_app(app: AppHandle) {
    app.exit(0);
}
// ---------------- 同步辅助 ----------------
fn sync_hotkeys(app: &AppHandle, settings: &AppSettings) -> Vec<(String, String)> {
    if settings.general.enabled {
        hotkey::refresh(app, &settings.hotkeys)
    } else {
        hotkey::refresh(app, &[])
    }
}

fn sync_autostart(app: &AppHandle, settings: &AppSettings) {
    use tauri_plugin_autostart::ManagerExt;
    let r = if settings.general.autostart {
        app.autolaunch().enable()
    } else {
        app.autolaunch().disable()
    };
    if let Err(e) = r {
        eprintln!("autostart sync failed: {e}");
    }
}

// ---------------- 应用构建 ----------------
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            hotkey::show_main(app);
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    hotkey::dispatch(app, shortcut, event.state);
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            load_settings,
            save_settings,
            reset_settings,
            pomodoro_start,
            pomodoro_pause,
            pomodoro_reset,
            pomodoro_get,
            clip_get,
            clip_pin,
            clip_delete,
            clip_clear,
            clip_copy,
            monitor_get,
            launcher_index,
            launcher_search,
            launcher_run,
            show_main,
            exit_app,
        ])
        .on_window_event(|window, event| {
            // 关闭主窗口时仅隐藏到托盘
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .setup(|app| {
            let handle = app.handle();
            let settings = settings::load(handle);

            let shared = Shared {
                settings: Arc::new(Mutex::new(settings.clone())),
                pomodoro: Pomodoro::default(),
                fires: Arc::new(Mutex::new(HashMap::new())),
                clips: Arc::new(Mutex::new(Vec::new())),
                last_monitor: Arc::new(Mutex::new(None)),
                launcher_index: Arc::new(Mutex::new(Vec::new())),
            };
            app.manage(shared.clone());

            // 初始热键注册
            if settings.general.enabled {
                let _ = hotkey::refresh(handle, &settings.hotkeys);
            }
            // 构建托盘
            let _ = tray::build(handle);
            // 建立快速启动索引
            launcher::index(&shared);

            // 后台线程：定时提醒（5s）
            {
                let s = shared.clone();
                let a = handle.clone();
                std::thread::spawn(move || loop {
                    std::thread::sleep(Duration::from_secs(5));
                    reminder::tick(&s, &a);
                });
            }
            // 后台线程：番茄钟（1s）
            {
                let s = shared.clone();
                let a = handle.clone();
                std::thread::spawn(move || loop {
                    std::thread::sleep(Duration::from_secs(1));
                    pomodoro::tick(&s, &a);
                });
            }
            // 后台线程：剪贴板轮询、系统监控
            clipboard::watch(shared.clone(), handle.clone());
            monitor::watch(shared.clone(), handle.clone());

            // 首次启动：勾选“启动后自动缩小到托盘”时保持隐藏，仅托盘常驻
            if !settings.general.start_minimized {
                hotkey::show_main(handle);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running DeskCharger 2");
}
