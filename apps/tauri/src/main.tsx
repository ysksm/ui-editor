import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DesktopApp } from "./DesktopApp";
// P3 のエディタの見た目をそのまま使う
import "@ui-editor/editor-craft/src/styles.css";
import "./desktop.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DesktopApp />
  </StrictMode>,
);
