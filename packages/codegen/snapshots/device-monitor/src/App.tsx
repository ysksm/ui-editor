import { BrowserRouter } from "react-router";
import { DialogHost } from "./dialogs/DialogHost";
import { AppRoutes } from "./routes";

export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
      <DialogHost />
    </BrowserRouter>
  );
}
