import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@puckeditor/core/puck.css";
import "./parts/parts.css";
import "./App.css";
import { App } from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
