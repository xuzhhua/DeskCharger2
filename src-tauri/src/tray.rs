//! 系统托盘：菜单与交互
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let shared = app.state::<crate::Shared>();
    let enabled = shared.settings.lock().unwrap().general.enabled;

    let show = MenuItem::with_id(app, "show", "打开主界面", true, None::<&str>)?;
    let pomodoro = MenuItem::with_id(app, "pomodoro", "番茄钟 开始/暂停", true, None::<&str>)?;
    let toggle_enabled = CheckMenuItem::with_id(
        app,
        "toggle-enabled",
        "启用全部功能",
        true,
        enabled,
        None::<&str>,
    )?;
    let exit = MenuItem::with_id(app, "exit", "退出", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;

    let menu = Menu::with_items(
        app,
        &[&show, &sep, &pomodoro, &sep, &toggle_enabled, &sep, &exit],
    )?;

    let icon = app.default_window_icon().cloned();

    let mut builder = TrayIconBuilder::with_id("main")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => crate::hotkey::show_main(app),
            "pomodoro" => {
                let shared = app.state::<crate::Shared>();
                let running = shared.pomodoro.state.lock().unwrap().running;
                if running {
                    crate::pomodoro::pause(&shared);
                } else {
                    let phase = shared.pomodoro.state.lock().unwrap().phase.clone();
                    crate::pomodoro::start(&shared, &phase);
                }
                let snap = shared.pomodoro.state.lock().unwrap().clone();
                crate::pomodoro::emit(&snap, app);
            }
            "toggle-enabled" => {
                let shared = app.state::<crate::Shared>();
                let updated = {
                    let mut s = shared.settings.lock().unwrap();
                    s.general.enabled = !s.general.enabled;
                    s.clone()
                };
                let _ = crate::settings::save(app, &updated);
                // 广播给前端，避免 GUI 一直显示旧值
                let _ = app.emit(crate::events::EV_SETTINGS, updated);
            }
            "exit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                crate::hotkey::show_main(tray.app_handle());
            }
        });

    if let Some(icon) = icon {
        builder = builder.icon(icon);
    }

    builder.build(app)?;
    Ok(())
}
