import { useTranslation } from "react-i18next";

export function Home() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{t("home.welcome")}</h1>
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        {t("home.subtitle")}
      </p>
      <div className="card">
        <div className="text-sm font-semibold">DeskCharger 2</div>
        <div className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
          {t("home.hint")}
        </div>
      </div>
    </div>
  );
}
