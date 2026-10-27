import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useRuntime } from "../stores/runtime";
import { api } from "../lib/tauri";

export function Clipboard() {
  const { t } = useTranslation();
  const clips = useRuntime((s) => s.clips);
  const pin = useRuntime((s) => s.pin);
  const del = useRuntime((s) => s.del);
  const clear = useRuntime((s) => s.clearClips);
  const [q, setQ] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = clips.filter((c) => c.text.toLowerCase().includes(q.toLowerCase()));

  const copy = async (id: string, text: string) => {
    // 回填到剪贴板由后端命令处理（webview 下更可靠）
    await api.clipCopy(text).catch(() => undefined);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1200);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("clipboard.title")}</h1>
        <button className="btn-ghost" onClick={clear}>
          {t("clipboard.clear")}
        </button>
      </div>

      <input className="input" placeholder={t("common.search")} value={q} onChange={(e) => setQ(e.target.value)} />

      <div className="flex flex-col gap-2">
        {filtered.length === 0 && (
          <div className="card py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            {t("common.empty")}
          </div>
        )}
        {filtered.map((c) => (
          <div
            key={c.id}
            className="card flex items-center justify-between gap-4 !py-3"
            onClick={() => void copy(c.id, c.text)}
            style={{ cursor: "pointer" }}
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">{c.text}</div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                {new Date(c.at).toLocaleString()}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {copiedId === c.id && <span className="text-xs" style={{ color: "var(--accent)" }}>{t("clipboard.copied")}</span>}
              <button
                className="btn-ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  void pin(c.id, !c.pinned);
                }}
              >
                {c.pinned ? "📌" : t("clipboard.pin")}
              </button>
              <button
                className="btn-ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  void del(c.id);
                }}
              >
                {t("common.delete")}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
