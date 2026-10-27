import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSettings } from "../stores/settings";
import type { HotkeyConflict } from "../lib/tauri";
import { Modal, Field } from "../components/Modal";
import type { Hotkey, HotkeyAction } from "../lib/types";

const MODS = ["ctrl", "alt", "shift", "super"] as const;

export function Hotkeys() {
  const { t } = useTranslation();
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  const save = useSettings((s) => s.save);
  const [editing, setEditing] = useState<Hotkey | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [conflicts, setConflicts] = useState<HotkeyConflict[]>([]);

  const doSave = async () => {
    // 不要再调用 hotkey_set：它会用渲染期的旧数组覆盖最新设置。
    // 冲突信息由 save_settings 直接返回。
    const c = await save();
    setConflicts(c);
  };

  const openNew = () => {
    setEditing({
      id: `h-${Date.now()}`,
      name: "",
      modifiers: ["ctrl", "alt"],
      key: "K",
      action: { type: "exec", command: "notepad.exe" },
    });
    setIsNew(true);
  };

  const onEdit = (h: Hotkey) => {
    setEditing(h);
    setIsNew(false);
  };

  const onDelete = async (id: string) => {
    update((s) => {
      s.hotkeys = s.hotkeys.filter((h) => h.id !== id);
    });
    await doSave();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("app.nav.hotkeys")}</h1>
        <div className="flex gap-2">
          <button className="btn-primary" onClick={openNew}>
            + {t("hotkeys.addNew")}
          </button>
          <button className="btn-ghost" onClick={doSave}>
            {t("common.save")}
          </button>
        </div>
      </div>

      {conflicts.length > 0 && (
        <div className="rounded-lg px-4 py-2 text-xs" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
          {t("hotkeys.conflict")}
          <ul className="mt-1 list-inside list-disc">
            {conflicts.map(([id, reason]) => {
            const hk = settings.hotkeys.find((h) => h.id === id);
            const label = hk ? [...hk.modifiers, hk.key].join(" + ").toUpperCase() : id;
            return (
              <li key={id}>
                <code>{label}</code> — {reason}
              </li>
            );
          })}
          </ul>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ color: "var(--text-muted)" }}>
              <th className="pb-2 text-left font-medium">{t("hotkeys.name")}</th>
              <th className="pb-2 text-left font-medium">{t("hotkeys.combination")}</th>
              <th className="pb-2 text-left font-medium">{t("hotkeys.action")}</th>
              <th className="pb-2 text-right font-medium"> </th>
            </tr>
          </thead>
          <tbody>
            {settings.hotkeys.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center" style={{ color: "var(--text-muted)" }}>
                  {t("common.empty")}
                </td>
              </tr>
            )}
            {settings.hotkeys.map((h) => (
              <tr key={h.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="py-2">{h.name || h.key}</td>
                <td className="py-2">
                  <code className="rounded px-2 py-0.5 text-xs" style={{ background: "var(--surface-2)" }}>
                    {[...h.modifiers, h.key].join(" + ").toUpperCase()}
                  </code>
                </td>
                <td className="py-2" style={{ color: "var(--text-muted)" }}>
                  {describeAction(h.action)}
                </td>
                <td className="py-2 text-right">
                  <button className="btn-ghost mr-1" onClick={() => onEdit(h)}>
                    {t("common.edit")}
                  </button>
                  <button className="btn-ghost" onClick={() => onDelete(h.id)}>
                    {t("common.delete")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <HotkeyEditor
          hotkey={editing}
          isNew={isNew}
          onClose={() => setEditing(null)}
          onCommit={(hk) => {
            update((s) => {
              if (isNew) s.hotkeys.push(hk);
              else s.hotkeys = s.hotkeys.map((x) => (x.id === hk.id ? hk : x));
            });
            setEditing(null);
            void doSave();
          }}
        />
      )}
    </div>
  );
}

function describeAction(a: HotkeyAction): string {
  switch (a.type) {
    case "exec":
      return `${a.command ?? ""} ${(a.args ?? []).join(" ")}`.trim();
    case "url":
      return a.url ?? "";
    case "internal":
      return `#${a.target ?? ""}`;
  }
}

function HotkeyEditor({
  hotkey,
  isNew,
  onClose,
  onCommit,
}: {
  hotkey: Hotkey;
  isNew: boolean;
  onClose: () => void;
  onCommit: (h: Hotkey) => void;
}) {
  const { t } = useTranslation();
  const [h, setH] = useState<Hotkey>({ ...hotkey, modifiers: [...hotkey.modifiers] });
  const [actionType, setActionType] = useState<HotkeyAction["type"]>(h.action.type);

  const toggleMod = (m: string) => {
    setH((prev) => ({
      ...prev,
      modifiers: prev.modifiers.includes(m)
        ? prev.modifiers.filter((x) => x !== m)
        : [...prev.modifiers, m],
    }));
  };

  const commit = () => {
    const action: HotkeyAction =
      actionType === "internal"
        ? { type: "internal", target: h.action.target ?? "launcher" }
        : actionType === "url"
          ? { type: "url", url: h.action.url ?? "https://" }
          : { type: "exec", command: h.action.command ?? "", args: h.action.args ?? [] };
    onCommit({ ...h, action });
  };

  return (
    <Modal
      title={isNew ? t("hotkeys.addNew") : t("common.edit")}
      onClose={onClose}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button className="btn-primary" onClick={commit}>
            {t("common.confirm")}
          </button>
        </>
      }
    >
      <Field label={t("hotkeys.name")}>
        <input className="input w-full" value={h.name} onChange={(e) => setH({ ...h, name: e.target.value })} />
      </Field>
      <Field label={t("hotkeys.combination")}>
        <div className="flex gap-2">
          {MODS.map((m) => (
            <button
              key={m}
              className="btn-ghost"
              style={{
                background: h.modifiers.includes(m) ? "var(--accent-soft)" : "var(--surface-2)",
                color: h.modifiers.includes(m) ? "var(--accent)" : "var(--text)",
              }}
              onClick={() => toggleMod(m)}
            >
              {m}
            </button>
          ))}
          <input
            className="input w-16 text-center"
            maxLength={1}
            value={h.key}
            onChange={(e) => setH({ ...h, key: e.target.value.toUpperCase() })}
          />
        </div>
      </Field>
      <Field label={t("hotkeys.action")}>
        <select
          className="input w-full"
          value={actionType}
          onChange={(e) => setActionType(e.target.value as HotkeyAction["type"])}
        >
          <option value="exec">命令</option>
          <option value="url">URL</option>
          <option value="internal">内部功能</option>
        </select>
      </Field>
      {actionType === "exec" && (
        <Field label="命令">
          <input
            className="input w-full"
            value={h.action.command ?? ""}
            onChange={(e) => setH({ ...h, action: { ...h.action, command: e.target.value } })}
          />
        </Field>
      )}
      {actionType === "url" && (
        <Field label="URL">
          <input
            className="input w-full"
            value={h.action.url ?? ""}
            onChange={(e) => setH({ ...h, action: { ...h.action, url: e.target.value } })}
          />
        </Field>
      )}
      {actionType === "internal" && (
        <Field label="内部功能">
          <select
            className="input w-full"
            value={h.action.target ?? "launcher"}
            onChange={(e) => setH({ ...h, action: { ...h.action, target: e.target.value } })}
          >
            <option value="launcher">快速启动面板</option>
            <option value="pomodoro-toggle">番茄钟 开始/暂停</option>
            <option value="clipboard">剪贴板面板</option>
          </select>
        </Field>
      )}
    </Modal>
  );
}
