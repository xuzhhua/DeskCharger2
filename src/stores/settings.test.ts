import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ saveSettings: vi.fn(), loadSettings: vi.fn(), resetSettings: vi.fn() }));

vi.mock("../lib/tauri", () => ({
  api: {
    saveSettings: mocks.saveSettings,
    loadSettings: mocks.loadSettings,
    resetSettings: mocks.resetSettings,
  },
}));

import { defaultSettings, useSettings } from "./settings";

describe("defaultSettings", () => {
  it("provides sane defaults for general options", () => {
    const s = defaultSettings();
    expect(s.general.enabled).toBe(true);
    expect(s.general.theme).toBe("system");
    expect(s.general.lang).toBe("zh-CN");
    expect(s.general.autostart).toBe(false);
  });

  it("provides sane defaults for feature modules", () => {
    const s = defaultSettings();
    expect(s.clipboard.maxItems).toBe(100);
    expect(s.clipboard.enabled).toBe(true);
    expect(s.monitor.intervalMs).toBe(1000);
    expect(s.pomodoro.workMin).toBe(25);
    expect(s.pomodoro.shortBreakMin).toBe(5);
    expect(s.pomodoro.longBreakMin).toBe(15);
    expect(s.pomodoro.cyclesBeforeLong).toBe(4);
    expect(s.version).toBe(1);
  });

  it("includes default hotkeys and launcher aliases", () => {
    const s = defaultSettings();
    expect(s.hotkeys.length).toBeGreaterThan(0);
    expect(s.launcher.aliases.length).toBeGreaterThan(0);
    const first = s.hotkeys[0];
    expect(first.modifiers).toContain("ctrl");
    expect(typeof first.key).toBe("string");
  });
});

describe("settings store save", () => {
  beforeEach(() => {
    mocks.saveSettings.mockReset();
    mocks.saveSettings.mockResolvedValue([]);
    useSettings.setState({ settings: defaultSettings(), loaded: true, dirty: true });
  });

  // 回归保护：旧实现里页面先 update() 再调用基于渲染期快照的命令，
  // 会用旧数组覆盖刚改的内容，导致热键/提醒的新增与删除重启后丢失。
  it("persists the latest store state, not a stale render snapshot", async () => {
    const save = useSettings.getState().save;
    useSettings.getState().update((s) => {
      s.hotkeys.push({
        id: "h-new",
        name: "计算器",
        modifiers: ["ctrl", "alt"],
        key: "J",
        action: { type: "exec", command: "calc.exe" },
      });
    });

    const conflicts = await save();

    expect(mocks.saveSettings).toHaveBeenCalledTimes(1);
    const sent = mocks.saveSettings.mock.calls[0][0];
    expect(sent.hotkeys.map((h: { id: string }) => h.id)).toContain("h-new");
    expect(conflicts).toEqual([]);
    expect(useSettings.getState().dirty).toBe(false);
  });

  it("returns hotkey registration conflicts reported by the backend", async () => {
    mocks.saveSettings.mockResolvedValue([["h-new", "already registered"]]);

    const conflicts = await useSettings.getState().save();

    expect(conflicts).toEqual([["h-new", "already registered"]]);
    expect(useSettings.getState().dirty).toBe(false);
  });
});
