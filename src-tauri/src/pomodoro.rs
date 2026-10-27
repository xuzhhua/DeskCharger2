//! 番茄钟状态机
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::AppHandle;

use crate::events::EV_POMODORO;
use crate::settings::AppSettings;
use crate::Shared;
use tauri::Emitter;

pub const PHASE_IDLE: &str = "idle";
pub const PHASE_WORK: &str = "work";
pub const PHASE_SHORT: &str = "shortBreak";
pub const PHASE_LONG: &str = "longBreak";

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PomodoroState {
    pub running: bool,
    pub phase: String,
    pub remaining_sec: u64,
    pub cycle: u32,
}

impl Default for PomodoroState {
    fn default() -> Self {
        Self {
            running: false,
            phase: PHASE_IDLE.into(),
            remaining_sec: 0,
            cycle: 0,
        }
    }
}

#[derive(Clone)]
pub struct Pomodoro {
    pub state: Arc<Mutex<PomodoroState>>,
    pub deadline: Arc<Mutex<Option<Instant>>>,
}

impl Default for Pomodoro {
    fn default() -> Self {
        Self {
            state: Arc::new(Mutex::new(PomodoroState::default())),
            deadline: Arc::new(Mutex::new(None)),
        }
    }
}

pub fn start(shared: &Shared, phase: &str) {
    // 先读设置，再锁状态，避免与 tick() 产生锁顺序倒置
    let secs = {
        let settings = shared.settings.lock().unwrap();
        phase_secs(&settings, phase)
    };
    let mut st = shared.pomodoro.state.lock().unwrap();
    st.phase = phase.to_string();
    st.running = true;
    st.remaining_sec = secs;
    *shared.pomodoro.deadline.lock().unwrap() = Some(Instant::now() + Duration::from_secs(secs));
}

pub fn pause(shared: &Shared) {
    let mut st = shared.pomodoro.state.lock().unwrap();
    if st.running {
        st.running = false;
        if let Some(d) = shared.pomodoro.deadline.lock().unwrap().take() {
            st.remaining_sec = d.saturating_duration_since(Instant::now()).as_secs();
        }
    }
}

pub fn reset(shared: &Shared) {
    let mut st = shared.pomodoro.state.lock().unwrap();
    st.running = false;
    st.phase = PHASE_IDLE.into();
    st.remaining_sec = 0;
    st.cycle = 0;
    *shared.pomodoro.deadline.lock().unwrap() = None;
}

fn phase_secs(settings: &AppSettings, phase: &str) -> u64 {
    match phase {
        PHASE_WORK => (settings.pomodoro.work_min * 60).into(),
        PHASE_SHORT => (settings.pomodoro.short_break_min * 60).into(),
        PHASE_LONG => (settings.pomodoro.long_break_min * 60).into(),
        _ => 0,
    }
}

pub fn emit(state: &PomodoroState, app: &AppHandle) {
    let _ = app.emit(EV_POMODORO, state);
}

/// 每秒推进。到点后切换阶段（尊重 auto_next）。
pub fn tick(shared: &Shared, app: &AppHandle) {
    let (phase, running, _remaining) = {
        let st = shared.pomodoro.state.lock().unwrap();
        (st.phase.clone(), st.running, st.remaining_sec)
    };
    if !running {
        return;
    }
    let deadline = *shared.pomodoro.deadline.lock().unwrap();
    let Some(d) = deadline else { return };

    let left = d.saturating_duration_since(Instant::now()).as_secs();

    // 更新剩余秒
    {
        let mut st = shared.pomodoro.state.lock().unwrap();
        st.remaining_sec = left;
    }

    if left > 0 {
        // 定期推送状态（前端用于显示）
        let st = shared.pomodoro.state.lock().unwrap().clone();
        emit(&st, app);
        return;
    }

    // 到点：推进到下一阶段
    let settings = shared.settings.lock().unwrap();
    let auto_next = settings.pomodoro.auto_next;
    let next_phase = match phase.as_str() {
        PHASE_WORK => {
            // 工作结束 → 休息
            let cycle = shared.pomodoro.state.lock().unwrap().cycle;
            if cycle >= settings.pomodoro.cycles_before_long && settings.pomodoro.cycles_before_long > 0 {
                PHASE_LONG.to_string()
            } else {
                PHASE_SHORT.to_string()
            }
        }
        PHASE_SHORT | PHASE_LONG => {
            // 休息结束 → 工作
            let mut st = shared.pomodoro.state.lock().unwrap();
            if phase == PHASE_LONG {
                st.cycle = 0;
            } else {
                st.cycle += 1;
            }
            PHASE_WORK.to_string()
        }
        _ => PHASE_WORK.to_string(),
    };
    drop(settings);

    if !auto_next {
        // 不自动续接：停在 idle
        let mut st = shared.pomodoro.state.lock().unwrap();
        st.running = false;
        st.phase = PHASE_IDLE.into();
        st.remaining_sec = 0;
        *shared.pomodoro.deadline.lock().unwrap() = None;
        let snap = st.clone();
        emit(&snap, app);
        return;
    }

    // 自动续接下一段
    let settings = shared.settings.lock().unwrap();
    let secs = phase_secs(&settings, &next_phase);
    {
        let mut st = shared.pomodoro.state.lock().unwrap();
        st.phase = next_phase;
        st.running = true;
        st.remaining_sec = secs;
        *shared.pomodoro.deadline.lock().unwrap() = Some(Instant::now() + Duration::from_secs(secs));
        let snap = st.clone();
        emit(&snap, app);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::AppSettings;
    use crate::Shared;
    use std::collections::HashMap;

    fn shared() -> Shared {
        Shared {
            settings: Arc::new(Mutex::new(AppSettings::default())),
            pomodoro: Pomodoro::default(),
            fires: Arc::new(Mutex::new(HashMap::new())),
            clips: Arc::new(Mutex::new(Vec::new())),
            last_monitor: Arc::new(Mutex::new(None)),
            launcher_index: Arc::new(Mutex::new(Vec::new())),
        }
    }

    #[test]
    fn phase_seconds_match_settings() {
        let s = AppSettings::default();
        assert_eq!(phase_secs(&s, PHASE_WORK), 25 * 60);
        assert_eq!(phase_secs(&s, PHASE_SHORT), 5 * 60);
        assert_eq!(phase_secs(&s, PHASE_LONG), 15 * 60);
    }

    #[test]
    fn start_sets_running_and_remaining() {
        let sh = shared();
        start(&sh, PHASE_WORK);
        let st = sh.pomodoro.state.lock().unwrap();
        assert!(st.running);
        assert_eq!(st.phase, PHASE_WORK);
        assert!(st.remaining_sec > 0 && st.remaining_sec <= 25 * 60);
    }

    #[test]
    fn pause_freezes_remaining() {
        let sh = shared();
        start(&sh, PHASE_WORK);
        let before = sh.pomodoro.state.lock().unwrap().remaining_sec;
        pause(&sh);
        let st = sh.pomodoro.state.lock().unwrap();
        assert!(!st.running);
        assert!(st.remaining_sec <= before);
    }

    #[test]
    fn reset_clears_state() {
        let sh = shared();
        start(&sh, PHASE_WORK);
        reset(&sh);
        let st = sh.pomodoro.state.lock().unwrap();
        assert!(!st.running);
        assert_eq!(st.phase, PHASE_IDLE);
        assert_eq!(st.remaining_sec, 0);
    }
}
