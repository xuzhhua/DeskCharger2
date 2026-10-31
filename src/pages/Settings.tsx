import { useTranslation } from "react-i18next";
import { useSettings } from "../stores/settings";
import { Toggle } from "../components/Toggle";
import type { Theme } from "../lib/types";

export function Settings() {
  const { t } = useTranslation();
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  const save = useSettings((s) => s.save);
  const dirty = useSettings((s) => s.dirty);
  const setTheme = useSettings((s) => s.setTheme);
  const setLang = useSettings((s) => s.setLang);

  const doSave = async () => {
    // 只调一次 save_settings：后端负责落盘、按需同步热键/自启，并广播 settings-changed
    await save();
  };

  const themes: { value: Theme; label: string }[] = [
    { value: "light", label: t("settings.light") },
    { value: "dark", label: t("settings.dark") },
    { value: "system", label: t("settings.system") },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("app.nav.settings")}</h1>
        <button className="btn-primary" onClick={() => void doSave()}>
          {t("common.save")}
          {dirty && " *"}
        </button>
      </div>

      <div className="card">
        <div className="mb-4 text-sm font-semibold">{t("settings.general")}</div>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-sm">{t("settings.theme")}</span>
            <div className="flex gap-1">
              {themes.map((th) => (
                <button
                  key={th.value}
                  className="btn-ghost"
                  style={{
                    background: settings.general.theme === th.value ? "var(--accent-soft)" : "var(--surface-2)",
                    color: settings.general.theme === th.value ? "var(--accent)" : "var(--text)",
                  }}
                  onClick={() => setTheme(th.value)}
                >
                  {th.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm">{t("settings.language")}</span>
            <select
              className="input"
              value={settings.general.lang}
              onChange={(e) => setLang(e.target.value as "zh-CN" | "en")}
            >
              <option value="zh-CN">中文</option>
              <option value="en">English</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm">{t("settings.autostart")}</span>
            <Toggle
              checked={settings.general.autostart}
              onChange={(v) => update((s) => { s.general.autostart = v; })}
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm">{t("settings.enabled")}</span>
            <Toggle
              checked={settings.general.enabled}
              onChange={(v) => update((s) => { s.general.enabled = v; })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-sm">{t("settings.startMinimized")}</span>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                {t("settings.startMinimizedHint")}
              </span>
            </div>
            <Toggle
              checked={settings.general.startMinimized}
              onChange={(v) => update((s) => { s.general.startMinimized = v; })}
            />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="mb-2 text-sm font-semibold">{t("launcher.aliases")}</div>
        <div className="flex flex-col gap-2">
          {settings.launcher.aliases.length === 0 && (
            <div className="text-sm" style={{ color: "var(--text-muted)" }}>{t("common.empty")}</div>
          )}
          {settings.launcher.aliases.map((a, i) => (
            <div key={i} className="flex items-center gap-2">
              <input className="input flex-1" value={a.name} placeholder="name"
                onChange={(e) => update((s) => { s.launcher.aliases[i].name = e.target.value; })} />
              <input className="input flex-1" value={a.command} placeholder="command"
                onChange={(e) => update((s) => { s.launcher.aliases[i].command = e.target.value; })} />
              <button className="btn-ghost" onClick={() => update((s) => { s.launcher.aliases.splice(i, 1); })}>
                {t("common.delete")}
              </button>
            </div>
          ))}
          <button
            className="btn-ghost self-start"
            onClick={() => update((s) => { s.launcher.aliases.push({ name: "", command: "" }); })}
          >
            + {t("common.add")}
          </button>
        </div>
      </div>
    </div>
  );
}
