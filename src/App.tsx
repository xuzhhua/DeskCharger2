import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { events } from "./lib/tauri";
import { Sidebar } from "./components/Sidebar";
import { Home } from "./pages/Home";
import { Hotkeys } from "./pages/Hotkeys";
import { Reminders } from "./pages/Reminders";
import { Pomodoro } from "./pages/Pomodoro";
import { Clipboard } from "./pages/Clipboard";
import { Monitor } from "./pages/Monitor";
import { Launcher } from "./pages/Launcher";
import { Settings } from "./pages/Settings";
import { useSettings, useApplyTheme } from "./stores/settings";
import { useRuntime } from "./stores/runtime";

export default function App() {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState("home");
  const loaded = useSettings((s) => s.loaded);
  const load = useSettings((s) => s.load);
  const lang = useSettings((s) => s.settings.general.lang);
  const dirty = useSettings((s) => s.dirty);
  const initRuntime = useRuntime((s) => s.init);

  useApplyTheme();

  // 初始加载配置与运行时状态
  useEffect(() => {
    load().then(() => initRuntime()).catch(console.error);
  }, [load, initRuntime]);

  // 全局热键内部动作 → 页面导航
  useEffect(() => {
    let un: (() => void) | undefined;
    void listen<string>("navigate", (e) => {
      const target = e.payload as string;
      if (target in pages) setPage(target);
    }).then((fn) => {
      un = fn;
    });
    return () => un?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 语言切换
  useEffect(() => {
    i18n.changeLanguage(lang);
  }, [lang, i18n]);

  // 后端改配置（托盘菜单等）后广播 → 同步到前端 store，避免两端状态漂移
  useEffect(() => {
    let un: (() => void) | undefined;
    void events
      .onSettings((s) => useSettings.getState().applyFromBackend(s))
      .then((fn) => {
        un = fn;
      });
    return () => un?.();
  }, []);

  const pages: Record<string, React.ComponentType> = {
    home: Home,
    hotkeys: Hotkeys,
    reminders: Reminders,
    pomodoro: Pomodoro,
    clipboard: Clipboard,
    monitor: Monitor,
    launcher: Launcher,
    settings: Settings,
  };
  const Page = pages[page] ?? Home;

  if (!loaded) {
    return (
      <div className="flex h-full items-center justify-center text-sm" style={{ color: "var(--text-muted)" }}>
        Loading…
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <Sidebar current={page} onNavigate={setPage} />
      <main className="flex-1 overflow-y-auto p-8">
        {dirty && (
          <div className="mb-4 rounded-lg px-4 py-2 text-xs" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
            ● {t("settings.unsaved")}
          </div>
        )}
        <Page />
      </main>
    </div>
  );
}
