import { useTranslation } from "react-i18next";
import { useRuntime } from "../stores/runtime";
import { useSettings } from "../stores/settings";

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function Pomodoro() {
  const { t } = useTranslation();
  const pomodoro = useRuntime((s) => s.pomodoro);
  const start = useRuntime((s) => s.pomodoroStart);
  const pause = useRuntime((s) => s.pomodoroPause);
  const reset = useRuntime((s) => s.pomodoroReset);
  const pomoSet = useSettings((s) => s.settings.pomodoro);
  const update = useSettings((s) => s.update);
  const save = useSettings((s) => s.save);

  const phase = pomodoro?.phase ?? "idle";
  const running = pomodoro?.running ?? false;
  const remaining = pomodoro?.remainingSec ?? 0;

  const phaseLabel =
    phase === "work"
      ? t("pomodoro.work")
      : phase === "shortBreak"
        ? t("pomodoro.shortBreak")
        : phase === "longBreak"
          ? t("pomodoro.longBreak")
          : "—";

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{t("app.nav.pomodoro")}</h1>

      <div className="card flex flex-col items-center gap-4 py-10">
        <div className="text-xs uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
          {phaseLabel} {pomodoro?.cycle != null && pomodoro.cycle > 0 && `· ${t("pomodoro.cycle")} ${pomodoro.cycle}`}
        </div>
        <div className="text-6xl font-bold tabular-nums">{fmt(remaining)}</div>
        <div className="flex gap-2">
          {!running ? (
            <button className="btn-primary" onClick={() => start(phase === "idle" ? "work" : phase)}>
              {t("pomodoro.start")}
            </button>
          ) : (
            <button className="btn-primary" onClick={pause}>
              {t("pomodoro.pause")}
            </button>
          )}
          <button className="btn-ghost" onClick={reset}>
            {t("pomodoro.reset")}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="mb-4 text-sm font-semibold">参数</div>
        <div className="grid grid-cols-2 gap-4">
          {(
            [
              ["workMin", t("pomodoro.work")],
              ["shortBreakMin", t("pomodoro.shortBreak")],
              ["longBreakMin", t("pomodoro.longBreak")],
              ["cyclesBeforeLong", "长休息间隔周期"],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="flex items-center justify-between text-sm">
              <span style={{ color: "var(--text-muted)" }}>{label} (分钟)</span>
              <input
                className="input w-20 text-right"
                type="number"
                min={1}
                value={pomoSet[k] as number}
                onChange={(e) =>
                  update((s) => {
                    (s.pomodoro as unknown as Record<string, number>)[k] = Number(e.target.value);
                  })
                }
              />
            </label>
          ))}
          <label className="col-span-2 flex items-center justify-between text-sm">
            <span style={{ color: "var(--text-muted)" }}>自动开始下一段</span>
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={pomoSet.autoNext}
              onChange={(e) => update((s) => { s.pomodoro.autoNext = e.target.checked; })}
            />
          </label>
        </div>
        <div className="mt-4 flex justify-end">
          <button className="btn-ghost" onClick={() => void save()}>
            {t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
