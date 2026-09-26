import { Puck, type Data } from "@puckeditor/core";
import { useState } from "react";
import { config } from "./puck/config.tsx";

/** 題材の画面（P0 の screens と同じ id）。 */
const SCREENS = [
  { id: "dashboard", label: "S1 ダッシュボード" },
  { id: "devices", label: "S2 機器一覧" },
  { id: "deviceSettings", label: "S3 機器設定" },
] as const;
type ScreenId = (typeof SCREENS)[number]["id"];

const emptyData = (): Data => ({ root: { props: {} }, content: [] });

export function App() {
  const [current, setCurrent] = useState<ScreenId>("dashboard");
  const [pages, setPages] = useState<Record<ScreenId, Data>>(() => ({
    dashboard: emptyData(),
    devices: emptyData(),
    deviceSettings: emptyData(),
  }));

  return (
    <div className="app">
      <nav className="app__tabs">
        {SCREENS.map((s) => (
          <button
            key={s.id}
            type="button"
            className="app__tab"
            aria-current={s.id === current}
            onClick={() => setCurrent(s.id)}
          >
            {s.label}
          </button>
        ))}
      </nav>
      <div className="app__editor">
        {/* Puck は data を初回だけ読むので、画面を切り替えたら key で作り直す */}
        <Puck
          key={current}
          config={config}
          data={pages[current]}
          onChange={(data) => setPages((prev) => ({ ...prev, [current]: data }))}
          headerTitle={SCREENS.find((s) => s.id === current)?.label}
          height="100%"
        />
      </div>
    </div>
  );
}
