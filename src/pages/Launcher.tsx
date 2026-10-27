import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../lib/tauri";
import type { LauncherItem } from "../lib/types";

export function Launcher() {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<LauncherItem[]>([]);

  useEffect(() => {
    void api.launcherIndex();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void api.launcherSearch(q).then(setResults).catch(() => setResults([]));
    }, 120);
    return () => clearTimeout(timer);
  }, [q]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t("app.nav.launcher")}</h1>
      <input
        className="input text-base"
        placeholder={t("launcher.placeholder")}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
      />
      <div className="flex flex-col gap-1">
        {results.length === 0 && q !== "" && (
          <div className="py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            {t("common.empty")}
          </div>
        )}
        {results.map((item) => (
          <button
            key={`${item.kind}:${item.path}:${item.name}`}
            className="flex items-center justify-between rounded-lg border px-4 py-2 text-left text-sm transition-colors hover:opacity-80"
            style={{ borderColor: "var(--border)", background: "var(--surface)" }}
            onClick={() => void api.launcherRun(item)}
          >
            <span>{item.name}</span>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {item.kind}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
