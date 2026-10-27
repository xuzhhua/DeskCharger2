# DeskCharger 2

用现代技术栈重写 2003 年 VC6/MFC 桌面向导 `DeskCharger` 的产物：一个**轻量、现代、托盘常驻**的 Windows 效率工具。

## 技术栈

- **桌面框架**：Tauri 2（Rust 后端，系统级能力全部在 Rust 侧）
- **前端**：React 18 + TypeScript + Vite + Tailwind CSS + Zustand + i18next
- **平台**：Windows（x64）

## 功能

| 模块 | 说明 |
|---|---|
| 全局热键 | 内置预设 + 用户自定义（命令 / URL / 内部功能），冲突检测，保存即时生效 |
| 定时提醒 | 单次 / 每天 / 每周 + 重复次数与间隔；通知 / 执行程序 / 系统动作 / 打开 URL |
| 番茄钟 | 工作 / 短休 / 长休状态机，可自定义时长，结束通知，可自动续接 |
| 剪贴板历史 | 文本记录、去重、固定、搜索、单击回填、可清空 |
| 系统监控 | CPU / 内存 / 网络实时曲线，托盘可显示 CPU |
| 快速启动 | 索引开始菜单 + 附加目录 + 命令别名，模糊搜索，回车执行 |
| 设置 | 亮 / 暗 / 跟随系统主题、开机自启、中英双语、未保存提示 |

> 相比原版：去除了过时的 CD-ROM 功能；修正了 `||`/`|`、`CString((LPCTSTR)ID)` 等原版缺陷；配置由类型化 JSON 取代手拼注册表。

## 环境要求

- Node.js ≥ 18 与 npm
- **Rust**（`rustup` 安装 stable 工具链）
- **MSVC Build Tools**（含 `link.exe`，用于 Tauri 链接；`cargo check` 无需）
- WebView2 运行时（Win10/11 通常已内置）

## 开发

```bash
npm install
npm run tauri dev        # 开发（热重载）
```

## 验证与构建

```bash
cargo test --manifest-path src-tauri/Cargo.toml   # Rust 单测
npm run test                                      # 前端单测
npm run build                                     # 前端类型检查 + 打包
npm run tauri build                               # 产出 NSIS 安装包
```

## 目录结构

```
src-tauri/src/     # Rust：settings / hotkey / reminder / pomodoro / clipboard / monitor / launcher / sysaction / tray
src/               # React：pages / components / stores / i18n / lib
docs/specs/        # 设计文档
```
