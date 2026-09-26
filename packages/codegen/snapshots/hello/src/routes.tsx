import { Navigate, Route, Routes } from "react-router";
import { paths } from "./paths";
import { HomeScreen } from "./screens/HomeScreen";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomeScreen />} />
      <Route path="*" element={<Navigate to={paths.home()} replace />} />
    </Routes>
  );
}
