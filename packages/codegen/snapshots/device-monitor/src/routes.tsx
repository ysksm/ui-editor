import { Navigate, Route, Routes } from "react-router";
import { paths } from "./paths";
import { DashboardScreen } from "./screens/DashboardScreen";
import { DeviceSettingsScreen } from "./screens/DeviceSettingsScreen";
import { DevicesScreen } from "./screens/DevicesScreen";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<DashboardScreen />} />
      <Route path="/devices" element={<DevicesScreen />} />
      <Route path="/devices/:deviceId" element={<DeviceSettingsScreen />} />
      <Route path="*" element={<Navigate to={paths.dashboard()} replace />} />
    </Routes>
  );
}
