# DeskCharger 2 代码审计报告

- 审计日期：2026-10-27
- 审计范围：`D:\ProgramFiles\DeskCharger2`（Tauri 2.11.5 + React 18.3.1 + TypeScript 5.5.4 + Vite 5.4.3 + Zustand 4 + Tailwind 3 + i18next）
- 方式：全量阅读 `src-tauri/src/*.rs`（12 个文件，约 1500 行）与 `src/**`（约 1500 行），执行 `npm run test`、`tsc --noEmit`、`cargo test`、`cargo clippy --all-targets`，对照 README 与 `docs/specs/2026-08-15-deskcharger2-design.md` 检查功能兑现度。

## 一、总体结论

代码整体结构清晰：Rust 侧按能力分模块（settings / pomodoro / hotkey / reminder / clipboard / monitor / launcher / tray / sysaction），前端按页面拆分、统一走 `src/lib/tauri.ts` 包装命令、设置集中在 Zustand store，类型与命令命名一致（camelCase 序列化）。编译与测试基线是干净的。

但存在 **9 处影响主流程的功能性缺陷**，其中 3 处会让用户数据“看起来保存了，重启后丢失/无效”，且都指向同一个根因：**命令面冗余（`save_settings` 之外还暴露了 5 个只改单科目的命令），前端在 `update()` 之后又用渲染期的旧快照调用这些命令**。修复这批问题的同时收敛命令面，是本次审计优先级最高的动作。

| 维度 | 评价 | 说明 |
| --- | --- | --- |
| 功能完整度 | ⚠️ | README/设计文档承诺的“热键冲突检测、启动器回车执行、番茄钟结束通知、托盘双态图标”未实现 |
| 数据可靠性 | ❌ | 热键/提醒增删不落盘；配置任一字段异常即全量重置；写入非原子 |
| 状态一致性 | ⚠️ | 托盘改设置不回推前端；GUI 与后端会长期不一致 |
| 错误处理 | ⚠️ | 全项目 `Mutex::lock().unwrap()`、`expect()`，`fs::write` 直写 |
| 工程化 | ⚠️ | 零提交、无 CI、无 lint/format、生产包带 2.3 MB sourcemap、CSP 为空 |
| 测试 | ⚠️ | 10 个用例，只覆盖 serde 往返与番茄钟基础流转，无回归保护 |

## 二、P0：功能性缺陷（建议立即修）

### P0-1 热键、提醒的新增/删除在重启后丢失（数据丢失）

- 位置：`src/pages/Hotkeys.tsx:18-21`、`src/pages/Reminders.tsx:17-20`
- 现象：添加或删除热键/提醒后，界面正常，重启应用后改动消失。
- 原因：`doSave` 是渲染期闭包，捕获了当时的 `settings`：

```ts
// src/pages/Hotkeys.tsx
const doSave = async () => {
  await save();                              // 后端 save_settings：写入的是最新 store，正确
  const res = await api.hotkeySet(settings.hotkeys);  // ← settings 是旧快照
  ...
};
```

`update()` 里改的是 store，`doSave` 里的 `settings` 仍是上一次渲染的数组。Rust 侧 `hotkey_set` / `reminder_save` 会把这份**旧数组**写回 `AppSettings` 并落盘，于是“新增的那条没了 / 刚删的那条又回来了”。
- 备注：`save_settings`（`src-tauri/src/lib.rs`）已经全量持久化 settings 并同步热键，这两次调用纯属冗余；`hotkey_set` 返回值本意是给冲突检测用的，前端却只当保存用。
- 修复：
  1. 删除 `api.hotkeySet(...)` / `api.reminderSave(...)` 调用，只保留 `save()`；
  2. `doSave` 内改用 `useSettings.getState().settings`（或让 `save()` 自己读 `get().settings`）；
  3. 若确实要保留单科目命令，参数改为“基于函数式更新”的新数组，不要用渲染期闭包。
- 验收：添加/删除 → 完全退出 → 重启，改动仍在；杀进程后 `settings.json` 内容与 UI 一致。

### P0-2 一次“保存”触发 4 次配置写入 + 2 次热键全量重注册

- 位置：`src/pages/Settings.tsx:16-21`
- 现象：保存有轻微卡顿，热键在保存瞬间短暂失效，自启项被反复 enable/disable。
- 原因：

```ts
await save();                 // 第 1 次写盘 + sync_hotkeys + sync_autostart
await api.setTheme(theme);    // 第 2 次写盘 + sync_autostart
await api.setAutostart(b);    // 第 3 次
await api.setEnabled(s);      // 第 4 次 + sync_hotkeys（unregister_all → register）
```

`sync_hotkeys` 内部是 `unregister_all()` 再逐个注册，这段窗口内热键是失效的；连续两次调用使窗口叠加。
- 修复：`save_settings` 已经是“改什么都能存”的命令，删除 `set_theme` / `set_autostart` / `set_enabled` 三个命令（前端对应 API 一并删），页面只组装一次 `next` 对象调用 `save_settings`。这是 P0-1 的同一根因，应一起改。

### P0-3 点主题按钮抛 “Invalid hook call”

- 位置：`src/stores/settings.ts:71-76`，`src/lib/hooks.ts:3`
- 现象：设置页切换主题时控制台报错；主题虽然最终生效（由 `src/App.tsx:25` 的 `useApplyTheme()` 驱动），但报错会打断 Zustand action 后续逻辑。
- 原因：`setTheme` 在 store action（事件处理阶段）里调用了 `useTheme(t)`，而 `useTheme` 内部是 `useEffect` —— Hook 只能在组件渲染期调用。
- 修复：删掉 store 里的 `useTheme(t)` 调用（主题应用已由 `useApplyTheme` 负责）；如需要即时生效，直接在 store 里操作 `document.documentElement.classList`。

### P0-4 网络流量恒为 0

- 位置：`src-tauri/src/monitor.rs:34`
- 原因：sysinfo 0.30.13 中 `Networks::refresh_list()` 只刷新网卡**列表**，不更新计数器；更新数据要调 `Networks::refresh()`（见 `sysinfo-0.30.13/src/common.rs` 中 `Networks` 的 `refresh` 方法）。当前代码每轮只调 `refresh_list()`，`received()`/`transmitted()` 永远是 0（或首轮的绝对值）。
- 修复：

```rust
// 每 tick
networks.refresh();                       // 采样计数器
// 网卡热插拔：每 60s 或每 60 轮补一次 refresh_list()
```

- 验收：下载大文件时监控页“下行”明显上涨；拔插网卡后列表能更新。

### P0-5 内存占用显示单位错误（显示成 MB 却挂了 GB 标签）

- 位置：`src/pages/Monitor.tsx:32`
- 原因：`(current?.memUsedMb ?? 0 / 1024)` 中 `/` 优先于 `??`，实际是 `usedMb ?? (0/1024)`，因此“已用”显示原始 MB 值，与“总量”的 GB 值并排，比例完全失真。
- 修复：`((current?.memUsedMb ?? 0) / 1024).toFixed(1)`。建议同时用 TS 的 `noUncheckedIndexedAccess` 或直接抽 `formatGb()` 工具函数。

### P0-6 番茄钟结束没有任何提示

- 位置：`src-tauri/src/pomodoro.rs:151-174`
- 现象：工作/休息到点后界面静默切换（且 `auto_next=false` 时直接回到 idle），用户不知道结束了；README 与设计文档都写了“结束通知”。
- 原因：全文只有 `src-tauri/src/reminder.rs:90` 用了 `tauri_plugin_notification`，番茄钟从未调用。
- 修复：在 `tick()` 的“到点”分支里，切换阶段前发通知（标题区分 `工作结束` / `休息结束`），并复用 P0-9 的提示音；通知应在 `auto_next` 判断之前发，否则不续接时用户完全无感。
- 建议同时补：到点后播放系统提示音、任务栏闪烁（`request_user_attention`）。

### P0-7 快速启动：漏掉绝大多数开始菜单应用，别名参数被丢弃

- 位置：`src-tauri/src/launcher.rs:18-33`（`walk_lnks` 不递归）、`src-tauri/src/launcher.rs:100-111`（`run` 丢弃 args）、`src-tauri/src/launcher.rs:8-14`（`LauncherItem` 无 args 字段）
- 现象：搜索里只能看到 `Start Menu\Programs` **根目录**的几个 .lnk；Office、VS、微信等放在子文件夹里的应用全都搜不到。别名 `shutdown` / `restart` 执行后什么也没发生（`shutdown.exe` 不带参数只打印帮助）。
- 原因：两个独立缺陷：`walk_lnks` 只遍历一层；别名的 `args` 在 `index()` 里被丢掉（只存了 `command`）。
- 修复：

```rust
fn walk_lnks(dir: &Path, out: &mut Vec<LauncherItem>, depth: u8) {
    if depth > 6 { return; }
    let Ok(entries) = fs::read_dir(dir) else { return };
    for e in entries.flatten() {
        let p = e.path();
        if p.is_dir() { walk_lnks(&p, out, depth + 1); }
        else if p.extension().is_some_and(|x| x.eq_ignore_ascii_case("lnk")) { /* push */ }
    }
}
```

并给 `LauncherItem` 加 `#[serde(default)] pub args: Vec<String>`，`run()` 里 `Command::new(&item.path).args(&item.args)`；`kind` 顺手区分 `app` / `file` / `alias` / `url`（`url` 目前永远不会产生，可直接删或补 `http://` 识别）。

### P0-8 空闲态点托盘/热键的“番茄钟”无反应

- 位置：`src-tauri/src/tray.rs:41-42`、`src-tauri/src/hotkey.rs:158-159`
- 原因：两处都是“取当前 phase 再 `start(phase)`”。空闲态 phase 是 `"idle"`，`phase_secs("idle")` 返回 0 → `running = true` 但 deadline = now → 下一秒 `tick` 判到点，`auto_next=false` 时立刻回 idle。`auto_next=true` 时反而会启动工作段，行为随配置漂移。
- 修复：空闲态启动工作段。

```rust
let phase = {
    let st = shared.pomodoro.state.lock().unwrap();
    if st.phase == PHASE_IDLE { PHASE_WORK.to_string() } else { st.phase.clone() }
};
crate::pomodoro::start(&shared, &phase);
```

建议把这段抽成 `pomodoro::toggle(&shared)`，托盘与热键共用，避免两处再次分叉。

### P0-9 提醒提示音不响 + 所有 spawn 会闪黑窗

- 位置：`src-tauri/src/reminder.rs:98`，以及 `reminder.rs:102`、`hotkey.rs:139`、`sysaction.rs`、`launcher.rs:102` 的所有 `Command::spawn()`
- 现象：勾选“提示音”听不到声音，反而闪一个黑框；执行系统命令（`shutdown.exe`）时也闪黑框。
- 原因：
  1. `args(["/c", "echo", "\\x07"])` 里是**字面量** `\x07`（反斜杠+x+0+7），cmd 打印这四个字符，不会响；即便写成真正的 BEL，`echo` 到已关闭的 stdout 也不会发声。
  2. Windows 上从 GUI 进程 spawn 控制台程序默认会创建控制台窗口。
- 修复：

```rust
#[link(name = "user32")]
extern "system" { fn MessageBeep(u_type: u32) -> i32; }
const MB_ICONASTERISK: u32 = 0x0000_0040;
unsafe { MessageBeep(MB_ICONASTERISK) };
```

```rust
use std::os::windows::process::CommandExt;
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
let mut cmd = std::process::Command::new(command);
cmd.args(args).creation_flags(CREATE_NO_WINDOW);
let _ = cmd.spawn();
```

建议在 `src-tauri/src/proc.rs` 里封装 `spawn_hidden(command, args) -> io::Result<Child>`，全项目统一走它。

## 三、P1：数据可靠性与状态一致性

### P1-1 配置解析失败即全量重置；写入非原子

- 位置：`src-tauri/src/settings.rs:187-193`（load）、`195-202`（save）
- 问题：
  - `serde_json::from_str(&text).unwrap_or_default()`：任一字段类型不对/缺失（例如手工编辑出错、旧版本配置）→ 整份配置回到默认，**用户数据无提示丢失**。
  - `AppSettings` 及各子结构体都没有 `#[serde(default)]`：以后加字段，旧配置一律反序列化失败 → 同样的全量重置。
  - `fs::write` 直接覆盖：写一半断电 = 配置损坏（再叠加前面的“损坏即重置”，等于必丢）。
  - `version` 字段存在但没有任何迁移分支。
- 修复：
  1. 所有设置结构体加 `#[serde(default)]`（`AppSettings` 已有 `Default` 实现，子结构体需一并加）；
  2. load 失败时把坏文件改名备份为 `settings.corrupt-<ts>.json` 再回默认，并记录日志；
  3. save 改成临时文件 + rename：

```rust
let tmp = path.with_extension("json.tmp");
fs::write(&tmp, &text)?;
if path.exists() { let _ = fs::copy(&path, path.with_extension("json.bak")); }
fs::rename(&tmp, &path)?;
```

  4. 加 `fn migrate(mut s: AppSettings) -> AppSettings`，按 `version` 递增做迁移。

### P1-2 重复提醒在 `interval=0` 时每 5 秒狂轰

- 位置：`src-tauri/src/reminder.rs:67-74`
- 原因：`(now_ts - f.last_at) >= i64::from(r.repeat_interval_sec)`，`repeat_interval_sec = 0` 时恒真，`repeat_times` 次会在一分钟内全部放完。前端 `src/pages/Reminders.tsx` 默认就是 `repeatIntervalSec: 0`。
- 修复：后端读取时 `max(60)`（最快 1 分钟一次），前端表单校验最小值；`repeatTimes = 0` 表示“不重复”，与 `count == 0` 的判断分开表达，避免两个 0 语义叠加。

### P1-3 提醒错过即永久丢失；单次提醒不会失效

- 位置：`src-tauri/src/reminder.rs:59-74`
- 问题：时间用 `"HH:MM"` 精确分钟匹配，应用没运行 / 系统休眠跨过那一分钟 → 该次永远不触发；`Once` 触发后 `enabled` 仍为 true（设计文档写了“一次性自动停用”）。
- 修复：改为“每次 tick 计算下一次触发时刻（`chrono`），`now >= due` 即补触发一次”，天然支持休眠补救；`Once` 触发后把 `enabled=false` 并 `save` + 发事件，前端列表同步置灰。

### P1-4 番茄钟长休息差一段（5 个工作段后才长休）

- 位置：`src-tauri/src/pomodoro.rs:127-148`
- 原因：`cycle` 只在**短休息结束时** +1，而长休判断在**工作结束时**用 `cycle >= cycles_before_long`。推演（默认 4）：work1 结束 cycle=0 → 短休 → cycle=1；work2 → 2；work3 → 3；work4 结束 cycle=3 < 4 → 短休 → cycle=4；work5 结束才 `4 >= 4` → 长休。实际是 5 个番茄后长休。
- 修复：把“已完成工作段数 +1”挪到工作结束，长休判断用 `cycle >= cycles_before_long`，长休结束时 `cycle = 0`。

```rust
PHASE_WORK => {
    let mut st = shared.pomodoro.state.lock().unwrap();
    st.cycle += 1;
    if settings.pomodoro.cycles_before_long > 0
        && st.cycle >= settings.pomodoro.cycles_before_long { PHASE_LONG } else { PHASE_SHORT }
}
```

并补一个状态机单测：work→short×3→work→long，验证 4 段后长休。

### P1-5 暂停后无法续跑

- 位置：`src/pages/Pomodoro.tsx:45`、`src-tauri/src/pomodoro.rs:52-63`
- 原因：`start()` 总是按整段时长重设 deadline；`pause()` 算出的 `remaining_sec` 被丢弃。用户暂停 20 分钟后点开始，又从 25:00 重新计时。
- 修复：`start()` 改为“若 phase 未变且 `remaining_sec > 0` 则续跑”，或新增 `resume()` 命令；前端按钮在暂停态调 `resume`。

### P1-6 托盘改设置不回推前端，勾选态陈旧

- 位置：`src-tauri/src/tray.rs:47-54`
- 问题：`toggle-enabled` 只改后端并落盘，前端 store 不知道；用户回到窗口看到“启用全部功能”还是开着的旧值，直到重启。`CheckMenuItem` 的勾选态也只在点击自己时由系统翻转，从设置页改成 false 后托盘仍显示勾上。
- 修复：改完后 `app.emit("settings-changed", s.clone())`，前端 `listen` 里 `merge` 进 store（顺带解决 P0-2 的重复写盘）；托盘侧用 `CheckMenuItemHandle::set_checked()` 在收到事件时同步。

### P1-7 监控忽略 `monitor.enabled`

- 位置：`src-tauri/src/monitor.rs:29`
- 问题：只读 `interval_ms`，`enabled=false` 时照样采样并每秒 `emit`，前端与托盘继续工作。
- 修复：每轮读一次 `(enabled, interval_ms, tray_cpu)`，`!enabled` 时 `sleep` 后 `continue`（不要 break，配置可能再打开）。

### P1-8 剪贴板：固定项会被淘汰、历史不持久、回填会重排

- 位置：`src-tauri/src/clipboard.rs:59`（`items.truncate(max)`）、`copy_text`、整体无持久化
- 问题：
  1. 超过上限直接截断尾部，**已固定（pinned）的条目可能被删**；
  2. 只存内存，固定项重启即丢（README 说“可固定”）；
  3. `copy_text` 回填后不更新 watcher 的 `last_seen`，500ms 后 watcher 把它当成“新内容”再插一次，导致条目跳到顶部且 `at` 时间仍是旧的。
- 修复：淘汰时只从“未固定且最旧”开始删；pinned 列表单独落盘 `clipboard.json`；`copy_text` 里同步 `*last_seen.lock() = text`。

### P1-9 设置页缺项与不可达功能

- 位置：`src/pages/Settings.tsx`
- 问题：
  - 后端已支持但无 UI：`clipboard.enabled` / `maxItems`、`monitor.enabled` / `intervalMs` / `trayCpu`、`launcher.extraDirs`；
  - “恢复默认值”做了一半：`reset_settings` 命令与 store 的 `reset()` 都存在，但没有任何入口调用；
  - 关闭窗口直接隐藏到托盘，未保存的改动不会被提示（只有一条顶部小字）；
  - `src/App.tsx:76` 的“● 有未保存的修改”是硬编码中文，i18n 里已有 `settings.unsaved` 却没使用。
- 修复：把上面四组字段补进设置页分组卡片；加“恢复默认”按钮（二次确认）；监听 `onCloseRequested` 拦截未保存状态；文案走 `t("settings.unsaved")`。

## 四、P2：体验、可维护性与工程化

### P2-1 i18n 只做了一半

硬编码中文仍在：`src/pages/Hotkeys.tsx:214-247`（“命令 / URL / 内部功能 / 快速启动面板 / 剪贴板历史 / 番茄钟”）、`src/pages/Reminders.tsx:113-129` 与 `191-278`（“每天 / 每周 / 系统 / 标题 / 内容 / 日期”）、`src/pages/Pomodoro.tsx:60-93`（“参数 / （分钟）/ 长休息间隔周期 / 自动开始下一段”）。同时有 7 个 key 定义了却没人用：`hotkeys.conflict`、`hotkeys.saved`、`reminders.everyDay`、`reminders.once`、`reminders.weekly`、`clipboard.unpin`、`pomodoro.running`、`launcher.extraDirs`。切到 English 会中英混排。
建议：给 i18n 资源加类型约束（`as const` + `Resources` 声明），让缺失 key 在 `tsc` 阶段暴露，比人工巡检可靠。

### P2-2 热键功能不完整

- `src/pages/Hotkeys.tsx:200-205` 键位输入框 `maxLength={1}`：F1–F12、Insert、PrintScreen 都录不进去，但 Rust 的 `parse_code` 明明支持；
- `hotkey_set` 返回 `Vec<(String, String)>`（冲突列表），`src/lib/tauri.ts:18-20` 声明成 `void` → 冲突信息被丢弃，`hotkeys.conflict` 文案永远不显示。README 的“冲突检测”实际没兑现。
- 建议：键位输入改成“按下按键即捕获”（`onKeyDown` + `preventDefault`，取 `e.key`），显示 `e.ctrlKey/altKey/shiftKey/metaKey` 组合；`hotkeySet` 返回类型对齐为 `[string, string][]`，冲突时在表单下方红字提示。

### P2-3 快速启动交互与性能

- `src/pages/Launcher.tsx` 没有 Enter 执行、上下键选择（README 写“回车执行”）；
- 每次挂载都 `await api.launcherIndex()`：`launcher::index` 在命令线程里同步遍历两个开始菜单目录 + 所有附加目录，目录大时界面明显卡；
- `launcher::search` 只有 `contains`，没有前缀/子序列评分，搜 “code” 会排在 “visual studio code” 后面；
- `walk_files` 把附加目录里的**所有文件**都塞进索引（含 .txt/.png），列表噪声大。
- 建议：索引在启动后台线程构建，完成后 `emit("launcher-indexed")`；前端只在收到事件后拉取，并加 `lru` 缓存；搜索改成前缀优先 + 子序列打分；`walk_files` 过滤扩展名白名单。

### P2-4 启动路径阻塞

`src-tauri/src/lib.rs:280` 在 `setup` 里同步调 `launcher::index(&shared)`，首窗显示被全盘扫描拖慢。改成 `std::thread::spawn`，线程内建完索引再发事件（与 P2-3 同一改动）。

### P2-5 锁与 panic

全项目 `Mutex::lock().unwrap()`（`settings`/`pomodoro`/`clipboard`/`reminder`/`launcher_index`/`last_monitor`）。任一持锁线程 panic → 锁中毒 → 之后每个 `unwrap()` 都 panic，应用表现为“点哪都没反应”。另外 `reminder::tick` 在持有 `fires` 锁期间执行 `execute()`（spawn 进程、弹通知，属于 IO），会阻塞同锁的其他访问。
建议：`lock().unwrap_or_else(|e| e.into_inner())`；`reminder::tick` 先收集待触发列表、释放锁，再逐条执行。

### P2-6 安全与发布卫生

- `tauri.conf.json` 的 `security.csp` 为 `null`：一旦出现注入面（如启动器渲染外部字符串），没有最后一道防线。建议显式 CSP：
  `"default-src 'self'; img-src 'self' asset: http://asset.localhost data:; style-src 'self' 'unsafe-inline'; script-src 'self'"`（`style-src` 保留 `unsafe-inline` 是因为 recharts 用内联样式）。
- `vite.config.ts` 的 `build.sourcemap: true` 让 2.3 MB 的 `.js.map` 随安装包发布（`dist` 共 2.9 MB，其中 sourcemap 占 80%）。改成 `process.env.TAURI_ENV_DEBUG ? true : false`，或只在内测构建开启。
- 没有日志框架，全靠 `eprintln!`，用户现场问题无法定位。建议 `log` + `tauri-plugin-log`（写 `%LOCALAPPDATA%\com.deskcharger2\logs`），并在设置页加“打开日志目录”。

### P2-7 弹窗可访问性

`src/components/Modal.tsx`：无 Esc 关闭、无焦点陷阱、无 `role="dialog"`/`aria-modal`、点遮罩不关闭；打开后焦点不落输入框。另外剪贴板“清空”没有二次确认（`src/pages/Clipboard.tsx`），误点即全丢。

### P2-8 命令面冗余与架构建议

现存命令里，`set_theme` / `set_autostart` / `set_enabled` / `hotkey_set` / `reminder_save` 都在做 `save_settings` 的子集，各自还带副作用（写盘、`sync_hotkeys`、`sync_autostart`）。这正是 P0-1/P0-2 的温床。
建议收敛为：

```
save_settings(settings) -> ()        // 唯一写入口：落盘 + 同步热键/自启 + emit("settings-changed")
get_settings() -> AppSettings
```

其余全部删除；托盘、热键回调等需要改设置的地方，改完后一律 `emit("settings-changed")`，前后端只认这一条真相链。

### P2-9 工程化缺口

- git 仓库 **零提交**（全部文件 untracked）：没有历史、没有回滚点。建议先 `git add -A && git commit -m "chore: initial import"`，再按 P0 分批提交。
- 无 CI：建议 `.github/workflows/ci.yml`（windows-latest）：`npm ci && npx tsc --noEmit && npm test`、`cargo fmt --check`、`cargo clippy --all-targets -- -D warnings`、`cargo test`，tag 时用 `tauri-apps/tauri-action` 出包。
- 无 ESLint/Prettier：现有代码风格基本统一，但长行（如 `src/pages/Reminders.tsx` 的模板字符串）与 import 顺序已经开始漂移。ESLint 9 flat config + `typescript-eslint` + `eslint-plugin-react-hooks` 能直接抓住 P0-1 之外的“Hook 依赖”类问题。`package.json` 也缺 `lint` / `typecheck` 脚本（`tsc --noEmit` 目前只能手动跑）。
- `tsconfig` 里 `paths` 配了 `@/*` 但全项目零使用：要么用起来，要么删掉，避免误导。
- `vite.config.ts` 内嵌 `test` 配置：`vitest` 类型不会参与 `tsc` 检查（`tsconfig.node.json` 也没包含 `vitest/globals`），建议拆 `vitest.config.ts` 并 `defineConfig` 合并，或至少补 `/// <reference types="vitest" />`。
- 版本号在 `package.json` / `Cargo.toml` / `tauri.conf.json` 三处手工同步，建议脚本统一升级。
- 缺 `LICENSE`、`CHANGELOG.md`。

### P2-10 测试薄弱

现状：前端 1 个文件 3 个用例（`src/stores/settings.test.ts`，测 store 默认值与 update），Rust 7 个（settings 的 serde 往返/忽略未知字段、pomodoro 的 4 个基础流转）。没有任何测试覆盖本次发现的缺陷，因此 P0 修完极易回归。
建议优先补（都能纯逻辑单测，不需要 UI）：

| 目标 | 用例 |
| --- | --- |
| `pomodoro::tick` 阶段机 | 4 个番茄后长休；`cycle` 归零；`auto_next=false` 停 idle；暂停续跑 |
| `reminder` 调度 | `interval=0` 不狂轰；`Once` 触发后停用；跨天 `count` 重置；休眠错过补触发 |
| `launcher` | 递归索引子目录；别名参数透传；搜索排序 |
| `hotkey::parse_code` | F1–F12、组合键、非法输入 |
| `clipboard` | 固定项不被淘汰；重复文本去重；回填后不重排 |
| settings | 缺字段/坏 JSON 的降级与备份；原子写 |

## 五、建议修复路线

| 批次 | 内容 | 预估 | 风险 |
| --- | --- | --- | --- |
| 第 0 批 | `git init` 已有 → 首次提交，建立回滚点 | 0.2 h | 无 |
| 第 1 批 | P0-1/2/3 + P2-8：收敛到 `save_settings`，删 5 个冗余命令，前端改 store 读取 | 3 h | 中（动命令面与 3 个页面） |
| 第 2 批 | P0-4/5/9 + P1-7 + P2-6：`refresh()`、单位、`spawn_hidden`、`MessageBeep`、CSP、sourcemap | 2 h | 低 |
| 第 3 批 | P0-6/7/8 + P1-4/5：番茄钟通知与状态机、启动器递归与回车执行 | 4 h | 中 |
| 第 4 批 | P1-1/2/3/6/8：配置健壮性、提醒调度重写、托盘事件、剪贴板持久化 | 5 h | 中高（触碰持久化格式） |
| 第 5 批 | P1-9 + P2-1/2/3/4/7：设置页补全、i18n 收口、快速启动交互、弹窗可访问性 | 4 h | 低 |
| 第 6 批 | P2-9/10：ESLint + CI + 补测试 | 3 h | 低 |

建议顺序：第 0→1 批先落地（直接消灭数据丢失），第 2 批顺手做完（几乎零风险），其余按需排期。

## 六、复现与验证命令

```powershell
# 基线（本次审计结果：全部通过；clippy 无告警）
npm run test                 # 1 file / 3 tests
npx tsc --noEmit             # 无输出
cd src-tauri
cargo test                   # 7 passed
cargo clippy --all-targets   # 无 warning

# 复现 P0-1：启动应用 → 热键页新增一条 → 完全退出 → 重开 → 该条消失
# 复现 P0-4：监控页下载文件，下行始终 0.0
# 复现 P0-5：内存“已用”显示 8192 之类，而“总量”显示 16 GB
# 复现 P0-8：空闲态点托盘“番茄钟 开始/暂停”，状态 1 秒后回到 idle
# 复现 P0-9：新建一个带提示音的提醒，到点只闪黑框、无声音
# 复现 P1-4：连续跑 4 个工作段，第 4 段后是短休而不是长休
```

## 七、落地进度

### 2026-10-27：第 1 批（命令面收敛 + 数据丢失）与第 2 批（零风险修正）已完成

| 项 | 处理 | 关键文件 |
| --- | --- | --- |
| P0-1 | 删除 `hotkey_set` / `reminder_save` 调用；`save()` 直接读 `get().settings`，不再用渲染期快照 | `src/stores/settings.ts`、`src/pages/Hotkeys.tsx`、`src/pages/Reminders.tsx` |
| P0-2 | `save_settings` 成为唯一写入口；仅当热键/自启真的变化才 `sync_hotkeys` / `sync_autostart`；删除 `set_theme` / `set_autostart` / `set_enabled` / `register_all` | `src-tauri/src/lib.rs`、`src/pages/Settings.tsx`、`src/lib/tauri.ts` |
| P0-3 | store 的 `setTheme` 改为调用纯函数 `applyTheme()`，不再在 action 里调 Hook | `src/stores/settings.ts`、`src/lib/hooks.ts` |
| P0-4 | `networks.refresh_list()` → `refresh()`（列表每分钟刷新一次，兼顾网卡热插拔） | `src-tauri/src/monitor.rs` |
| P0-5 | 内存已用单位修正为 `((usedMb) / 1024).toFixed(1)` | `src/pages/Monitor.tsx` |
| P0-9 | 新增 `proc::spawn_hidden`（`CREATE_NO_WINDOW`）与 `proc::beep`（`MessageBeep`），替换 `cmd /c echo \x07` 及全部裸 `spawn()` | `src-tauri/src/proc.rs`、`reminder.rs`、`hotkey.rs`、`sysaction.rs`、`launcher.rs` |
| P1-7 | 监控尊重 `monitor.enabled`：关闭时只更新基线不推送，避免重开尖峰 | `src-tauri/src/monitor.rs` |
| P1-6（部分） | 托盘 `toggle-enabled` 后 `emit("settings-changed")`；前端新增 `events.onSettings` 同步 store。菜单勾选态待第 4 批 | `src-tauri/src/tray.rs`、`src/App.tsx` |
| P2-2（部分） | `save_settings` 返回冲突列表，热键页据此展示“哪些组合键注册失败”；`hotkeySet` 的错误返回不再被丢弃 | `src-tauri/src/lib.rs`、`src/pages/Hotkeys.tsx`、`src/lib/tauri.ts` |
| P2-6 | 显式 CSP（生产）+ `devCsp`（放行 Vite HMR）；生产构建不再输出 sourcemap | `src-tauri/tauri.conf.json`、`vite.config.ts` |
| P2-10（部分） | 新增 2 条回归用例：`save()` 必须提交最新 store 状态；冲突列表透传 | `src/stores/settings.test.ts` |

验证结果（本次改动后重跑）：

```
npx tsc --noEmit                  → 通过
npm run test                      → 1 file / 5 tests passed
cargo clippy --all-targets        → 无 warning
cargo test                        → 7 passed
npm run build                     → dist 615 kB js + 10.7 kB css，无 .js.map（原 2.9 MB）
```

仍未处理（按原优先级）：P0-6 番茄钟通知、P0-7 启动器递归与别名参数、P0-8 空闲态番茄钟开关、P1-1~P1-5、P1-8、P1-9、P2-1、P2-3~P2-5、P2-7~P2-9、P2-10 其余用例。
