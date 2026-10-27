import { useTranslation } from "react-i18next";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { useRuntime } from "../stores/runtime";

export function Monitor() {
  const { t } = useTranslation();
  const history = useRuntime((s) => s.monitorHistory);
  const current = useRuntime((s) => s.monitor);

  const memPct = current ? (current.memUsedMb / Math.max(current.memTotalMb, 1)) * 100 : 0;
  const data = history.map((h) => ({
    time: new Date(h.timestamp).toLocaleTimeString(),
    cpu: h.cpu,
    mem: (h.memUsedMb / Math.max(h.memTotalMb, 1)) * 100,
    netDown: h.netDownKbs,
  }));

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t("app.nav.monitor")}</h1>

      <div className="grid grid-cols-3 gap-4">
        <Stat label={t("monitor.cpu")} value={current ? `${current.cpu.toFixed(1)}%` : "—"} />
        <Stat label={t("monitor.mem")} value={current ? `${memPct.toFixed(1)}%` : "—"} sub={`${((current?.memUsedMb ?? 0) / 1024).toFixed(1)} / ${((current?.memTotalMb ?? 0) / 1024).toFixed(0)} GB`} />
        <Stat
          label={t("monitor.net")}
          value={current ? `↓ ${current.netDownKbs.toFixed(0)} KB/s` : "—"}
          sub={current ? `↑ ${current.netUpKbs.toFixed(0)} KB/s` : ""}
        />
      </div>

      <div className="card">
        <div className="mb-2 text-sm font-semibold">{t("monitor.cpu")} / {t("monitor.mem")}</div>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={11} />
            <YAxis domain={[0, 100]} stroke="var(--text-muted)" fontSize={11} />
            <Tooltip
              contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
            />
            <Line type="monotone" dataKey="cpu" name={t("monitor.cpu")} stroke="#0f766e" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="mem" name={t("monitor.mem")} stroke="#7c3aed" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card">
      <div className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {sub && <div className="text-xs" style={{ color: "var(--text-muted)" }}>{sub}</div>}
    </div>
  );
}
