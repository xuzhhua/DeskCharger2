import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSettings } from "../stores/settings";
import { Modal, Field } from "../components/Modal";
import { Toggle } from "../components/Toggle";
import type { Reminder, ReminderAction, ReminderSchedule } from "../lib/types";

export function Reminders() {
  const { t } = useTranslation();
  const settings = useSettings((s) => s.settings);
  const update = useSettings((s) => s.update);
  const save = useSettings((s) => s.save);
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [isNew, setIsNew] = useState(false);

  const doSave = async () => {
    // save_settings 已包含提醒在内的全量持久化，无需再单独调 reminder_save
    await save();
  };

  const openNew = () => {
    setEditing({
      id: `r-${Date.now()}`,
      name: "",
      schedule: { type: "daily", time: "09:00" },
      repeatTimes: 0,
      repeatIntervalSec: 0,
      action: { type: "notify", title: "提醒", body: "", sound: true },
      enabled: true,
    });
    setIsNew(true);
  };

  const onDelete = async (id: string) => {
    update((s) => {
      s.reminders = s.reminders.filter((r) => r.id !== id);
    });
    await doSave();
  };

  const onToggle = async (id: string, enabled: boolean) => {
    update((s) => {
      s.reminders = s.reminders.map((r) => (r.id === id ? { ...r, enabled } : r));
    });
    await doSave();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("app.nav.reminders")}</h1>
        <div className="flex gap-2">
          <button className="btn-primary" onClick={openNew}>
            + {t("reminders.addNew")}
          </button>
          <button className="btn-ghost" onClick={doSave}>
            {t("common.save")}
          </button>
        </div>
      </div>

      <div className="card flex flex-col gap-2">
        {settings.reminders.length === 0 && (
          <div className="py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            {t("common.empty")}
          </div>
        )}
        {settings.reminders.map((r) => (
          <div
            key={r.id}
            className="flex items-center justify-between rounded-lg border px-4 py-3"
            style={{ borderColor: "var(--border)" }}
          >
            <div>
              <div className="text-sm font-medium">{r.name || describeSchedule(r.schedule)}</div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                {describeSchedule(r.schedule)} · {describeAction(r.action)}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Toggle checked={r.enabled} onChange={(v) => onToggle(r.id, v)} />
              <button className="btn-ghost" onClick={() => { setEditing(r); setIsNew(false); }}>
                {t("common.edit")}
              </button>
              <button className="btn-ghost" onClick={() => onDelete(r.id)}>
                {t("common.delete")}
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <ReminderEditor
          reminder={editing}
          isNew={isNew}
          onClose={() => setEditing(null)}
          onCommit={(r) => {
            update((s) => {
              if (isNew) s.reminders.push(r);
              else s.reminders = s.reminders.map((x) => (x.id === r.id ? r : x));
            });
            setEditing(null);
            void doSave();
          }}
        />
      )}
    </div>
  );
}

function describeSchedule(s: ReminderSchedule): string {
  if (s.type === "once") return `${s.date} ${s.time}`;
  if (s.type === "daily") return `每天 ${s.time}`;
  return `每周[${s.weekdays.join(",")}] ${s.time}`;
}

function describeAction(a: ReminderAction): string {
  switch (a.type) {
    case "notify":
      return `${a.title}: ${a.body}`;
    case "exec":
      return a.command;
    case "sysaction":
      return `系统: ${a.code}`;
    case "url":
      return a.url;
  }
}

function ReminderEditor({
  reminder,
  isNew,
  onClose,
  onCommit,
}: {
  reminder: Reminder;
  isNew: boolean;
  onClose: () => void;
  onCommit: (r: Reminder) => void;
}) {
  const { t } = useTranslation();
  const [r, setR] = useState<Reminder>(() => structuredClone(reminder));
  const [actionType, setActionType] = useState<ReminderAction["type"]>(r.action.type);
  const [scheduleType, setScheduleType] = useState<ReminderSchedule["type"]>(r.schedule.type);

  const commit = () => {
    const schedule: ReminderSchedule =
      scheduleType === "once"
        ? { type: "once", date: (r.schedule as { date?: string }).date ?? "2026-01-01", time: r.schedule.time }
        : scheduleType === "weekly"
          ? { type: "weekly", weekdays: (r.schedule as { weekdays?: number[] }).weekdays ?? [1, 2, 3, 4, 5], time: r.schedule.time }
          : { type: "daily", time: r.schedule.time };

    const action: ReminderAction =
      actionType === "notify"
        ? { type: "notify", title: (r.action as { title?: string }).title ?? "", body: (r.action as { body?: string }).body ?? "", sound: true }
        : actionType === "exec"
          ? { type: "exec", command: (r.action as { command?: string }).command ?? "", args: [] }
          : actionType === "url"
            ? { type: "url", url: (r.action as { url?: string }).url ?? "https://" }
            : { type: "sysaction", code: (r.action as { code?: string }).code ?? "notify" };
    onCommit({ ...r, schedule, action });
  };

  return (
    <Modal
      title={isNew ? t("reminders.addNew") : t("common.edit")}
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
      <Field label={t("reminders.name")}>
        <input className="input w-full" value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} />
      </Field>
      <Field label={t("reminders.schedule")}>
        <select
          className="input w-full"
          value={scheduleType}
          onChange={(e) => setScheduleType(e.target.value as ReminderSchedule["type"])}
        >
          <option value="daily">每天</option>
          <option value="once">单次</option>
          <option value="weekly">每周</option>
        </select>
      </Field>
      {scheduleType === "once" && (
        <Field label="日期">
          <input
            className="input w-full"
            type="date"
            value={(r.schedule as { date?: string }).date ?? "2026-01-01"}
            onChange={(e) => setR({ ...r, schedule: { ...r.schedule, date: e.target.value } as ReminderSchedule })}
          />
        </Field>
      )}
      <Field label={t("reminders.time")}>
        <input
          className="input w-full"
          type="time"
          value={r.schedule.time}
          onChange={(e) => setR({ ...r, schedule: { ...r.schedule, time: e.target.value } as ReminderSchedule })}
        />
      </Field>
      <div className="flex gap-4">
        <Field label={t("reminders.repeat")}>
          <input
            className="input w-24"
            type="number"
            min={0}
            value={r.repeatTimes}
            onChange={(e) => setR({ ...r, repeatTimes: Number(e.target.value) })}
          />
        </Field>
        <Field label={t("reminders.interval")}>
          <input
            className="input w-28"
            type="number"
            min={0}
            value={r.repeatIntervalSec}
            onChange={(e) => setR({ ...r, repeatIntervalSec: Number(e.target.value) })}
          />
        </Field>
      </div>
      <Field label={t("reminders.action")}>
        <select
          className="input w-full"
          value={actionType}
          onChange={(e) => setActionType(e.target.value as ReminderAction["type"])}
        >
          <option value="notify">通知</option>
          <option value="exec">执行程序</option>
          <option value="sysaction">系统动作</option>
          <option value="url">打开 URL</option>
        </select>
      </Field>
      {actionType === "notify" && (
        <>
          <Field label="标题">
            <input className="input w-full" value={(r.action as { title?: string }).title ?? ""}
              onChange={(e) => setR({ ...r, action: { ...r.action, title: e.target.value } as ReminderAction })} />
          </Field>
          <Field label="内容">
            <input className="input w-full" value={(r.action as { body?: string }).body ?? ""}
              onChange={(e) => setR({ ...r, action: { ...r.action, body: e.target.value } as ReminderAction })} />
          </Field>
        </>
      )}
      {actionType === "exec" && (
        <Field label="命令">
          <input className="input w-full" value={(r.action as { command?: string }).command ?? ""}
            onChange={(e) => setR({ ...r, action: { ...r.action, command: e.target.value } as ReminderAction })} />
        </Field>
      )}
      {actionType === "url" && (
        <Field label="URL">
          <input className="input w-full" value={(r.action as { url?: string }).url ?? ""}
            onChange={(e) => setR({ ...r, action: { ...r.action, url: e.target.value } as ReminderAction })} />
        </Field>
      )}
      {actionType === "sysaction" && (
        <Field label="系统动作">
          <select className="input w-full" value={(r.action as { code?: string }).code ?? "notify"}
            onChange={(e) => setR({ ...r, action: { ...r.action, code: e.target.value } as ReminderAction })}>
            <option value="sleep">休眠</option>
            <option value="shutdown">关机</option>
            <option value="restart">重启</option>
            <option value="logoff">注销</option>
          </select>
        </Field>
      )}
    </Modal>
  );
}
