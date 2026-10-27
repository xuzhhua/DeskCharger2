import { useTranslation } from "react-i18next";

const NAV_KEYS = [
  "home",
  "hotkeys",
  "reminders",
  "pomodoro",
  "clipboard",
  "monitor",
  "launcher",
  "settings",
] as const;

export function Sidebar({
  current,
  onNavigate,
}: {
  current: string;
  onNavigate: (k: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <aside
      className="flex w-52 flex-col border-r p-4"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      <div className="mb-6 flex items-center gap-2 px-2">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white"
          style={{ background: "var(--accent)" }}
        >
          DC
        </div>
        <div className="text-sm font-semibold">{t("app.title")}</div>
      </div>
      <nav className="flex flex-col gap-1">
        {NAV_KEYS.map((k) => {
          const active = current === k;
          return (
            <button
              key={k}
              onClick={() => onNavigate(k)}
              className="rounded-lg px-3 py-2 text-left text-sm transition-colors"
              style={{
                background: active ? "var(--accent-soft)" : "transparent",
                color: active ? "var(--accent)" : "var(--text)",
                fontWeight: active ? 600 : 400,
              }}
            >
              {t(`app.nav.${k}`)}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
