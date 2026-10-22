import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { Layout } from "./Layout";
import { DashboardScreen } from "./screens/DashboardScreen";
import { DevicesScreen } from "./screens/DevicesScreen";
import { DeviceDetailScreen } from "./screens/DeviceDetailScreen";

/** 画面のルート（1 画面 = 1 ルート）。最初の画面は「ダッシュボード」。 */
export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<DashboardScreen />} />
          <Route path="/devices" element={<DevicesScreen />} />
          <Route path="/devices/:deviceId" element={<DeviceDetailScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
