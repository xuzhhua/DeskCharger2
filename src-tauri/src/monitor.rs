//! 系统监控：CPU / 内存 / 网络采样，通过事件推给前端
use serde::Serialize;
use std::time::{Duration, Instant};
use sysinfo::{Networks, System};
use tauri::{AppHandle, Emitter};

use crate::events::EV_MONITOR;
use crate::Shared;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MonitorSample {
    pub cpu: f32,
    pub mem_used_mb: u64,
    pub mem_total_mb: u64,
    pub net_up_kbs: f32,
    pub net_down_kbs: f32,
    pub timestamp: u64,
}

/// 所有网卡的累计字节数：(上行, 下行)
fn totals(networks: &Networks) -> (u64, u64) {
    let mut up: u64 = 0;
    let mut down: u64 = 0;
    for (_name, data) in networks {
        down += data.received();
        up += data.transmitted();
    }
    (up, down)
}

pub fn watch(shared: Shared, app: AppHandle) {
    std::thread::spawn(move || {
        let mut sys = System::new_all();
        let mut networks = Networks::new_with_refreshed_list();
        // 先采一次基线，避免首个样点把开机以来的累计流量当成瞬时速率
        networks.refresh();
        let mut prev_net = totals(&networks);
        let mut prev_at = Instant::now();
        let mut ticks: u64 = 0;

        loop {
            // 每轮重读配置：运行期可改采样间隔与开关
            let (interval, enabled, tray_cpu) = {
                let s = shared.settings.lock().unwrap();
                (
                    s.monitor.interval_ms.max(200),
                    s.monitor.enabled,
                    s.monitor.tray_cpu,
                )
            };
            std::thread::sleep(Duration::from_millis(interval));
            ticks += 1;

            // 网卡热插拔：每分钟刷新一次列表
            if ticks % 60 == 0 {
                networks.refresh_list();
            }
            // 关键：refresh_list() 只刷新网卡列表，计数器必须用 refresh() 才更新
            networks.refresh();
            sys.refresh_cpu_usage();
            sys.refresh_memory();

            let net = totals(&networks);
            let dt = prev_at.elapsed().as_secs_f32().max(0.001);
            let sample = MonitorSample {
                cpu: sys.global_cpu_info().cpu_usage(),
                mem_used_mb: sys.used_memory() / 1024 / 1024,
                mem_total_mb: sys.total_memory() / 1024 / 1024,
                net_up_kbs: (net.0.saturating_sub(prev_net.0)) as f32 / 1024.0 / dt,
                net_down_kbs: (net.1.saturating_sub(prev_net.1)) as f32 / 1024.0 / dt,
                timestamp: chrono::Local::now().timestamp_millis() as u64,
            };
            prev_net = net;
            prev_at = Instant::now();

            // 关闭监控时仍更新基线，但不推送，避免重新开启时出现巨大尖峰
            if !enabled {
                continue;
            }

            if tray_cpu {
                if let Some(tray) = app.tray_by_id("main") {
                    let tip = format!("DeskCharger 2 · CPU {:.0}%", sample.cpu);
                    let _ = tray.set_tooltip(Some(&tip));
                }
            }

            *shared.last_monitor.lock().unwrap() = Some(sample.clone());
            let _ = app.emit(EV_MONITOR, sample);
        }
    });
}
