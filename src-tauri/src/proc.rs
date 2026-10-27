//! 子进程与系统提示音辅助
//!
//! Windows 上 GUI 进程启动控制台程序（shutdown.exe / cmd.exe / rundll32.exe 等）
//! 默认会创建控制台窗口，表现为“闪一下黑框”。统一走 [`spawn_hidden`] 避免。
use std::process::{Child, Command};

/// CREATE_NO_WINDOW
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// 启动子进程，且不弹出控制台窗口。
pub fn spawn_hidden(command: &str, args: &[String]) -> std::io::Result<Child> {
    let mut cmd = Command::new(command);
    cmd.args(args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd.spawn()
}

#[cfg(windows)]
#[link(name = "user32")]
extern "system" {
    fn MessageBeep(u_type: u32) -> i32;
}

/// 播放系统提示音（MB_ICONASTERISK）。
///
/// 不经过 shell，因此不会闪黑窗，也不依赖 stdout 是否可用。
pub fn beep() {
    #[cfg(windows)]
    unsafe {
        MessageBeep(0x0000_0040);
    }
}
