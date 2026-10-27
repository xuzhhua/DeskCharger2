//! 全局热键：注册 / 注销 / 冲突检测 / 动作分发
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

use crate::settings::{Hotkey, HotkeyAction};
use crate::Shared;
use tauri::Emitter;

pub fn parse_modifiers(mods: &[String]) -> Modifiers {
    let mut m = Modifiers::empty();
    for s in mods {
        m |= match s.as_str() {
            "ctrl" => Modifiers::CONTROL,
            "alt" => Modifiers::ALT,
            "shift" => Modifiers::SHIFT,
            "super" => Modifiers::SUPER,
            _ => Modifiers::empty(),
        };
    }
    m
}

pub fn parse_code(key: &str) -> Option<Code> {
    let k = key.trim();
    if k.len() == 1 {
        let c = k.chars().next()?;
        if c.is_ascii_alphabetic() {
            return named(&format!("Key{}", c.to_ascii_uppercase()));
        }
        if c.is_ascii_digit() {
            return named(&format!("Digit{c}"));
        }
        return match c {
            ' ' => Some(Code::Space),
            _ => None,
        };
    }
    named(k)
}

fn named(name: &str) -> Option<Code> {
    use Code::*;
    Some(match name {
        "Space" => Space,
        "Enter" => Enter,
        "Tab" => Tab,
        "Escape" => Escape,
        "Backspace" => Backspace,
        "F1" => F1,
        "F2" => F2,
        "F3" => F3,
        "F4" => F4,
        "F5" => F5,
        "F6" => F6,
        "F7" => F7,
        "F8" => F8,
        "F9" => F9,
        "F10" => F10,
        "F11" => F11,
        "F12" => F12,
        "KeyA" => KeyA,
        "KeyB" => KeyB,
        "KeyC" => KeyC,
        "KeyD" => KeyD,
        "KeyE" => KeyE,
        "KeyF" => KeyF,
        "KeyG" => KeyG,
        "KeyH" => KeyH,
        "KeyI" => KeyI,
        "KeyJ" => KeyJ,
        "KeyK" => KeyK,
        "KeyL" => KeyL,
        "KeyM" => KeyM,
        "KeyN" => KeyN,
        "KeyO" => KeyO,
        "KeyP" => KeyP,
        "KeyQ" => KeyQ,
        "KeyR" => KeyR,
        "KeyS" => KeyS,
        "KeyT" => KeyT,
        "KeyU" => KeyU,
        "KeyV" => KeyV,
        "KeyW" => KeyW,
        "KeyX" => KeyX,
        "KeyY" => KeyY,
        "KeyZ" => KeyZ,
        "Digit0" => Digit0,
        "Digit1" => Digit1,
        "Digit2" => Digit2,
        "Digit3" => Digit3,
        "Digit4" => Digit4,
        "Digit5" => Digit5,
        "Digit6" => Digit6,
        "Digit7" => Digit7,
        "Digit8" => Digit8,
        "Digit9" => Digit9,
        _ => return None,
    })
}

pub fn to_shortcut(h: &Hotkey) -> Option<Shortcut> {
    let code = parse_code(&h.key)?;
    Some(Shortcut::new(Some(parse_modifiers(&h.modifiers)), code))
}

/// 注销当前全部快捷键，再按配置重新注册。返回失败项 (id, 错误)。
pub fn refresh(app: &AppHandle, hotkeys: &[Hotkey]) -> Vec<(String, String)> {
    // 注销全部（含 JS 注册的），随后按配置注册
    let _ = app.global_shortcut().unregister_all();
    let mut failures = Vec::new();
    for h in hotkeys {
        if let Some(shortcut) = to_shortcut(h) {
            if let Err(e) = app.global_shortcut().register(shortcut) {
                failures.push((h.id.clone(), e.to_string()));
            }
        }
    }
    failures
}

/// 快捷键命中后的动作分发
pub fn dispatch(app: &AppHandle, shortcut: &Shortcut, state: ShortcutState) {
    if state != ShortcutState::Pressed {
        return;
    }
    let shared = app.state::<Shared>();
    let hotkeys = shared.settings.lock().unwrap().hotkeys.clone();
    let enabled = shared.settings.lock().unwrap().general.enabled;
    if !enabled {
        return;
    }

    let Some(h) = hotkeys.iter().find(|h| to_shortcut(h).as_ref() == Some(shortcut)) else {
        return;
    };

    match &h.action {
        HotkeyAction::Exec { command, args } => {
            let _ = crate::proc::spawn_hidden(command, args);
        }
        HotkeyAction::Url { url } => {
            let _ = opener::open(url);
        }
        HotkeyAction::Internal { target } => match target.as_str() {
            "launcher" => {
                show_main(app);
                let _ = app.emit("navigate", "launcher");
            }
            "clipboard" => {
                show_main(app);
                let _ = app.emit("navigate", "clipboard");
            }
            "pomodoro-toggle" => {
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
            _ => {}
        },
    }
}

pub fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}
