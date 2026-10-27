//! 系统动作：休眠 / 关机 / 重启 / 注销（Windows）
//!
//! 全部通过 [`crate::proc::spawn_hidden`] 启动，避免控制台黑框闪现。
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SysAction {
    Sleep,
    Shutdown,
    Restart,
    Logoff,
}

fn run(command: &str, args: &[&str]) -> std::io::Result<()> {
    let owned: Vec<String> = args.iter().map(|a| (*a).to_string()).collect();
    crate::proc::spawn_hidden(command, &owned).map(|_| ())
}

impl SysAction {
    pub fn from_code(code: &str) -> Option<Self> {
        match code {
            "sleep" => Some(SysAction::Sleep),
            "shutdown" => Some(SysAction::Shutdown),
            "restart" => Some(SysAction::Restart),
            "logoff" => Some(SysAction::Logoff),
            _ => None,
        }
    }

    pub fn exec(self) -> std::io::Result<()> {
        match self {
            // 待机/休眠（Windows 通过 rundll32 调 powrprof）
            SysAction::Sleep => run("rundll32.exe", &["powrprof.dll,SetSuspendState", "0,1,0"]),
            SysAction::Shutdown => run("shutdown.exe", &["/s", "/t", "0"]),
            SysAction::Restart => run("shutdown.exe", &["/r", "/t", "0"]),
            SysAction::Logoff => run("shutdown.exe", &["/l"]),
        }
    }
}
